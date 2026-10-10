---
title: "Migrating from Oracle to PostgreSQL: A Practical Guide"
description: "How we moved a complex enterprise application from Oracle to PostgreSQL in phases, and what I wish I had known before we started."
date: 2023-04-18
image: "/images/blog/oracle-to-postgresql-migration.jpg"
series: "monolith-to-saas"
seriesLabel: "Oracle → PostgreSQL"
tags: ["postgresql", "oracle", "database", "migration"]
---

Database migrations have a reputation for being risky, and for good reason. If data is lost or quietly changed on the way over, no rollback of the code will bring it back. I coordinated a migration from Oracle to PostgreSQL for a complex enterprise application, and this post is the story of how we did it and what I wish I had known before we started.

## Why we moved at all

The main driver was money: Oracle licensing was a significant expense. Other reasons lined up behind the cost. PostgreSQL gave us better options for cloud deployment, since the major cloud providers offer it as a managed service. It has open source tooling and an active community behind it, and it performs very well for our workload.

None of that makes the migration itself any easier, though. Oracle and PostgreSQL both speak SQL, but an application that has lived on Oracle for years picks up Oracle habits everywhere: in the schema, in stored procedures, in the queries the application sends, and in assumptions about how NULL values or dates behave. The work is finding all of those habits before your users do.

## Doing it in phases

We followed a phased approach rather than a "big bang" migration, where you convert everything at once and switch. A big bang puts every possible problem into the same few hours, and when something breaks you have no idea which of a hundred changes caused it. Going in phases gave each step a smaller and more understandable set of risks.

### Phase 1: knowing what we had

Our first step was to catalog every object in the Oracle schema. Oracle exposes this through its data dictionary, and a single query against `user_objects` gives you a count of everything the current user owns, grouped by type:

```sql
-- Inventory of database objects in Oracle
SELECT object_type, COUNT(*)
FROM user_objects
GROUP BY object_type
ORDER BY COUNT(*) DESC;
```

The numbers that come back are a rough map of how hard the migration will be. Tables are usually the easy part; the objects that hold logic are expensive, because a person has to read, understand and rewrite each of them. From there we built up an inventory of:

- Tables and their relationships
- Stored procedures and functions
- Triggers
- Sequences
- Views (especially materialized views)
- Custom data types
- Database links

Materialized views deserve the extra attention. A materialized view is a query whose results are stored and refreshed, and Oracle offers refresh options, such as incremental refresh, that PostgreSQL does not have built in.

### Phase 2: converting the schema

With the inventory in hand, we could start translating the schema itself. Oracle and PostgreSQL differ in syntax and types in a few places, and the data types are where you notice it first. This is the mapping we worked from:

| Oracle | PostgreSQL |
|--------|------------|
| VARCHAR2(n) | VARCHAR(n) |
| NUMBER | NUMERIC / INTEGER / BIGINT |
| DATE | TIMESTAMP |
| CLOB | TEXT |
| BLOB | BYTEA |
| RAW | BYTEA |

Two rows in that table need more thought than the rest. Oracle's `NUMBER` is a single type that covers everything from a boolean flag to a money amount, so each column has to be looked at individually: an ID becomes `INTEGER` or `BIGINT`, while an amount with decimals stays `NUMERIC`. The other one is `DATE`. In Oracle a `DATE` includes a time of day down to the second, while a PostgreSQL `DATE` is only a calendar day. Mapping Oracle `DATE` to PostgreSQL `DATE` would quietly drop the time from every value, which is why it becomes `TIMESTAMP`.

Sequences, the database objects that hand out unique increasing numbers for primary keys, turned out to be friendly. The definition is identical in both databases:

```sql
CREATE SEQUENCE my_seq START WITH 1 INCREMENT BY 1;
-- Usage: my_seq.NEXTVAL
```

Only the way you ask for the next value is different. Oracle uses a pseudo-column on the sequence, while PostgreSQL uses a function that takes the sequence name:

```sql
CREATE SEQUENCE my_seq START WITH 1 INCREMENT BY 1;
-- Usage: nextval('my_seq')
```

### Phase 3: migrating the code in the database

This was the most time-consuming phase. Schema conversion is largely mechanical once you have the mapping, but code is not. The main changes were in procedures and string handling.

Oracle's procedural language is PL/SQL, and PostgreSQL's is PL/pgSQL. They look similar, but every procedure needs attention. Here is a typical example from the Oracle side, a procedure that updates the status of an order and manages its own transaction:

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

And this is what it became in PostgreSQL:

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

The interesting part is what disappeared. The PostgreSQL version is a function, and a PostgreSQL function always runs inside the transaction of whoever called it, so it is not allowed to `COMMIT` or `ROLLBACK` on its own. That responsibility moves to the caller. If the update fails, the error is raised and the calling transaction is rolled back as a whole. The types follow the same mapping as the schema.

String handling was the other place where we had to be careful, and it is a good example of how two databases can agree on syntax and still disagree on meaning. Both use `||` to concatenate strings, which was a relief. The catch is NULL. Oracle treats NULL and the empty string as the same thing, so concatenating NULL with some text just gives you the text. PostgreSQL follows the SQL standard, where any operation involving NULL produces NULL. A query that built a full name from first and last name would suddenly return nothing for every user who had no first name stored. The fix is to make the empty-string behavior explicit with `COALESCE`:

```sql
-- Oracle: NULL || 'text' = 'text'
-- PostgreSQL: NULL || 'text' = NULL

-- Use COALESCE in PostgreSQL
SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
FROM users;
```

