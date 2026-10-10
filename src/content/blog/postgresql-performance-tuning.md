---
title: "PostgreSQL Performance Tuning: A Practical Guide"
description: "After moving our enterprise application from Oracle to PostgreSQL, we had to get it ready for production load. This is how we found the slow parts and what we changed."
date: 2023-02-10
image: "/images/blog/postgresql-performance-tuning.jpg"
tags: ["postgresql", "database", "performance", "optimization"]
---

We migrated our enterprise application from Oracle to PostgreSQL, and getting the data across was only the first milestone. A freshly migrated database runs the same queries as before, but the engine makes different decisions about how to run them, and its default configuration is designed to start on almost any machine rather than to perform well on yours. So we spent a while getting it ready for production load. These are the tuning techniques that worked for us.

## Reading the query plan first

Measure before you optimize. Without a measurement you cannot tell whether a change helped or made things worse somewhere else.

PostgreSQL's query planner looks at each query, the available indexes and the statistics it keeps about each table, and picks what it thinks is the cheapest plan: which index to use, in what order to join tables, how to sort. `EXPLAIN` shows you that plan. `EXPLAIN ANALYZE` goes further and actually runs the query, so you see the real timings next to the planner's estimates. It is the tool I reach for first:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.*, c.name as customer_name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'PENDING'
AND o.created_at > NOW() - INTERVAL '30 days'
ORDER BY o.created_at DESC
LIMIT 100;
```

In the output, I look at three things. The actual time is the real execution time of each step in milliseconds, which shows where the time is going. The row counts come in two versions, estimated and actual, and a big difference between them usually means the table statistics are stale: the planner made its choices based on a picture of the data that is no longer true, and it probably picked the wrong plan as a result. Finally, the `BUFFERS` option shows how many data pages were a shared hit, meaning they were already in PostgreSQL's memory cache, and how many had to be read from disk.

Once you can see the plans, the first place to look is usually the indexes.

## Getting the indexes right

An index is a separate data structure, sorted by one or more columns, that lets PostgreSQL jump to matching rows instead of reading the whole table. Every insert and update has to maintain them too, so the goal is the right ones rather than many.

### Composite indexes

A composite index covers more than one column, and the order of the columns matters, because the index is sorted by the first column, then by the second within each value of the first, and so on. The rule of thumb you will often hear is to put the most selective column first. In our case the deciding factor was how each column is used in the query. Look at this example:

```sql
-- Good: status has few distinct values, created_at is the range filter
CREATE INDEX idx_orders_status_created
ON orders (status, created_at DESC);

-- Query that benefits from this index
SELECT * FROM orders
WHERE status = 'PENDING'
AND created_at > '2024-01-01'
ORDER BY created_at DESC;
```

As the comment says, `status` has only a few distinct values, so on its own it is not very selective. It still goes first, because the query compares it with an exact value, while `created_at` is a range filter and the sort key. With this order, all the `PENDING` rows sit together in the index, already sorted by `created_at` from newest to oldest. PostgreSQL can jump to the start of that block, read forward until the date falls outside the range, and return the rows in the requested order without sorting them. If the columns were the other way round, the pending rows would be scattered across the whole date range.

### Partial indexes

Some queries keep asking about the same subset of a table, such as orders that are still active. A normal index covers every row, including all the ones nobody asks about. A partial index has a `WHERE` clause and only contains the rows that match it, which makes it much smaller and faster to search. When you keep querying the same subset of data, a partial index is often the best fix:

```sql
-- Index only active orders (much smaller than full table index)
CREATE INDEX idx_orders_active
ON orders (created_at DESC)
WHERE status IN ('PENDING', 'PROCESSING');

-- Index only for recent data
CREATE INDEX idx_orders_recent
ON orders (customer_id, created_at DESC)
WHERE created_at > NOW() - INTERVAL '90 days';
```

The planner can only use a partial index when it can prove that the query's own `WHERE` clause falls inside the index condition, so the queries have to filter on the same thing. The second example needs a caveat. PostgreSQL only accepts immutable expressions in an index predicate, and `NOW()` changes over time, so the condition has to be written with a fixed date instead, and the index rebuilt from time to time if you want it to keep covering only the most recent data.

### Covering indexes

Even with a good index, PostgreSQL normally finds the entry in the index and then goes to the table to fetch the columns the query asked for. That second step is often the expensive one. If the index includes every column the query needs, PostgreSQL can skip the table lookup and answer from the index alone, which is called an index-only scan. The `INCLUDE` clause adds extra columns to an index for exactly this purpose, without making them part of the sort order:

```sql
-- Include frequently selected columns
CREATE INDEX idx_orders_customer_covering
ON orders (customer_id, created_at DESC)
INCLUDE (status, total_amount);

