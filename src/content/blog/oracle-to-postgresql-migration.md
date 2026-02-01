---
title: "Migrating from Oracle to PostgreSQL: A Practical Guide"
description: "Lessons learned from coordinating a large-scale database migration from Oracle to PostgreSQL in an enterprise environment."
date: 2024-09-20
tags: ["postgresql", "oracle", "database", "migration"]
---

Database migrations are often considered one of the riskiest undertakings in software development. After coordinating a migration from Oracle to PostgreSQL for a complex enterprise application, I want to share what worked, what didn't, and what I wish I knew before starting.

## Why We Migrated

Our decision to move from Oracle to PostgreSQL was driven by several factors:

- **Licensing costs** - Oracle licensing was a significant expense
- **Cloud flexibility** - PostgreSQL offers better options for cloud deployment
- **Open source ecosystem** - Rich tooling and community support
- **Performance** - PostgreSQL performs excellently for our workload

## The Migration Strategy

We followed a phased approach rather than a "big bang" migration:

### Phase 1: Assessment and Planning

First, we cataloged everything:

```sql
-- Inventory of database objects in Oracle
SELECT object_type, COUNT(*)
FROM user_objects
GROUP BY object_type
ORDER BY COUNT(*) DESC;
```

Key items to inventory:
- Tables and their relationships
- Stored procedures and functions
- Triggers
- Sequences
- Views (especially materialized views)
- Custom data types
- Database links

### Phase 2: Schema Conversion

Oracle and PostgreSQL have syntax differences that need attention:

#### Data Types Mapping

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

### Phase 3: Code Migration

This was the most time-consuming phase. Key areas of change:

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

#### String Concatenation

Oracle uses `||` for string concatenation (PostgreSQL does too, thankfully), but watch out for NULL handling:

```sql
-- Oracle: NULL || 'text' = 'text'
-- PostgreSQL: NULL || 'text' = NULL

-- Use COALESCE in PostgreSQL
SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
FROM users;
```

### Phase 4: Application Layer Changes

Our Jakarta EE application required updates:

#### JPA/Hibernate Configuration

```xml
<!-- Before (Oracle) -->
<property name="hibernate.dialect" value="org.hibernate.dialect.Oracle12cDialect"/>

<!-- After (PostgreSQL) -->
<property name="hibernate.dialect" value="org.hibernate.dialect.PostgreSQLDialect"/>
```

#### Native Queries

We had to review and update all native SQL queries:

```java
// Before - Oracle specific
@Query(value = "SELECT * FROM orders WHERE ROWNUM <= :limit", nativeQuery = true)

// After - PostgreSQL
@Query(value = "SELECT * FROM orders LIMIT :limit", nativeQuery = true)
```

## Data Migration

For the actual data migration, we used a combination of tools:

1. **ora2pg** - Excellent open-source tool for schema and data migration
2. **Custom scripts** - For complex transformations
3. **Parallel loading** - Using PostgreSQL's COPY command for large tables

```bash
# Example ora2pg configuration
ORACLE_DSN  dbi:Oracle:host=oracle-server;sid=PROD
ORACLE_USER migration_user
ORACLE_PWD  ****

PG_DSN      dbi:Pg:dbname=newdb;host=pg-server
PG_USER     postgres

TYPE        TABLE,SEQUENCE,VIEW,FUNCTION,PROCEDURE
```

## Testing Strategy

We implemented multiple levels of testing:

### Row Count Verification
```sql
-- Compare counts between Oracle and PostgreSQL
-- Oracle
SELECT 'orders' as table_name, COUNT(*) as cnt FROM orders
UNION ALL
SELECT 'customers', COUNT(*) FROM customers;

-- Run same query on PostgreSQL and compare
```

### Data Integrity Checks
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

### Application Testing
- Full regression test suite
- Performance benchmarks
- User acceptance testing

## Lessons Learned

1. **Start with a thorough assessment** - Know exactly what you're migrating
2. **Automate everything** - Schema conversion, data migration, testing
3. **Plan for rollback** - Have a way to go back if things go wrong
4. **Test with production-like data** - Volume matters for performance testing
5. **Involve the whole team** - Developers, DBAs, and QA all need to be aligned

## Performance Tuning Post-Migration

After migration, we needed to tune PostgreSQL:

```sql
-- Analyze tables for query planner
ANALYZE;

-- Check for missing indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

## Conclusion

Migrating from Oracle to PostgreSQL is a significant undertaking, but it's absolutely achievable with proper planning and execution. The cost savings and flexibility we gained made it worthwhile.

The key is to treat it as a project, not just a technical task. Get buy-in from stakeholders, plan thoroughly, and don't rush the testing phase.
