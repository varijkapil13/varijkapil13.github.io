---
title: "Migrating from GlassFish to Payara Server"
description: "Lessons learned from migrating enterprise Java applications from GlassFish to Payara Server in production."
date: 2021-02-20
tags: ["java", "payara", "glassfish", "enterprise"]
---

When GlassFish development slowed and commercial support became uncertain, we migrated our enterprise applications to Payara Server. Here's how we did it and what we learned.

## Why Payara?

Payara Server is a fork of GlassFish with:

- **Active development** - Regular releases with bug fixes and features
- **Commercial support** - Available when you need it
- **Production enhancements** - Request tracing, health checks, cloud connectors
- **Jakarta EE certified** - Payara 6 supports Jakarta EE 10

## Migration Assessment

First, we inventoried our applications:

- 5 WAR applications
- 15 EJB modules
- Custom JDBC connection pools
- JMS queues and topics
- JAAS security realms
- Scheduled timers

## Migration Steps

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

### 2. Export GlassFish Configuration

```bash
# Export domain configuration
asadmin export-sync-bundle --target=domain1 glassfish-config.zip

# Or manually copy domain.xml
cp glassfish5/glassfish/domains/domain1/config/domain.xml backup/
```

### 3. Configure Connection Pools

JDBC pool configuration translates directly:

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

### 4. JMS Configuration

If using OpenMQ (embedded JMS):

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

### 5. Security Realm Migration

Custom JAAS realms require attention:

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

### 6. Deploy Applications

```bash
# Deploy applications
asadmin deploy --name app1 --contextroot /app1 app1.war
asadmin deploy --name app2 --contextroot /app2 app2.war

# Enable if needed
asadmin enable app1
```

## Payara-Specific Enhancements

Take advantage of Payara features we didn't have in GlassFish:

### Request Tracing

```bash
# Enable request tracing
asadmin set-requesttracing-configuration --enabled=true \
    --thresholdValue=30 --thresholdUnit=SECONDS

# View traces
asadmin list-requesttraces
```

### Health Check Service

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

Externalize configuration:

```java
@Inject
@ConfigProperty(name = "app.feature.enabled", defaultValue = "false")
private boolean featureEnabled;

@Inject
@ConfigProperty(name = "app.api.timeout", defaultValue = "30")
private int apiTimeout;
```

Set via environment or system properties:
```bash
asadmin create-system-properties app.feature.enabled=true
# Or use environment variables
export APP_FEATURE_ENABLED=true
```

### Notification Service

```bash
# Configure Slack notifications
asadmin notification-slack-configure --enabled=true \
    --webhookUrl="https://hooks.slack.com/services/xxx"

# Set notification for health check events
asadmin set-healthcheck-service-notification --enabled=true \
    --notifier=slack-notifier
```

## Configuration Differences

### Thread Pools

```bash
# GlassFish default was often too small
# Payara: configure for your workload
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.max-thread-pool-size=200
asadmin set configs.config.server-config.thread-pools.thread-pool.http-thread-pool.min-thread-pool-size=10
```

### JVM Options

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

### Class Loading Issues

If you encounter class loading problems:

```bash
# Enable verbose class loading
asadmin create-jvm-options "-verbose:class"

# Check module access
asadmin create-jvm-options "--add-opens=java.base/java.util=ALL-UNNAMED"
```

### Database Connection Issues

```bash
# Test connection pool
asadmin ping-connection-pool AppPool

# Enable connection pool monitoring
asadmin set configs.config.server-config.monitoring-service.module-monitoring-levels.jdbc-connection-pool=HIGH
```

### Log Analysis

```bash
# Server logs
tail -f payara6/glassfish/domains/domain1/logs/server.log

# Enable fine logging for specific packages
asadmin set-log-levels com.mycompany=FINE
```

## Docker Deployment

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

## Performance Comparison

After migration and tuning:

| Metric | GlassFish 5 | Payara 6 |
|--------|-------------|----------|
| Startup time | 45s | 35s |
| Memory usage | 1.2GB | 1.1GB |
| Requests/sec | 2,500 | 3,200 |
| P99 latency | 85ms | 62ms |

## Key Takeaways

1. **Migration is straightforward** - Most GlassFish configs work directly
2. **Take advantage of new features** - Health checks, request tracing, MicroProfile
3. **Test thoroughly** - Especially security realms and JMS
4. **Plan for downtime** - Migration requires application restart
5. **Update to Jakarta EE** - Payara 6 requires Jakarta namespace

The migration gave us a more stable, better-supported platform with modern features. The effort was worth it for the improved production experience.