-- Query can be satisfied entirely from the index
SELECT status, total_amount, created_at
FROM orders
WHERE customer_id = 123
ORDER BY created_at DESC
LIMIT 10;
```

One detail is worth knowing: PostgreSQL still has to check whether each row is visible to the current transaction, and it can only skip that check for pages that vacuum has marked as all-visible.

## Tuning the configuration

Indexes fix individual queries; the server configuration affects all of them. PostgreSQL's conservative defaults use only a small part of a dedicated server's memory. These are the settings that had the biggest impact on our production servers.

### Memory

`shared_buffers` is PostgreSQL's own cache of data pages, and the usual starting point for a dedicated database server is about a quarter of RAM. The rest is left to the operating system, which caches files as well. `effective_cache_size` does not allocate anything; it tells the planner how much memory is likely available for caching in total, between PostgreSQL and the operating system, so that it can estimate how often data will come from memory rather than disk. Around 75% of RAM is a common value.

```ini
# postgresql.conf

# Shared buffers: 25% of RAM for dedicated DB server
shared_buffers = 8GB

# Work memory for sorts and joins (per operation!)
work_mem = 256MB

# Maintenance operations (VACUUM, CREATE INDEX)
maintenance_work_mem = 2GB

# Effective cache size: ~75% of total RAM
# Helps query planner estimate disk vs memory access
effective_cache_size = 24GB
```

The exclamation mark next to `work_mem` is there for a reason. It is the amount of memory a single sort or hash operation may use before it spills to disk, and it applies per operation, not per connection. One complex query can run several such operations at once, and many connections can run queries at the same time, so a generous value multiplies quickly. `maintenance_work_mem` is the equivalent for maintenance work like `VACUUM` and building indexes, which runs less often and can get more.

### Write-ahead log

Every change in PostgreSQL is first written to the write-ahead log (WAL) before it is applied to the data files, which is what lets the database recover after a crash. Periodically, PostgreSQL runs a checkpoint, where it writes all changed pages to the data files so that older WAL can be recycled. If checkpoints happen too often, or all their writes land at once, you see bursts of disk activity and latency spikes.

```ini
# Larger WAL buffers for write-heavy workloads
wal_buffers = 64MB

# Checkpoint settings
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB
```

A larger `max_wal_size` lets more WAL build up between checkpoints, so they happen less often. `checkpoint_completion_target = 0.9` tells PostgreSQL to spread a checkpoint's writes over 90% of the time until the next one, instead of writing everything as fast as possible.

### The query planner

The planner chooses between plans by estimating their cost, and those estimates depend on assumptions about the hardware. The default `random_page_cost` of 4.0 assumes that reading a random page is four times as expensive as reading pages in sequence, which made sense for spinning disks. On SSDs, random reads are almost as cheap as sequential ones, and with the old value the planner tends to avoid index scans that would actually be fast.

```ini
# Cost estimates (adjust based on your storage)
random_page_cost = 1.1  # SSD storage (default 4.0 is for HDD)
effective_io_concurrency = 200  # SSD can handle parallel reads

# Enable parallel queries
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

`effective_io_concurrency` tells PostgreSQL how many read requests the storage can handle at once, which SSDs handle much better than spinning disks. The last two settings allow PostgreSQL to split a large query across several worker processes, up to four for a single query and eight in total across the server.

## Writing better queries

The queries the application sends still decide a lot, and a few patterns are worth knowing.

The first is `SELECT *`. It is convenient, but it fetches every column, including large `TEXT` fields that the code then ignores. Those have to be read and sent over the network. It also rules out the index-only scans described above, because no index will contain every column. Listing the columns you need avoids all of that:

```sql
-- Bad: fetches all columns including large TEXT fields
SELECT * FROM orders WHERE customer_id = 123;

-- Good: only what you need
SELECT id, status, total_amount, created_at
FROM orders
WHERE customer_id = 123;
```

The second is how subqueries are written. A query that filters with `IN (SELECT ...)` and one that uses `EXISTS` ask the same question, but the reasoning behind preferring `EXISTS` is that it only needs to find one matching row and can stop there, instead of working with the full result of the subquery:

```sql
-- Slower with large subquery results
SELECT * FROM orders o
WHERE o.customer_id IN (
    SELECT id FROM customers WHERE region = 'EU'
);

-- Faster: stops at first match
SELECT * FROM orders o
WHERE EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = o.customer_id AND c.region = 'EU'
);
```

Modern PostgreSQL versions can often turn both forms into the same kind of join internally, so this is a case where `EXPLAIN ANALYZE` should have the final word on your own queries.

For bulk inserts, every individual `INSERT` is a separate round trip, and in its own transaction it also waits for its own commit. A multi-value `INSERT` cuts most of that overhead, and `COPY`, which streams rows in bulk, is faster still:

