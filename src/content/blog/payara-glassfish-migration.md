---
title: "Migrating from GlassFish to Payara Server"
description: "Lessons learned from migrating enterprise Java applications from GlassFish to Payara Server in production."
date: 2021-02-20
image: "/images/blog/payara-glassfish-migration.jpg"
series: "monolith-to-saas"
tags: ["java", "payara", "glassfish", "enterprise"]
---

When GlassFish development slowed and commercial support became uncertain, we migrated our enterprise applications to Payara Server. This post covers the steps we took and what we ran into along the way.

## Why Payara?

Payara Server is a fork of GlassFish. It gets regular releases with bug fixes and new features, and you can buy commercial support if you need it. It also adds production features GlassFish never had, such as request tracing, health checks, and cloud connectors. Payara 6 is certified for Jakarta EE 10.

## Migration assessment

We started by taking inventory of what we had:

- 5 WAR applications
- 15 EJB modules
- Custom JDBC connection pools
- JMS queues and topics
- JAAS security realms
- Scheduled timers

## Migration steps

### 1. Install Payara Server

```bash
# Download Payara 6 (Jakarta EE 10)
wget https://repo1.maven.org/maven2/fish/payara/distributions/payara/6.2024.1/payara-6.2024.1.zip
unzip payara-6.2024.1.zip

# Start domain
./payara6/bin/asadmin start-domain domain1

# Verify installation
./payara6/bin/asadmin list-applications
```

### 2. Export the GlassFish configuration

```bash
# Export domain configuration
asadmin export-sync-bundle --target=domain1 glassfish-config.zip

# Or manually copy domain.xml
cp glassfish5/glassfish/domains/domain1/config/domain.xml backup/
```

### 3. Configure connection pools

JDBC pool configuration carries over almost one to one:

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

### 4. Configure JMS

If you use OpenMQ (the embedded JMS broker):

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

### 5. Migrate security realms

Custom JAAS realms needed the most care. Here is the JDBC realm we set up:

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

### 6. Deploy the applications

```bash
# Deploy applications
asadmin deploy --name app1 --contextroot /app1 app1.war
asadmin deploy --name app2 --contextroot /app2 app2.war

# Enable if needed
asadmin enable app1
```

## Payara-specific features

Once the applications ran, we turned on several Payara features that GlassFish didn't have.

### Request tracing

```bash
# Enable request tracing
asadmin set-requesttracing-configuration --enabled=true \
    --thresholdValue=30 --thresholdUnit=SECONDS

# View traces
asadmin list-requesttraces
```

### Health check service

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

### MicroProfile Config

MicroProfile Config lets you move settings out of the code:

```java
@Inject
@ConfigProperty(name = "app.feature.enabled", defaultValue = "false")
private boolean featureEnabled;

@Inject
@ConfigProperty(name = "app.api.timeout", defaultValue = "30")
private int apiTimeout;
```

You can then set values through system properties or environment variables:
```bash
asadmin create-system-properties app.feature.enabled=true
# Or use environment variables
export APP_FEATURE_ENABLED=true
```

### Notification service

```bash
# Configure Slack notifications
asadmin notification-slack-configure --enabled=true \
    --webhookUrl="https://hooks.slack.com/services/xxx"

# Set notification for health check events
asadmin set-healthcheck-service-notification --enabled=true \
    --notifier=slack-notifier
```

## Configuration differences

### Thread pools

```bash
# GlassFish default was often too small
# Payara: configure for your workload
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.max-thread-pool-size=200
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.min-thread-pool-size=10
```

### JVM options

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

## Troubleshooting

### Class loading issues

If you run into class loading problems:

```bash
# Enable verbose class loading
asadmin create-jvm-options "-verbose:class"

# Check module access
asadmin create-jvm-options "--add-opens=java.base/java.util=ALL-UNNAMED"
```

### Database connection issues

```bash
# Test connection pool
asadmin ping-connection-pool AppPool

# Enable connection pool monitoring
asadmin set configs.config.server-config.monitoring-service.module-monitoring-levels.jdbc-connection-pool=HIGH
```

### Log analysis

```bash
# Server logs
tail -f payara6/glassfish/domains/domain1/logs/server.log

# Enable fine logging for specific packages
asadmin set-log-levels com.mycompany=FINE
```

## Docker deployment

Payara provides official Docker images:

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

`post-boot-commands.asadmin`:
```
create-jdbc-connection-pool --datasourceclassname=org.postgresql.ds.PGSimpleDataSource --restype=javax.sql.DataSource --property=serverName=${ENV=DB_HOST}:databaseName=${ENV=DB_NAME}:user=${ENV=DB_USER}:password=${ENV=DB_PASSWORD} AppPool
create-jdbc-resource --connectionpoolid=AppPool jdbc/AppDS
set resources.jdbc-connection-pool.AppPool.max-pool-size=50
```

## Performance comparison

Our numbers after the migration and some tuning:

| Metric | GlassFish 5 | Payara 6 |
|--------|-------------|----------|
| Startup time | 45s | 35s |
| Memory usage | 1.2GB | 1.1GB |
| Requests/sec | 2,500 | 3,200 |
| P99 latency | 85ms | 62ms |

## What I'd tell someone starting this migration

Most GlassFish configuration works on Payara without changes, so the migration itself is not hard. Test thoroughly, especially security realms and JMS. The move needs an application restart, so plan for downtime. Payara 6 also requires the Jakarta namespace, so the code has to move to Jakarta EE as part of the switch.

After that, use the features GlassFish didn't have: health checks, request tracing, and MicroProfile Config. For us the result was a more stable, better supported platform with modern features, and production got easier to run. It was worth the effort.
