---
title: "Migrating from GlassFish to Payara Server"
description: "How we moved our enterprise Java applications from GlassFish to Payara Server in production, what carried over unchanged, where we had to be careful, and what we got in return."
date: 2021-02-20
image: "/images/blog/payara-glassfish-migration.jpg"
series: "monolith-to-saas"
seriesLabel: "GlassFish → Payara"
tags: ["java", "payara", "glassfish", "enterprise"]
---

For years our enterprise applications ran on GlassFish. If you haven't come across it, GlassFish is a Java EE application server: a large program that you start once and that then hosts your applications, giving them everything they need around the business code, such as database connections, transactions, messaging, security and scheduled jobs. GlassFish was also the reference implementation of Java EE, the server that showed how the specifications were meant to work, so for a long time it felt like the obvious choice.

That changed when GlassFish development slowed and commercial support became uncertain. An application server sits underneath everything you run, and "uncertain" is not a word you want next to it. When a security issue or a bad bug turns up in the server, you need someone to fix it, and you need to know the fix will arrive. So we decided to move our applications to Payara Server. This post is the story of that move: what we had to carry over, what came across almost unchanged, where we had to slow down, and what we got out of it in the end.

## Why Payara

The main reason was that Payara is a fork of GlassFish. The Payara developers took the GlassFish source code and kept developing it themselves, which meant Payara still understood the same configuration, the same admin commands and the same deployment model our team already knew. We weren't learning a new server so much as moving to a maintained version of the one we had.

On top of that shared base, Payara gets regular releases with bug fixes and new features, and you can buy commercial support if you need it, which answered exactly the worry that started all this. It also adds production features GlassFish never had, such as request tracing, health checks and cloud connectors. Payara 6 is certified for Jakarta EE 10, and that last detail has consequences for your code, which I'll come back to at the end.

## Taking inventory

Before changing anything, we wrote down what was actually running on GlassFish, because every item would need a home on the new server:

- 5 WAR applications
- 15 EJB modules
- Custom JDBC connection pools
- JMS queues and topics
- JAAS security realms
- Scheduled timers

If some of these terms are new to you: a WAR file is a packaged web application that you deploy into the server, and EJB modules contain Enterprise JavaBeans, the older Java EE component model that gives your code transactions, timers and similar services through annotations. Connection pools, JMS queues and security realms are a different kind of thing. They don't live inside the applications at all. They are resources that you configure in the server, and the applications only ask for them by name.

That split shaped the whole migration. The applications could mostly be deployed as they were, but the server resources had to be recreated on Payara one by one, so that is where most of the work went, and most of the steps below are about those resources.

## Installing Payara

The first step was to get Payara running on its own, before any of our applications came near it. Payara organizes its configuration into domains. A domain is a configured server with its own ports, resources, settings and deployed applications, and `domain1` is the default one that comes with a fresh installation. Everything is managed through `asadmin`, the command-line admin tool, which you'll see in almost every code block in this post.

```bash
# Download Payara 6 (Jakarta EE 10)
wget https://repo1.maven.org/maven2/fish/payara/distributions/payara/6.2024.1/payara-6.2024.1.zip
unzip payara-6.2024.1.zip

# Start domain
./payara6/bin/asadmin start-domain domain1

# Verify installation
./payara6/bin/asadmin list-applications
```

On a fresh domain, `list-applications` has nothing to list. That is the point: it is a cheap way to check that the server is up and that `asadmin` can talk to it before anything of ours is involved.

## Saving the GlassFish configuration

A domain keeps its entire configuration in one file, `domain.xml`: every pool, resource, realm, thread pool and JVM option ends up in there. Before touching anything, we made sure we had a copy of it, either through `asadmin` or by copying the file directly:

```bash
# Export domain configuration
asadmin export-sync-bundle --target=domain1 glassfish-config.zip

# Or manually copy domain.xml
cp glassfish5/glassfish/domains/domain1/config/domain.xml backup/
```

I'd always take the plain file copy, whatever else you do. Even when you recreate resources on the new server with commands instead of importing the old file, `domain.xml` is the reference you'll keep opening to check what a pool was called or how a realm was set up.

## Connection pools

Opening a database connection is slow. The driver has to reach the database over the network, authenticate, and set up a session, and doing that for every request would waste most of the request's time. So the application server keeps a pool of connections open and lends them out: a request borrows one, uses it, and gives it back. The application never sees the pool directly. It asks for a datasource by its JNDI name (JNDI is the directory in which the server registers resources under names like `jdbc/AppDS`), and the server hands it a connection from the pool behind that name.

