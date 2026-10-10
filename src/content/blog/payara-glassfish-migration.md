---
title: "Migrating from GlassFish to Payara Server"
description: "How we moved our enterprise Java applications from GlassFish to Payara Server in production, what carried over unchanged, and where we had to be careful."
date: 2021-02-20
image: "/images/blog/payara-glassfish-migration.jpg"
series: "monolith-to-saas"
seriesLabel: "GlassFish → Payara"
tags: ["java", "payara", "glassfish", "enterprise"]
---

For years our enterprise applications ran on GlassFish, a Java EE application server. If you haven't worked with one, an application server is a large program that hosts your applications and provides everything around the business code: database connections, transactions, messaging, security and scheduled jobs. Because it sits underneath everything, you need to know that someone will fix it when a serious bug or security issue turns up. When GlassFish development slowed and commercial support became uncertain, we could no longer count on that, so we moved our applications to Payara Server. This is how that went.

## Why Payara

Payara is a fork of GlassFish: its developers took the GlassFish code and kept developing it. That meant the same configuration, the same admin commands and the same deployment model our team already knew, so we were moving to a maintained version of the server we had rather than learning a new one. Payara gets regular releases with bug fixes and new features, and you can buy commercial support if you need it. It also adds production features GlassFish never had, such as request tracing, health checks and cloud connectors. Payara 5 runs Java EE 8 and Jakarta EE 8 applications, which is what we had, so the code could stay as it was.

## What we had to move

We started by writing down what was running on GlassFish:

- 5 WAR applications
- 15 EJB modules
- Custom JDBC connection pools
- JMS queues and topics
- JAAS security realms
- Scheduled timers

The first two are code: WAR files are packaged web applications, and EJB modules hold Enterprise JavaBeans, the older Java EE component model. The rest are resources that live in the server's configuration, and applications only ask for them by name. That split decided where the work would be. The applications could mostly be deployed as they were, while every server resource had to be recreated on Payara.

## Setting up Payara

Payara groups its configuration into domains. A domain is a configured server with its own ports, resources and deployed applications, and `domain1` is the one a fresh installation comes with. Everything is managed through the `asadmin` command-line tool:

```bash
# Download Payara 5 (Jakarta EE 8)
wget https://repo1.maven.org/maven2/fish/payara/distributions/payara/5.2021.1/payara-5.2021.1.zip
unzip payara-5.2021.1.zip

# Start domain
./payara5/bin/asadmin start-domain domain1

# Verify installation
./payara5/bin/asadmin list-applications
```

On a fresh domain there are no applications to list, so this simply proves that the server is running and `asadmin` can reach it.

A domain's whole configuration lives in one file, `domain.xml`, so before changing anything we backed up the GlassFish domain and kept a separate copy of that file:

```bash
# Back up the whole domain (stop it first)
asadmin stop-domain domain1
asadmin backup-domain domain1

# Keep a copy of domain.xml as well
cp glassfish5/glassfish/domains/domain1/config/domain.xml backup/
```

Even if you recreate everything with commands, keep that copy. It is where you look up what a pool was called or how a realm was configured.

## Connection pools

Opening a database connection is slow, because the driver has to connect over the network and authenticate. The server therefore keeps a pool of open connections and lends them to requests. Applications never see the pool. They look up a datasource by its JNDI name (JNDI is the directory where the server registers resources under names like `jdbc/AppDS`), so as long as the new pool is published under the same name, the application doesn't notice the change of server. JDBC pool configuration carries over almost one to one:

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

The steady size is how many connections stay open when the system is quiet, the maximum protects the database during traffic spikes, and the resize quantity is how many idle connections are closed in one step when the pool shrinks again. The resource type is `javax.sql.DataSource`, the same as on GlassFish. JDBC belongs to the JDK, not to Java EE.

## JMS

JMS is Java's messaging API. One part of an application puts a message on a queue and another processes it later, so slow work doesn't hold up a request; a topic does the same but delivers each message to every subscriber. GlassFish and Payara include OpenMQ, an embedded broker that listens on port 7676 by default. If you use OpenMQ (the embedded JMS broker):

