---
title: "Database Connection Pooling Mistakes I've Made"
description: "The connection pooling mistakes that cost me outages and weekends, why each one happens, and how I configure pools for production now."
date: 2020-05-18
image: "/images/blog/database-connection-pooling.jpg"
tags: ["database", "postgresql", "java", "performance"]
---

Connection pooling seems simple until it isn't. Over the years I have crashed production systems with a badly sized pool, and I have spent weekends chasing timeouts that turned out to be pool exhaustion. Each of these mistakes came from a reasonable-sounding assumption, and each only showed itself under real load.

Opening a connection to a database like PostgreSQL is expensive. The client and server have to set up a network connection, authenticate, and agree on settings, and on the PostgreSQL side every connection gets its own server process. If an application opened a fresh connection for every request and closed it afterwards, it would spend a large part of its time just connecting. A connection pool solves this by opening a set of connections up front and lending them out. Your code asks the pool for a connection, uses it, and hands it back, and the next request reuses it. In Java, the pool I use is HikariCP, and most of the examples here are for it. Because the pool sits between every thread in your application and the database, a misconfigured pool hurts everything that touches the database.

## Mistake 1: a pool that is too large

My first instinct when things got slow was to increase the pool size. More connections means more throughput, right?

It doesn't. A database server has a fixed number of CPU cores and a fixed amount of disk bandwidth, and every connection competes for them. PostgreSQL doesn't scale linearly with connections, and in my experience performance starts to degrade past about 100 concurrent connections. Each connection uses memory on the server, and with more active connections than cores, the CPU spends more and more of its time context switching between them instead of doing useful work.

The formula I use now as a starting point is this one:

```
connections = (cores * 2) + effective_spindle_count
```

The idea behind it is that each core can usefully work on about two connections at once, since a connection spends part of its time waiting for I/O, plus some extra for the number of disks that can serve reads in parallel ("spindles", from the days of spinning hard drives). For a 4-core server with SSDs, that comes to about 10 connections. That is a lot fewer than the 200 I used to configure.

## Mistake 2: a pool that is too small

Having learned that lesson, I also managed to make the opposite mistake. I once set a pool size of 5 for an application that had 20 concurrent request handlers. Under load, threads queued up for connections, since only 5 of the 20 handlers could talk to the database at any moment and the rest waited behind them.

They didn't wait forever. HikariCP has a connection timeout, 30 seconds by default, and if no connection becomes available within it, `getConnection()` gives up and throws an exception:

```java
// HikariCP timeout defaults to 30 seconds
// After 30 seconds waiting, this throws
try (Connection conn = dataSource.getConnection()) {
    // ...
}
```

Thirty seconds is a long time for a web request, though. The thread is blocked the entire time.

The way I think about it now is that the pool size has to match your actual concurrency. If you have 20 threads that need database access at the same time, you need at least 20 connections, or you have to accept that some threads will wait. That seems to contradict the first mistake, but the two fit together. The formula above tells you how many connections the database can work on efficiently, and the number of threads tells you how many your application wants. When the second number is much larger than the first, the answer is usually to accept short waits for a connection or reduce the concurrency, rather than to push the database past what it can handle.

## Mistake 3: trusting the default timeouts

The default timeout settings are dangerous, mostly because they are long and you never chose them. I now always set these explicitly:

```yaml
# HikariCP settings I always configure
maximumPoolSize: 10
connectionTimeout: 10000    # 10 seconds to get connection
idleTimeout: 600000         # 10 minutes before closing idle
maxLifetime: 1800000        # 30 minutes max connection age
```

`connectionTimeout` is how long a thread will wait for a connection from the pool, and it matters most. Without a sensible value, pool exhaustion blocks threads for a long time, or indefinitely with pools that have no limit by default. Blocked threads don't go away. Requests keep arriving, every new one blocks as well, and soon the application has no free threads left even for requests that don't need the database at all. What started as a slow database becomes a full outage. A short timeout makes requests fail quickly and visibly instead, which is easier to recover from.

`idleTimeout` closes connections that have been sitting unused for a while, so the pool can shrink back down after a busy period. `maxLifetime` retires every connection after a fixed age, even a busy one, and replaces it with a fresh one. That protects against connections that have been silently closed by something between the application and the database, which comes back again in mistake 5.

