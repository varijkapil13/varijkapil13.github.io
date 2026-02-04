---
title: "Database Connection Pooling Mistakes I've Made"
description: "Common connection pooling pitfalls and how to configure pools properly for production workloads."
date: 2020-05-18
tags: ["database", "postgresql", "java", "performance"]
---

Connection pooling seems simple until it isn't. I've crashed production systems, debugged mysterious timeouts, and spent weekends fixing pool exhaustion issues. Here's what I wish I'd known earlier.

## Mistake 1: Pool Too Large

My first instinct when things got slow was to increase the pool size. More connections means more throughput, right?

Wrong. PostgreSQL doesn't scale linearly with connections. After about 100 concurrent connections, performance degrades. Each connection consumes memory and CPU for context switching.

The formula I use now:

```
connections = (cores * 2) + effective_spindle_count
```

For a 4-core server with SSDs, that's about 10 connections. Much smaller than the 200 I used to configure.

## Mistake 2: Pool Too Small

The opposite problem. I once set a pool size of 5 for an application that had 20 concurrent request handlers. Under load, threads waited forever for connections.

```java
// HikariCP timeout defaults to 30 seconds
// After 30 seconds waiting, this throws
try (Connection conn = dataSource.getConnection()) {
    // ...
}
```

Match your pool size to your actual concurrency. If you have 20 threads that need database access, you need at least 20 connections (or accept that some threads will wait).

## Mistake 3: Not Setting Timeouts

Default timeout settings are dangerous. Without explicit configuration:

```yaml
# HikariCP settings I always configure
maximumPoolSize: 10
connectionTimeout: 10000    # 10 seconds to get connection
idleTimeout: 600000         # 10 minutes before closing idle
maxLifetime: 1800000        # 30 minutes max connection age
```

The `connectionTimeout` is critical. Without it, a pool exhaustion issue blocks threads indefinitely, cascading into a full outage.

## Mistake 4: Connection Leaks

This one bit me hard. Our pool would slowly exhaust over hours, then suddenly everything failed.

The cause: code that didn't close connections properly.

```java
// BAD: Connection never closed if exception thrown
Connection conn = dataSource.getConnection();
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery("SELECT ...");
// Exception here means conn is never closed

// GOOD: try-with-resources ensures cleanup
try (Connection conn = dataSource.getConnection();
     Statement stmt = conn.createStatement();
     ResultSet rs = stmt.executeQuery("SELECT ...")) {
    // Process results
}
```

HikariCP has leak detection that logs warnings when connections aren't returned:

```yaml
leakDetectionThreshold: 60000  # Log if connection held > 60 seconds
```

Enable this in development. It will find your leaks.

## Mistake 5: Ignoring Connection Validation

Connections go stale. Network issues, database restarts, and firewall timeouts all can leave you with dead connections in the pool.

I learned this the hard way after a database failover. The pool had connections to the old primary that silently failed.

```yaml
# Validate connections periodically
connectionTestQuery: SELECT 1
validationTimeout: 5000
```

HikariCP is smart about this—it validates connections efficiently. But you need to enable it.

## Mistake 6: One Pool for Everything

We had one pool shared between transaction processing and reporting queries. Report queries were slow and held connections for seconds. Transaction queries were fast but starved for connections.

Solution: separate pools.

```java
@Bean("transactionDataSource")
public DataSource transactionDataSource() {
    HikariConfig config = new HikariConfig();
    config.setMaximumPoolSize(20);
    config.setConnectionTimeout(5000);  // Fast fail
    return new HikariDataSource(config);
}

@Bean("reportingDataSource")
public DataSource reportingDataSource() {
    HikariConfig config = new HikariConfig();
    config.setMaximumPoolSize(5);
    config.setConnectionTimeout(30000);  // Reports can wait
    return new HikariDataSource(config);
}
```

Different workloads need different configurations.

## Monitoring Your Pool

You can't fix what you can't see. I export these metrics:

```java
HikariDataSource ds = (HikariDataSource) dataSource;
HikariPoolMXBean poolMXBean = ds.getHikariPoolMXBean();

// Metrics to track
int activeConnections = poolMXBean.getActiveConnections();
int idleConnections = poolMXBean.getIdleConnections();
int threadsAwaitingConnection = poolMXBean.getThreadsAwaitingConnection();
```

Alert when `threadsAwaitingConnection` is consistently above zero. That means your pool is too small or something is holding connections too long.

## The Right Configuration

After years of tuning, here's my default HikariCP config:

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 10
      minimum-idle: 5
      connection-timeout: 10000
      idle-timeout: 600000
      max-lifetime: 1800000
      leak-detection-threshold: 60000
      connection-test-query: SELECT 1
```

Then I adjust based on actual metrics. Start conservative, monitor, and tune.

## One Last Thing

Don't share pools across unrelated applications. Each application should have its own pool with its own limits. Otherwise, one misbehaving app can exhaust connections for everyone.

This might seem obvious, but I've seen shared database users with no per-application limits cause outages more than once.