```bash
# Create connection factory
asadmin create-jms-resource --restype javax.jms.QueueConnectionFactory \
    --property imqBrokerHostName=localhost:imqBrokerHostPort=7676 \
    jms/ConnectionFactory

# Create queues
asadmin create-jms-resource --restype javax.jms.Queue \
    --property Name=OrderQueue \
    jms/OrderQueue
```

It's the same pattern as with the database: the application finds the connection factory and the queue by their JNDI names, and `jms/OrderQueue` points to the queue called `OrderQueue` inside the broker.

## Security realms

Custom JAAS realms needed the most care. A realm is where the server looks up users, passwords and roles at login, and JAAS is the Java authentication framework the realm plugs into. A broken realm doesn't stop anything from deploying; it shows up when people can't log in or get the wrong roles. Here is the JDBC realm we set up:

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

It reads users and roles through the `jdbc/AppDS` datasource from above. The setting to double-check is `digest-algorithm`: the realm hashes the password the user types and compares it with the stored hash, so if this doesn't match how the existing passwords were hashed, every login fails.

## Deploying

With the resources in place, deploying was the easy part. The context root is the URL path an application answers under:

```bash
# Deploy applications
asadmin deploy --name app1 --contextroot /app1 app1.war
asadmin deploy --name app2 --contextroot /app2 app2.war

# Enable if needed
asadmin enable app1
```

## What GlassFish didn't have

Once the applications ran, we turned on several Payara features that GlassFish didn't have, mostly to see more of what happened in production.

Request tracing records the details of any request slower than a threshold, which helps with slow requests that you can't reproduce later. We set it to 30 seconds:

```bash
# Enable request tracing
asadmin set-requesttracing-configuration --enabled=true \
    --thresholdValue=30 --thresholdUnit=SECONDS

# View traces
asadmin list-requesttraces
```

The health check service has the server watch its own CPU and heap usage, here with a warning at 70 percent and a critical alert at 90. A heap that stays nearly full makes the garbage collector run constantly, so the warning arrives well before an `OutOfMemoryError`:

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

MicroProfile, a set of specifications for services built on Jakarta EE, comes with Payara too. Its Config part lets you move settings out of the code: you inject a value by name, with a default for when nothing is set:

```java
@Inject
@ConfigProperty(name = "app.feature.enabled", defaultValue = "false")
private boolean featureEnabled;

@Inject
@ConfigProperty(name = "app.api.timeout", defaultValue = "30")
private int apiTimeout;
```

You can then set values through system properties or environment variables, where the name is upper-cased and the dots become underscores:
```bash
asadmin create-system-properties app.feature.enabled=true
# Or use environment variables
export APP_FEATURE_ENABLED=true
```

Health checks and traces only help if someone sees them, so the notification service sends them to Slack:

```bash
# Configure Slack notifications
asadmin notification-slack-configure --enabled=true \
    --webhookUrl="https://hooks.slack.com/services/xxx"

# Set notification for health check events
asadmin set-healthcheck-service-notification --enabled=true \
    --notifier=slack-notifier
```

## Settings worth revisiting

Each HTTP request is handled by a thread from a pool, and when all threads are busy, new requests wait. The GlassFish default was often too small for us, so we sized the Payara pool for our workload:

```bash
# GlassFish default was often too small
# Payara: configure for your workload
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.max-thread-pool-size=200
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.min-thread-pool-size=10
```

Keep the connection pool in mind when you do this. With 200 threads and at most 50 database connections, a busy server queues requests at the connection pool instead of the thread pool, which protects the database but is worth knowing when you investigate slowness.

The JVM options also live in the domain:

```bash
# Check current JVM options
asadmin list-jvm-options

# Add memory settings
asadmin create-jvm-options "-Xmx4g"
asadmin create-jvm-options "-Xms4g"
asadmin create-jvm-options "-XX:+UseG1GC"
asadmin create-jvm-options "-XX:MaxGCPauseMillis=200"

# Java 11 module access
asadmin create-jvm-options "--add-opens=java.base/java.lang=ALL-UNNAMED"
```