As long as the new pool is registered under the same JNDI name, the application doesn't notice the server changed. JDBC pool configuration carries over almost one to one:

```bash
# Create PostgreSQL connection pool
asadmin create-jdbc-connection-pool \
    --datasourceclassname org.postgresql.ds.PGSimpleDataSource \
    --restype javax.sql.DataSource \
    --property serverName=localhost:databaseName=appdb:user=appuser:password=secret \
    AppPool

# Create JDBC resource
asadmin create-jdbc-resource --connectionpoolid AppPool jdbc/AppDS

# Configure pool sizing
asadmin set resources.jdbc-connection-pool.AppPool.steady-pool-size=10
asadmin set resources.jdbc-connection-pool.AppPool.max-pool-size=50
asadmin set resources.jdbc-connection-pool.AppPool.pool-resize-quantity=5
```

There are two steps here: the pool holds the connection settings, and the JDBC resource publishes that pool under the JNDI name. The three sizing settings at the end are worth understanding. `steady-pool-size` is how many connections the pool keeps open even when nothing is happening, so the first requests after a quiet period don't have to wait for new connections. `max-pool-size` is the ceiling, which protects the database from being flooded when traffic spikes. `pool-resize-quantity` is how many idle connections the pool closes in one step when it shrinks back toward the steady size after a busy period.

You may also notice that the resource type is still `javax.sql.DataSource`, even on a Jakarta EE 10 server where nearly everything else is `jakarta.*`. JDBC is part of the JDK itself and not of Java EE, so it never changed its package name. Seeing both namespaces side by side in one config confuses a lot of people the first time.

## JMS queues and topics

JMS is Java's standard API for messaging. One part of an application puts a message on a queue, and another part picks it up and processes it later, so slow work doesn't hold up the request that triggered it. A queue delivers each message to one consumer, while a topic delivers it to every subscriber. GlassFish and Payara come with OpenMQ, an embedded message broker that listens on port 7676 by default, which is the port you see in the connection factory below. If you use OpenMQ (the embedded JMS broker), the setup looks like this:

```bash
# Create connection factory
asadmin create-jms-resource --restype jakarta.jms.QueueConnectionFactory \
    --property imqBrokerHostName=localhost:imqBrokerHostPort=7676 \
    jms/ConnectionFactory

# Create queues
asadmin create-jms-resource --restype jakarta.jms.Queue \
    --property Name=OrderQueue \
    jms/OrderQueue
```

The pattern is the same as with the database. The connection factory is what the application uses to talk to the broker, and the queue resource maps the JNDI name `jms/OrderQueue` to a physical queue called `OrderQueue` inside the broker. Unlike JDBC, JMS belongs to Java EE, so here the types are already in the `jakarta` namespace.

## Security realms

Custom JAAS realms needed the most care. A realm is where the server looks up users, passwords and groups when someone logs in, and JAAS is Java's pluggable authentication framework that the realm plugs into. A JDBC realm reads all of that from database tables. The tricky part is that a mistake in a realm usually doesn't show up when you deploy. Everything starts fine, and then nobody can log in, or people log in with the wrong roles. Here is the JDBC realm we set up:

```bash
# Configure JDBC realm
asadmin create-auth-realm --classname com.sun.enterprise.security.auth.realm.jdbc.JDBCRealm \
    --property jaas-context=jdbcRealm:\
datasource-jndi=jdbc/AppDS:\
user-table=users:\
user-name-column=username:\
password-column=password:\
group-table=user_roles:\
group-name-column=role:\
digest-algorithm=SHA-256 \
    AppRealm
```

The realm reuses the `jdbc/AppDS` datasource from earlier, and the table and column properties tell it where to find users and their roles. The setting to get right is `digest-algorithm`. The passwords in the table are stored as SHA-256 hashes, and at login the realm hashes the password the user typed and compares the two. If the algorithm on the new server doesn't match the way the existing passwords were hashed, every login fails, even though every other part of the configuration is correct.

## Deploying the applications

With the resources in place, deploying was the easy part. The context root is the path under which an application is reachable, so `app1` answers under `/app1`:

```bash
# Deploy applications
asadmin deploy --name app1 --contextroot /app1 app1.war
asadmin deploy --name app2 --contextroot /app2 app2.war

# Enable if needed
asadmin enable app1
```

Applications are enabled by default when you deploy them, so the `enable` command only matters if one was deployed in a disabled state.

## Using what GlassFish didn't have

Once the applications ran, we turned on several Payara features that GlassFish didn't have. These were a big part of why the move felt worth it, because they made the server much easier to watch in production.