## Mistake 4: leaking connections

This one bit me hard. Our pool would drain slowly over several hours, and then everything failed at once.

The cause was code that didn't close its connections properly. With a pool, closing a connection doesn't actually close it; it returns it to the pool. If the code never calls `close()`, the connection is never returned, and the pool loses it for good. The classic way this happens is an exception thrown between getting a connection and closing it:

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

In the second version, Java's try-with-resources closes the result set, the statement and the connection automatically when the block ends, whether it ends normally or with an exception.

HikariCP has leak detection that helps a lot: if a connection is held longer than a threshold, it logs a warning together with the stack trace of the code that borrowed it.

```yaml
leakDetectionThreshold: 60000  # Log if connection held > 60 seconds
```

Turn this on in development and it will find your leaks.

## Mistake 5: assuming connections stay alive

Connections go stale. A network problem, a database restart or a firewall timeout can leave dead connections sitting in the pool. A firewall that drops an idle connection usually tells neither side, so the pool thinks it has a good connection until someone tries to use it.

I learned this the hard way after a database failover, when a standby server took over from the primary. The pool still had connections to the old primary, and they silently failed. The fix is to make sure the pool checks connections before handing them out. HikariCP does this by default: it validates a connection with the JDBC4 `Connection.isValid()` method, and if the check fails, the pool throws the connection away and opens a new one instead of passing a dead one to your code. What I set explicitly is how long that check may take:

```yaml
# HikariCP validates with Connection.isValid() by default
validationTimeout: 5000
```

You will see configurations that set `connectionTestQuery: SELECT 1` as well. That setting is meant for legacy drivers that don't support JDBC4, and HikariCP's documentation advises against it when the driver does, which the PostgreSQL driver does.

## Mistake 6: one pool for everything

We had a single pool shared between transaction processing and reporting queries, and the two workloads behaved very differently. Report queries were slow and held connections for seconds. Transaction queries were fast, but they were starved for connections, because the reports had them all.

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

The two pools are tuned for what each workload needs. The transaction pool is larger and has a short connection timeout, so it fails fast when it can't get a connection, and a problem shows up quickly instead of piling up blocked threads. The reporting pool is small, which caps how much of the database the reports can take at once, and it has a long timeout, because a report that waits a little longer to start is fine.

## Watching the pool

Most of these mistakes are easier to catch when you watch the pool itself. HikariCP exposes its state through an MXBean, and I export these pool metrics:

```java
HikariDataSource ds = (HikariDataSource) dataSource;
HikariPoolMXBean poolMXBean = ds.getHikariPoolMXBean();

// Metrics to track
int activeConnections = poolMXBean.getActiveConnections();
int idleConnections = poolMXBean.getIdleConnections();
int threadsAwaitingConnection = poolMXBean.getThreadsAwaitingConnection();
```

Active connections are the ones currently lent out, idle connections are waiting in the pool, and threads awaiting a connection are the ones blocked in `getConnection()`. The last one is the number to alert on. If `threadsAwaitingConnection` is consistently above zero, either your pool is too small or something is holding connections too long. A short spike under load is normal, but a steady value above zero is an early warning for several of the problems in this post, from an undersized pool to a slow leak.

## The configuration I start from

After years of tuning, this is the HikariCP configuration I start from, here in Spring Boot form:

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
```

Each line is one of the lessons above. The pool size is small, following the formula from the first mistake. The connection timeout is short enough that exhaustion shows up as fast errors instead of piled-up threads. Idle connections are trimmed down to a minimum of five, every connection is replaced after 30 minutes, leaks are logged, and HikariCP's default validation tests connections before use. I keep it conservative at first and adjust once I have real metrics from the monitoring above.

## Keeping applications apart

The last lesson is about the same problem as mistake 6, one level up. Don't share pools across unrelated applications. Each application should have its own pool with its own limits, because otherwise one misbehaving app can exhaust connections for everyone. A leak or a runaway report in one service then takes down services that had nothing to do with it.

It sounds obvious when written down, but I've seen shared database users with no per-application limits cause outages more than once. Most of the mistakes in this post came from a setting nobody had thought about, which is why I now set these values explicitly instead of relying on whatever the defaults happen to be.