Bugs like this are dangerous because nothing fails. The query runs, it returns rows, and the only symptom is a blank field somewhere in the UI.

### Phase 4: changing the application

The database was only half of the work. Our Jakarta EE application also had to learn that it was now talking to a different database.

The application used JPA through Hibernate, which generates SQL for you. Hibernate needs to know which database it is talking to, because each one has its own SQL dialect, and it uses that dialect to decide things like how to page results or how to fetch a sequence value. For code that goes through Hibernate, switching databases was close to a one-line change in the configuration:

```xml
<!-- Before (Oracle) -->
<property name="hibernate.dialect" value="org.hibernate.dialect.Oracle12cDialect"/>

<!-- After (PostgreSQL) -->
<property name="hibernate.dialect" value="org.hibernate.dialect.PostgreSQLDialect"/>
```

Native queries are a different matter. These are queries where the application bypasses Hibernate's SQL generation and sends hand-written SQL directly, usually because someone needed a feature or a level of control that JPA does not offer. Hibernate does not translate them, so every one of them had to be reviewed and updated by hand. The most common pattern we found was row limiting. Oracle traditionally uses its `ROWNUM` pseudo-column to restrict how many rows come back, which PostgreSQL does not have. PostgreSQL uses `LIMIT` instead:

```java
// Before - Oracle specific
@Query(value = "SELECT * FROM orders WHERE ROWNUM <= :limit", nativeQuery = true)

// After - PostgreSQL
@Query(value = "SELECT * FROM orders LIMIT :limit", nativeQuery = true)
```

## Moving the data

For the data itself, we combined a few tools.

The center of it was ora2pg, an open source tool that connects to an Oracle database, reads its schema and data, and produces PostgreSQL equivalents. I think it is excellent, and we used it for both the schema and the data migration. Its configuration names the source, the target and the kinds of objects to export:

```bash
# Example ora2pg configuration
ORACLE_DSN  dbi:Oracle:host=oracle-server;sid=PROD
ORACLE_USER migration_user
ORACLE_PWD  ****

PG_DSN      dbi:Pg:dbname=newdb;host=pg-server
PG_USER     postgres

TYPE        TABLE,SEQUENCE,VIEW,FUNCTION,PROCEDURE
```

Where data needed a transformation on the way, we wrote custom scripts for those cases. For the largest tables, speed became the concern, and we loaded them in parallel with PostgreSQL's `COPY` command. `COPY` streams rows into a table in bulk instead of running one `INSERT` per row, which is far faster when you are moving a lot of data.

## Proving the data was right

We tested at several levels, starting with the data and ending with the application.

The first and simplest check is row counts: does every table have the same number of rows on both sides? We ran the same counting query on Oracle and on PostgreSQL and compared the results:

```sql
-- Compare counts between Oracle and PostgreSQL
-- Oracle
SELECT 'orders' as table_name, COUNT(*) as cnt FROM orders
UNION ALL
SELECT 'customers', COUNT(*) FROM customers;

-- Run same query on PostgreSQL and compare
```

Matching counts tell you no rows went missing, but a truncated string or a rounded amount would still pass. For the critical columns we went further and computed a checksum: concatenate the relevant columns of every row in a fixed order, hash the whole thing with MD5, and compare the hash between the two databases. If a single value differs anywhere, the hash differs.

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

Notice the `COALESCE` calls again. Without them, a single NULL would turn the whole concatenation into NULL. Also note that `STRING_AGG` and the `::text` casts are PostgreSQL syntax, so the Oracle side needs an equivalent written with Oracle's own functions, and both sides have to turn numbers into text in exactly the same format for the hashes to match.

Once the data checked out, the application had to be tested on top of it. We ran the full regression test suite, ran performance benchmarks, and put the system through user acceptance testing, so that the people who actually use it every day could confirm it still behaved the way they expected.

## After the switch

Getting the data across did not mean we were finished. PostgreSQL decides how to run a query based on statistics about the data in each table: how many rows there are, how values are distributed, and so on. Freshly loaded tables have no useful statistics yet, so the query planner is guessing. Running `ANALYZE` collects those statistics. We also looked at which indexes were actually being used:

```sql
-- Analyze tables for query planner
ANALYZE;

-- Check for missing indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;
```

The second query lists indexes that have not been scanned since statistics were last reset. Despite the comment, that finds unused indexes rather than missing ones: indexes that were carried over from Oracle but that PostgreSQL's planner never chooses. Those are candidates for a closer look, because they still cost time on every write. Finding indexes that are missing is a separate exercise.

## What I would tell myself before starting

If I did this again, I would start with the same thorough assessment, because that is what tells you exactly what you are migrating, and anything you miss there turns up later at a worse time.

The second lesson is to automate as much as you can: the schema conversion, the data migration and the testing. You will run each of them many times, and anything done by hand comes out slightly different each time. Alongside that, plan for rollback, so that you have a way back if things go wrong on the day.

Test with production-like data, too. Volume matters, especially for performance testing. And involve developers, DBAs and QA early, so everyone is aligned; each of them sees a different part of the risk.

So, was it worth it? Migrating from Oracle to PostgreSQL is a lot of work, but it is doable with good planning, and for us the cost savings and the flexibility we gained made it worthwhile. If I had to put the experience into one piece of advice, it would be to treat the migration as a real project with stakeholders and a plan, get their buy-in early, and not rush the testing phase, because that is where you find out whether everything before it actually worked.