### Request tracing

Slow requests are hard to debug after the fact, because by the time someone reports them you can't reproduce what was going on. Request tracing records a detailed trace of any request that takes longer than a threshold, showing where the time went. We set the threshold to 30 seconds:

```bash
# Enable request tracing
asadmin set-requesttracing-configuration --enabled=true \
    --thresholdValue=30 --thresholdUnit=SECONDS

# View traces
asadmin list-requesttraces
```

### Health check service

The health check service has the server watch its own vital signs. We configured it for CPU usage and heap memory, with a warning at 70 percent and a critical alert at 90:

```bash
# Enable health checks
asadmin set-healthcheck-service-configuration --enabled=true

# Configure CPU check
asadmin healthcheck-configure --enabled=true --name=CPU_USAGE \
    --threshold-critical=90 --threshold-warning=70 --threshold-good=0

# Configure heap memory check
asadmin healthcheck-configure --enabled=true --name=HEAP_MEMORY_USAGE \
    --threshold-critical=90 --threshold-warning=70 --threshold-good=0
```

The heap check gives you warning before an `OutOfMemoryError`. When the heap stays close to full, the garbage collector runs more and more often and the application slows down long before it actually runs out of memory, so a warning at 70 percent leaves time to react.

### MicroProfile Config

MicroProfile is a set of specifications for building services on top of Jakarta EE, and Payara supports it. Its Config part lets you move settings out of the code. You inject a value by name, with a default for when nothing else is set:

```java
@Inject
@ConfigProperty(name = "app.feature.enabled", defaultValue = "false")
private boolean featureEnabled;

@Inject
@ConfigProperty(name = "app.api.timeout", defaultValue = "30")
private int apiTimeout;
```

You can then set values through system properties or environment variables. For environment variables, the property name is written in upper case with the dots replaced by underscores, so `app.feature.enabled` becomes `APP_FEATURE_ENABLED`:
```bash
asadmin create-system-properties app.feature.enabled=true
# Or use environment variables
export APP_FEATURE_ENABLED=true
```

This means the same build can run in every environment, with only the configuration around it changing.

### Notification service

Health checks and traces are only useful if someone sees them. The notification service sends these events somewhere people actually look, in our case Slack:

```bash
# Configure Slack notifications
asadmin notification-slack-configure --enabled=true \
    --webhookUrl="https://hooks.slack.com/services/xxx"

# Set notification for health check events
asadmin set-healthcheck-service-notification --enabled=true \
    --notifier=slack-notifier
```

## Settings we had to tune

A few settings that we had never looked at closely on GlassFish needed attention on Payara.

### Thread pools

Every incoming HTTP request is handled by a thread from the HTTP thread pool. When all threads are busy, new requests wait until one becomes free, so a pool that is too small makes the server look slow even when the CPU is mostly idle. The GlassFish default was often too small for us, and on Payara we sized the pool for our workload:

```bash
# GlassFish default was often too small
# Payara: configure for your workload
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.max-thread-pool-size=200
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.min-thread-pool-size=10
```

These numbers interact with the connection pool from earlier. With up to 200 request threads but at most 50 database connections, requests beyond the fiftieth that need the database will wait for a connection rather than for a thread. That is often what you want, since it keeps the database from being overloaded, but it's worth knowing where the queue forms when you look at a slow system.

### JVM options

The JVM settings live in the domain as well:

```bash
# Check current JVM options
asadmin list-jvm-options

# Add memory settings
asadmin create-jvm-options "-Xmx4g"
asadmin create-jvm-options "-Xms4g"
asadmin create-jvm-options "-XX:+UseG1GC"
asadmin create-jvm-options "-XX:MaxGCPauseMillis=200"

# For Jakarta EE 10 / Java 21
asadmin create-jvm-options "-XX:+UseZGC"
asadmin create-jvm-options "--add-opens=java.base/java.lang=ALL-UNNAMED"
```

Setting the minimum heap (`-Xms`) equal to the maximum (`-Xmx`) gives the JVM its full 4 GB from the start, so it doesn't spend time growing the heap under load. G1 is a garbage collector that tries to keep pauses below the target you give it, here 200 milliseconds. The last block is for Java 21, where ZGC, a collector built for very short pauses, is an option. Treat it as an alternative to the G1 lines: the JVM refuses to start if more than one collector is selected.

The `--add-opens` option is about the Java module system. Since Java 9, the JDK is split into modules that hide their internals, and libraries that use reflection to reach into packages like `java.lang` fail with access errors unless that package is opened explicitly. `ALL-UNNAMED` opens it to all code on the classpath, which in an application server means your applications and their libraries.

