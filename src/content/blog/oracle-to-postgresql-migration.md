---
title: "Migrating from Oracle to PostgreSQL: A Practical Guide"
description: "What I learned coordinating a large database migration from Oracle to PostgreSQL for an enterprise application."
date: 2023-04-18
image: "/images/blog/oracle-to-postgresql-migration.jpg"
series: "monolith-to-saas"
seriesLabel: "Oracle → PostgreSQL"
tags: ["postgresql", "oracle", "database", "migration"]
---

Database migrations have a reputation for being risky, and for good reason. I coordinated a migration from Oracle to PostgreSQL for a complex enterprise application, and this post covers how we did it and what I wish I'd known before starting.

## Why We Migrated

Oracle licensing was a significant expense, and that was the main driver. PostgreSQL also gave us better options for cloud deployment, open source tooling with an active community behind it, and it performs very well for our workload.

## The migration strategy

We followed a phased approach rather than a "big bang" migration:

### Phase 1: Assessment and planning

First, we cataloged everything:

```sql
-- Inventory of database objects in Oracle
SELECT object_type, COUNT(*)
FROM user_objects
GROUP BY object_type
ORDER BY COUNT(*) DESC;
```

What we inventoried:
- Tables and their relationships
- Stored procedures and functions
- Triggers
- Sequences
- Views (especially materialized views)
- Custom data types
- Database links

### Phase 2: Schema conversion

Oracle and PostgreSQL differ in syntax and types in a few places:

#### Data type mapping

| Oracle | PostgreSQL |
|--------|------------|
| VARCHAR2(n) | VARCHAR(n) |
| NUMBER | NUMERIC / INTEGER / BIGINT |
| DATE | TIMESTAMP |
| CLOB | TEXT |
| BLOB | BYTEA |
| RAW | BYTEA |

#### Sequences

Oracle:
```sql
CREATE SEQUENCE my_seq START WITH 1 INCREMENT BY 1;
-- Usage: my_seq.NEXTVAL
```

PostgreSQL:
```sql
CREATE SEQUENCE my_seq START WITH 1 INCREMENT BY 1;
-- Usage: nextval('my_seq')
```

### Phase 3: Code migration

This was the most time-consuming phase. The main changes were in procedures and string handling.

#### PL/SQL to PL/pgSQL

Oracle PL/SQL:
```sql
CREATE OR REPLACE PROCEDURE update_status(
    p_id IN NUMBER,
    p_status IN VARCHAR2
) AS
BEGIN
    UPDATE orders SET status = p_status WHERE id = p_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
```

PostgreSQL PL/pgSQL:
```sql
CREATE OR REPLACE FUNCTION update_status(
    p_id INTEGER,
    p_status VARCHAR
) RETURNS VOID AS $$
BEGIN
    UPDATE orders SET status = p_status WHERE id = p_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$ LANGUAGE plpgsql;
```

#### String concatenation

Oracle uses `||` for string concatenation (PostgreSQL does too, thankfully), but watch out for NULL handling:

```sql
-- Oracle: NULL || 'text' = 'text'
-- PostgreSQL: NULL || 'text' = NULL

-- Use COALESCE in PostgreSQL
SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
FROM users;
```

### Phase 4: Application layer changes

Our Jakarta EE application required updates:

#### JPA/Hibernate configuration

```xml
<!-- Before (Oracle) -->
<property name="hibernate.dialect" value="org.hibernate.dialect.Oracle12cDialect"/>

<!-- After (PostgreSQL) -->
<property name="hibernate.dialect" value="org.hibernate.dialect.PostgreSQLDialect"/>
```

#### Native queries

We had to review and update all native SQL queries:

```java
// Before - Oracle specific
@Query(value = "SELECT * FROM orders WHERE ROWNUM <= :limit", nativeQuery = true)

// After - PostgreSQL
@Query(value = "SELECT * FROM orders LIMIT :limit", nativeQuery = true)
```

## Data migration

For the data itself, we combined a few tools:

1. ora2pg, an excellent open source tool for schema and data migration
2. Custom scripts for complex transformations
3. Parallel loading with PostgreSQL's COPY command for large tables

```bash
# Example ora2pg configuration
ORACLE_DSN  dbi:Oracle:host=oracle-server;sid=PROD
ORACLE_USER migration_user
ORACLE_PWD  ****

PG_DSN      dbi:Pg:dbname=newdb;host=pg-server
PG_USER     postgres

TYPE        TABLE,SEQUENCE,VIEW,FUNCTION,PROCEDURE
```

## Testing

We tested at several levels:

### Row count verification
```sql
-- Compare counts between Oracle and PostgreSQL
-- Oracle
SELECT 'orders' as table_name, COUNT(*) as cnt FROM orders
UNION ALL
SELECT 'customers', COUNT(*) FROM customers;

-- Run same query on PostgreSQL and compare
```

### Data integrity checks
```sql
-- Checksum comparison for critical columns
SELECT MD5(STRING_AGG(
    COALESCE(id::text, '') ||
    COALESCE(amount::text, '') ||
    COALESCE(status, ''),
    '|' ORDER BY id
)) as checksum
FROM orders;
```

### Application testing
- Full regression test suite
- Performance benchmarks
- User acceptance testing

## Lessons learned

1. Start with a thorough assessment so you know exactly what you're migrating.
2. Automate schema conversion, data migration, and testing.
3. Plan for rollback, so you have a way back if things go wrong.
4. Test with production-like data. Volume matters for performance testing.
5. Involve developers, DBAs, and QA early so everyone is aligned.

## Performance tuning after the migration

After migration, we needed to tune PostgreSQL:

```sql
-- Analyze tables for query planner
ANALYZE;

-- Check for missing indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

## Was it worth it?

Migrating from Oracle to PostgreSQL is a lot of work, but it's doable with good planning. The cost savings and flexibility we gained made it worthwhile for us.

Treat it as a project with stakeholders and a plan, get their buy-in early, and don't rush the testing phase.
