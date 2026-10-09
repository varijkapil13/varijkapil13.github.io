---
title: "PostgreSQL Performance Tuning: A Practical Guide"
description: "The PostgreSQL tuning techniques that made the biggest difference in our enterprise applications."
date: 2023-02-10
image: "/images/blog/postgresql-performance-tuning.jpg"
tags: ["postgresql", "database", "performance", "optimization"]
---

We migrated our enterprise application from Oracle to PostgreSQL and then spent a while getting it ready for production load. These are the tuning techniques that worked for us.

## Understanding query performance

Measure before you optimize. PostgreSQL's `EXPLAIN ANALYZE` is the tool I reach for first:

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

In the output, I look at:
- Actual time: the real execution time in milliseconds
- Rows: estimated vs actual rows (a big difference usually means stale statistics)
- Buffers: shared hit (cache) vs read (disk)

## Index optimization

### Composite indexes

Order matters in composite indexes. Put the most selective column first:

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

### Partial indexes

When you keep querying the same subset of data, a partial index is often the best fix:

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

### Covering indexes (INCLUDE)

If the index includes every column the query needs, PostgreSQL can skip the table lookup:

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

## Configuration tuning

These settings had the biggest impact on our production servers:

### Memory settings

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

### Write-Ahead Log (WAL)

```ini
# Larger WAL buffers for write-heavy workloads
wal_buffers = 64MB

# Checkpoint settings
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB
```

### Query planner

```ini
# Cost estimates (adjust based on your storage)
random_page_cost = 1.1  # SSD storage (default 4.0 is for HDD)
effective_io_concurrency = 200  # SSD can handle parallel reads

# Enable parallel queries
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

## Query optimization patterns

### Avoid SELECT *

List the columns you need:

```sql
-- Bad: fetches all columns including large TEXT fields
SELECT * FROM orders WHERE customer_id = 123;

-- Good: only what you need
SELECT id, status, total_amount, created_at
FROM orders
WHERE customer_id = 123;
```

### Use EXISTS instead of IN for subqueries

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

### Batch operations

For bulk inserts, use multi-value INSERT or COPY:

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

### Keyset pagination

Offset-based pagination gets slower as the offset grows:

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

## Monitoring and maintenance

### Find slow queries

Enable the `pg_stat_statements` extension:

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

### Find missing indexes

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

### Find unused indexes

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

### Autovacuum tuning

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

## Connection pooling

We put PgBouncer in front of the database:

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

## Results

Before and after these changes:

| Metric | Before | After |
|--------|--------|-------|
| Average query time | 45ms | 8ms |
| P99 latency | 500ms | 50ms |
| Queries per second | 500 | 3000 |
| Database CPU usage | 80% | 30% |

## Where to start

Run `EXPLAIN ANALYZE` before you change anything. Partial and covering indexes are worth knowing well, and the default configuration is rarely right for a production workload. Keep watching `pg_stat_statements` and the statistics views after the first round of fixes, and don't let applications manage database connections directly; put a pooler in between.

PostgreSQL performs very well once it's tuned. Start with the changes that have the biggest impact and measure after each one.