## When things go wrong

Most of the migration went smoothly, but these are the tools to reach for when it doesn't.

### Class loading issues

An application server loads classes through several class loaders: one for the server, one per application, and so on. That makes it possible to end up with two versions of the same library, or with a class coming from a different JAR than you expected, and the result is errors like `ClassNotFoundException` or `NoSuchMethodError` that make little sense at first glance. If you run into class loading problems:

```bash
# Enable verbose class loading
asadmin create-jvm-options "-verbose:class"

# Check module access
asadmin create-jvm-options "--add-opens=java.base/java.util=ALL-UNNAMED"
```

`-verbose:class` logs every class as it is loaded, together with where it came from, which usually shows quickly which JAR won. The second option is the same module-system fix as above, for libraries that reflect into `java.util`.

### Database connection issues

When an application can't reach the database, the first question is whether the problem is in the application or in the pool. `ping-connection-pool` answers that by opening a connection with the pool's settings and reporting whether it worked. If the ping fails, the problem is the host, the credentials or the driver, not your code:

```bash
# Test connection pool
asadmin ping-connection-pool AppPool

# Enable connection pool monitoring
asadmin set configs.config.server-config.monitoring-service.module-monitoring-levels.jdbc-connection-pool=HIGH
```

With monitoring at `HIGH`, the server collects statistics about the pool, such as how many connections are in use and whether requests are waiting for one.

### Log analysis

And when all else fails, there is the server log, with finer logging switched on only for your own packages so that the server's own output doesn't drown it:

```bash
# Server logs
tail -f payara6/glassfish/domains/domain1/logs/server.log

# Enable fine logging for specific packages
asadmin set-log-levels com.mycompany=FINE
```

## Running Payara in Docker

Everything above is a sequence of commands typed against a running server, and anything set up by hand is hard to repeat exactly. Payara provides official Docker images, which let you describe the configured server once and build it the same way every time:

```dockerfile
FROM payara/server-full:6.2024.1-jdk21

# Copy configuration
COPY domain.xml ${PAYARA_DIR}/glassfish/domains/domain1/config/

# Deploy application
COPY target/app.war ${DEPLOY_DIR}/

# Pre-boot commands
COPY pre-boot-commands.asadmin ${PREBOOT_COMMANDS}

# Post-boot commands for configuration
COPY post-boot-commands.asadmin ${POSTBOOT_COMMANDS}
```

The image knows two command files. Pre-boot commands run before the server starts, for settings that have to be in place at startup. Post-boot commands run against the started server, the same way you would type them into `asadmin`. Ours creates the connection pool from earlier:

`post-boot-commands.asadmin`:
```
create-jdbc-connection-pool --datasourceclassname=org.postgresql.ds.PGSimpleDataSource --restype=javax.sql.DataSource --property=serverName=${ENV=DB_HOST}:databaseName=${ENV=DB_NAME}:user=${ENV=DB_USER}:password=${ENV=DB_PASSWORD} AppPool
create-jdbc-resource --connectionpoolid=AppPool jdbc/AppDS
set resources.jdbc-connection-pool.AppPool.max-pool-size=50
```

The difference from the manual version is the `${ENV=...}` references. Payara replaces them with environment variables when the container starts, so one image can point at different databases, and no password is baked into the image.

## The numbers

These are our numbers after the migration and some tuning, so they reflect both the new server and the settings described above:

| Metric | GlassFish 5 | Payara 6 |
|--------|-------------|----------|
| Startup time | 45s | 35s |
| Memory usage | 1.2GB | 1.1GB |
| Requests/sec | 2,500 | 3,200 |
| P99 latency | 85ms | 62ms |

P99 latency is the time within which 99 percent of requests finish, which tells you more about how the slowest requests feel than an average does.

## What I'd tell someone starting this migration

Because Payara grew out of GlassFish, most GlassFish configuration works on Payara without changes, and the migration itself is not hard. The places I'd test most thoroughly are the security realms and JMS, since those are the parts where a small difference can stay hidden until someone logs in or a message goes missing. The move also needs an application restart, so plan for downtime instead of hoping to slip it in.

The one part that goes beyond configuration is the namespace. Payara 6 requires the Jakarta namespace, so the code has to move to Jakarta EE as part of the switch, and that is a migration of its own that deserves its own planning.

Once you're across, use the features GlassFish never had. For us, health checks, request tracing and MicroProfile Config changed how we ran production more than the server swap itself did. We ended up on a more stable, better supported platform with modern features, and production got easier to run, which made it worth the effort.