```sql
-- Single multi-value INSERT (faster than individual inserts)
INSERT INTO orders (customer_id, status, total_amount)
VALUES
    (1, 'PENDING', 100.00),
    (2, 'PENDING', 200.00),
    (3, 'PENDING', 150.00);

-- Even faster for large datasets: COPY
COPY orders (customer_id, status, total_amount)
FROM '/path/to/data.csv'
WITH (FORMAT csv, HEADER true);
```

Keep in mind that `COPY ... FROM` with a file path reads the file on the database server, not on your machine, and needs the corresponding privileges. From a client, psql's `\copy` does the same thing with a local file.

The last pattern is pagination. The usual way to page through results is `LIMIT` with `OFFSET`, and it gets slower as the offset grows. To return page 501, PostgreSQL still has to work through the first 10,000 rows in order, then throw them away. Keyset pagination avoids that by remembering where the previous page ended, in this case the `created_at` of its last row, and asking for the rows after that point. With an index on `created_at`, the database jumps straight there:

```sql
-- Slow for large offsets (scans and discards rows)
SELECT * FROM orders
ORDER BY created_at DESC
LIMIT 20 OFFSET 10000;

-- Fast: keyset pagination
SELECT * FROM orders
WHERE created_at < '2024-01-15 10:30:00'
ORDER BY created_at DESC
LIMIT 20;
```

The trade-off is that you can no longer jump to an arbitrary page number, only to the next one.

## Watching it over time

The first round of fixes is not the end, because data and queries change. To find slow queries, we use the `pg_stat_statements` extension. It records statistics for every distinct query the server runs: how many times it was called, the total time spent on it, and the average. Sorting by total time is more useful than sorting by the slowest single execution, because a fast query that runs constantly can cost far more in total than a slow report that runs once a day.

```sql
-- Top 10 slowest queries by total time
SELECT
    round(total_exec_time::numeric, 2) as total_time_ms,
    calls,
    round(mean_exec_time::numeric, 2) as avg_time_ms,
    query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

To find missing indexes, we look at the opposite side of the statistics: tables that are read with sequential scans, meaning PostgreSQL reads every row from start to finish. On a small table that is fine. On a large table scanned this way again and again, it usually means a query has no index to use.

```sql
-- Tables with high sequential scans (potential missing indexes)
SELECT
    schemaname,
    relname as table_name,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE seq_scan > 100
AND n_live_tup > 10000
ORDER BY seq_tup_read DESC;
```

Unused indexes are the mirror image. An index that is never scanned still costs disk space and slows down every write to its table. This query lists the indexes with no scans, largest first, leaving out primary keys, which are needed for uniqueness even when they are not used for reading:

```sql
-- Indexes that are never used (candidates for removal)
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

The last thing we watched was vacuuming, which needs a little background. When PostgreSQL updates or deletes a row, it does not remove the old version immediately, because other transactions might still need to see it. The old versions, called dead tuples, stay in the table until `VACUUM` cleans them up. Autovacuum does this in the background, but on busy tables its default thresholds can fall behind, and dead rows make the table larger and scans slower. This query shows which tables have the most dead tuples, the ratio of dead to total, and when they were last vacuumed:

```sql
-- Check if tables need more aggressive vacuuming
SELECT
    relname,
    n_dead_tup,
    n_live_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

## Putting a pooler in front

The final change was about connections rather than queries. Every PostgreSQL connection is a separate server process with its own memory, so many connections cost real resources even when idle, and opening a new one is relatively slow. We put PgBouncer in front of the database to deal with this. Applications connect to PgBouncer, which keeps a much smaller pool of real connections to PostgreSQL and shares them out:

```ini
# pgbouncer.ini
[databases]
myapp = host=localhost port=5432 dbname=myapp

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
```

With this configuration, up to 1000 clients can connect to PgBouncer, but they share 50 actual connections to the database. `pool_mode = transaction` means a client only holds a real connection for the length of one transaction, then gives it back. That is what makes the sharing efficient, but it also means session-level state, such as session variables or server-side prepared statements, cannot be relied on between transactions, so the application has to be compatible with it.

## Results

This is how the numbers looked before and after these changes:

| Metric | Before | After |
|--------|--------|-------|
| Average query time | 45ms | 8ms |
| P99 latency | 500ms | 50ms |
| Queries per second | 500 | 3000 |
| Database CPU usage | 80% | 30% |

P99 latency is the time within which 99% of queries finish. I find it the more telling row of the two latency numbers, because an average hides the slow outliers, and those outliers are what users notice.

## Where I would start

Run `EXPLAIN ANALYZE` before you change anything, so you know what you are fixing. Partial and covering indexes are worth knowing well. Don't trust the default configuration either, because it is rarely right for a production workload. After the first round of fixes, keep watching `pg_stat_statements` and the statistics views, since the slow queries of next month are not the ones of today. And don't let applications manage database connections directly; put a pooler in between.

PostgreSQL performs very well once it is tuned. Start with the changes that have the biggest impact, and measure after each one, so you know which change actually helped.
