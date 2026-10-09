---
title: "Database Connection Pooling Mistakes I've Made"
description: "Common connection pooling pitfalls and how to configure pools properly for production workloads."
date: 2020-05-18
tags: ["database", "postgresql", "java", "performance"]
---

Connection pooling seems simple until it isn't. I've crashed production systems with a badly sized pool and spent weekends chasing timeouts that turned out to be pool exhaustion. These are the mistakes I wish someone had warned me about.

## Mistake 1: pool too large

My first instinct when things got slow was to increase the pool size. More connections means more throughput, right?

It doesn't. PostgreSQL doesn't scale linearly with connections, and past about 100 concurrent connections performance degrades. Each connection uses memory, and the CPU spends time context switching between them.

The formula I use now:

```
connections = (cores * 2) + effective_spindle_count
```

For a 4-core server with SSDs, that's about 10 connections, a lot fewer than the 200 I used to configure.

## Mistake 2: pool too small

I've also made the opposite mistake. I once set a pool size of 5 for an application that had 20 concurrent request handlers. Under load, threads waited forever for connections.

```java
// HikariCP timeout defaults to 30 seconds
// After 30 seconds waiting, this throws
try (Connection conn = dataSource.getConnection()) {
    // ...
}
```

Match your pool size to your actual concurrency. If you have 20 threads that need database access, you need at least 20 connections (or accept that some threads will wait).

## Mistake 3: not setting timeouts

The default timeout settings are dangerous, so I always set these explicitly:

```yaml
# HikariCP settings I always configure
maximumPoolSize: 10
connectionTimeout: 10000    # 10 seconds to get connection
idleTimeout: 600000         # 10 minutes before closing idle
maxLifetime: 1800000        # 30 minutes max connection age
```

`connectionTimeout` matters most. Without it, pool exhaustion blocks threads indefinitely, and the blocked threads pile up into a full outage.

## Mistake 4: connection leaks

This one bit me hard. Our pool would drain slowly over several hours, and then everything failed at once. The cause was code that didn't close its connections properly.

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

Turn this on in development and it will find your leaks.

## Mistake 5: ignoring connection validation

Connections go stale. A network problem, a database restart or a firewall timeout can leave dead connections sitting in the pool.

I learned this the hard way after a database failover. The pool had connections to the old primary that silently failed.

```yaml
# Validate connections periodically
connectionTestQuery: SELECT 1
validationTimeout: 5000
```

HikariCP validates connections efficiently, but only if you enable it.

## Mistake 6: one pool for everything

We had one pool shared between transaction processing and reporting queries. Report queries were slow and held connections for seconds. Transaction queries were fast but starved for connections.

We fixed it by giving each workload its own pool:

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

The transaction pool fails fast when it can't get a connection, while reports are allowed to wait.

## Monitoring your pool

I export these pool metrics:

```java
HikariDataSource ds = (HikariDataSource) dataSource;
HikariPoolMXBean poolMXBean = ds.getHikariPoolMXBean();

// Metrics to track
int activeConnections = poolMXBean.getActiveConnections();
int idleConnections = poolMXBean.getIdleConnections();
int threadsAwaitingConnection = poolMXBean.getThreadsAwaitingConnection();
```

Alert when `threadsAwaitingConnection` is consistently above zero. That means your pool is too small or something is holding connections too long.

## My default configuration

After years of tuning, this is the HikariCP config I start from:

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

I keep it conservative at first and adjust once I have real metrics.

## Don't share pools across applications

Don't share pools across unrelated applications. Each application should have its own pool with its own limits. Otherwise, one misbehaving app can exhaust connections for everyone.

It sounds obvious, but I've seen shared database users with no per-application limits cause outages more than once.
