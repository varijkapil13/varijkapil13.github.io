---
title: "PostgreSQL Performance Tuning: A Practical Guide"
description: "Real-world PostgreSQL optimization techniques that made a significant difference in our enterprise applications."
date: 2024-08-15
tags: ["postgresql", "database", "performance", "optimization"]
---

After migrating our enterprise application from Oracle to PostgreSQL and optimizing it for production workloads, I've gathered practical tuning techniques that deliver real results.

## Understanding Query Performance

Before optimizing, you need to measure. PostgreSQL's `EXPLAIN ANALYZE` is your best friend:

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

Key metrics to watch:
- **Actual time**: Real execution time in milliseconds
- **Rows**: Estimated vs actual rows (big differences indicate stale statistics)
- **Buffers**: Shared hit (cache) vs read (disk)

## Index Optimization

### Composite Indexes

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

### Partial Indexes

When you frequently query a subset of data, partial indexes are gold:

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

### Covering Indexes (INCLUDE)

Avoid table lookups by including all needed columns:

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

## Configuration Tuning

These settings had the biggest impact on our production servers:

### Memory Settings

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

### Query Planner

```ini
# Cost estimates (adjust based on your storage)
random_page_cost = 1.1  # SSD storage (default 4.0 is for HDD)
effective_io_concurrency = 200  # SSD can handle parallel reads

# Enable parallel queries
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

## Query Optimization Patterns

### Avoid SELECT *

Always specify columns you need:

```sql
-- Bad: fetches all columns including large TEXT fields
SELECT * FROM orders WHERE customer_id = 123;

-- Good: only what you need
SELECT id, status, total_amount, created_at
FROM orders
WHERE customer_id = 123;
```

### Use EXISTS Instead of IN for Subqueries

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

### Batch Operations

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

### Pagination Done Right

Offset-based pagination gets slower as offset increases:

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

## Monitoring and Maintenance

### Find Slow Queries

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

### Find Missing Indexes

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

### Find Unused Indexes

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

### Automatic VACUUM Tuning

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

## Connection Pooling

Use PgBouncer for connection pooling:

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

## Results We Achieved

After implementing these optimizations:

| Metric | Before | After |
|--------|--------|-------|
| Average query time | 45ms | 8ms |
| P99 latency | 500ms | 50ms |
| Queries per second | 500 | 3000 |
| Database CPU usage | 80% | 30% |

## Key Takeaways

1. **Measure first** - Use `EXPLAIN ANALYZE` before optimizing
2. **Index strategically** - Partial and covering indexes are powerful
3. **Tune configuration** - Default settings are rarely optimal
4. **Monitor continuously** - Use `pg_stat_statements` and system views
5. **Pool connections** - Never let apps manage connections directly

PostgreSQL is incredibly powerful when properly tuned. Start with the biggest impact changes and measure the results.