Setting the minimum and maximum heap to the same 4 GB means the JVM never spends time growing the heap under load. G1 is a garbage collector that aims to keep pauses under the target, here 200 milliseconds, and on Java 11 it is the default and the safe choice for production. `--add-opens` is for the module system that Java 9 introduced, which hides JDK internals from libraries that reach into them through reflection unless a package is explicitly opened.

## When something breaks

An application server loads classes through several class loaders, one for the server and one per application, so you can end up with two copies of a library or a class from an unexpected JAR. If you run into class loading problems:

```bash
# Enable verbose class loading
asadmin create-jvm-options "-verbose:class"

# Check module access
asadmin create-jvm-options "--add-opens=java.base/java.util=ALL-UNNAMED"
```

`-verbose:class` logs each class as it loads and where it came from, which usually shows which JAR won. For database problems, pinging the pool tells you whether the server can connect at all, which separates a wrong host or password from a bug in your code. Monitoring then shows how busy the pool is:

```bash
# Test connection pool
asadmin ping-connection-pool AppPool

# Enable connection pool monitoring
asadmin set configs.config.server-config.monitoring-service.module-monitoring-levels.jdbc-connection-pool=HIGH
```

And there is always the server log, with fine-grained logging turned on only for your own packages:

```bash
# Server logs
tail -f payara5/glassfish/domains/domain1/logs/server.log

# Enable fine logging for specific packages
asadmin set-log-levels com.mycompany=FINE
```

## Docker deployment

Everything above is a series of commands against a running server, which is hard to repeat exactly by hand. Payara provides official Docker images, so the configured server can be built the same way every time:

```dockerfile
FROM payara/server-full:5.2021.1-jdk11

# Copy configuration
COPY domain.xml ${PAYARA_DIR}/glassfish/domains/domain1/config/

# Deploy application
COPY target/app.war ${DEPLOY_DIR}/

# Pre-boot commands
COPY pre-boot-commands.asadmin ${PREBOOT_COMMANDS}

# Post-boot commands for configuration
COPY post-boot-commands.asadmin ${POSTBOOT_COMMANDS}
```

Pre-boot commands run before the server starts, post-boot commands against the started server. Ours recreate the connection pool, with `${ENV=...}` placeholders that Payara fills from environment variables, so the same image works against any database and holds no passwords:

`post-boot-commands.asadmin`:
```
create-jdbc-connection-pool --datasourceclassname=org.postgresql.ds.PGSimpleDataSource --restype=javax.sql.DataSource --property=serverName=${ENV=DB_HOST}:databaseName=${ENV=DB_NAME}:user=${ENV=DB_USER}:password=${ENV=DB_PASSWORD} AppPool
create-jdbc-resource --connectionpoolid=AppPool jdbc/AppDS
set resources.jdbc-connection-pool.AppPool.max-pool-size=50
```

## Before and after

These are our numbers after the migration and some tuning, so they reflect both the new server and the settings above. P99 latency is the time within which 99 percent of requests finish:

| Metric | GlassFish 5 | Payara 5 |
|--------|-------------|----------|
| Startup time | 45s | 35s |
| Memory usage | 1.2GB | 1.1GB |
| Requests/sec | 2,500 | 3,200 |
| P99 latency | 85ms | 62ms |

## What I'd tell someone starting this migration

Because Payara grew out of GlassFish, most GlassFish configuration works on it without changes, and the migration itself is not hard. I'd spend the testing time on security realms and JMS, where a mistake stays hidden until someone logs in or a message doesn't arrive. The move needs an application restart, so plan for downtime. Payara 5 still uses the `javax` namespace, so the code didn't have to change for the switch. Moving to the `jakarta` namespace came later and was a project of its own.

After that, use what GlassFish never had: health checks, request tracing and MicroProfile Config. For us the result was a more stable, better supported platform with modern features, and production got easier to run. It was worth the effort.
