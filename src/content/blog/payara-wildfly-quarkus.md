---
title: "Payara to WildFly to Quarkus: Two Migrations and the Scheduler Problem"
description: "Why we moved a Java EE platform to WildFly for short-term stability, then to Quarkus for the long run, and what EJB timers did to us along the way."
date: 2025-06-12
image: "/images/blog/payara-wildfly-quarkus.jpg"
tags: ["quarkus", "wildfly", "java", "migration"]
---

We migrated the same Java EE platform twice in a few years. First from an aging Payara installation to WildFly, then from WildFly to Quarkus. People sometimes ask why we didn't go straight to Quarkus. The short answer is that the two moves solved different problems. WildFly bought us stability quickly. Quarkus was the long-term investment in running the platform as a cloud-native application.

This post covers both moves, and spends most of its time on the part that hurt: EJB, and scheduled jobs in particular.

## Step one: Payara to WildFly

Our Payara version was old, and upgrading it in place had stopped being attractive. We needed a stable, supported runtime soon, and we didn't want to rewrite anything to get it. WildFly fit because it is still a full Jakarta EE server, so most of the application could move as it was.

We used WildFly Galleon to provision a slim server with only the layers we needed, packaged as a bootable JAR. That gave us one artifact per application instead of a server with deployments dropped into it:

```xml
<plugin>
    <groupId>org.wildfly.plugins</groupId>
    <artifactId>wildfly-jar-maven-plugin</artifactId>
    <version>7.0.1.Final</version>
    <configuration>
        <feature-pack-location>wildfly@maven(org.jboss.universe:community-universe)#26.0.0.Final</feature-pack-location>
        <layers>
            <layer>jaxrs</layer>
            <layer>management</layer>
        </layers>
        <excluded-layers>
            <layer>deployment-scanner</layer>
        </excluded-layers>
    </configuration>
</plugin>
```

Most of the work was not in WildFly itself. Before the switch we moved every module from EclipseLink to Hibernate, one module at a time, so that the server change wouldn't also be a JPA provider change. Hibernate 6 had its own surprises, which I cover further down. We also replaced Jersey with RESTEasy, which meant rewriting our multipart upload code, and moved the datasource, JDBC driver and OIDC client setup into WildFly's configuration. One small thing that cost us time: WildFly is strict about JNDI names for JTA datasources, and names that worked on Payara were rejected.

None of this was glamorous, but it worked. The platform was stable on a supported server again, and we had time to plan the bigger move.

## Step two: WildFly to Quarkus

The goal for Quarkus was different. We wanted services that start fast, run in containers on Kubernetes, and can be split apart over time. We treated it as a migration, not a rewrite. The first step was one service per existing module, keeping the shared database for now. Breaking cross-service entity relationships and giving each service its own database came later.

A few decisions made this manageable:

- We built a sample project and a shared BOM first, with logging, metrics, tracing and OpenAPI already set up, so every migrated service started from the same baseline.
- Instead of depending on the old shared core JARs, each service got a stripped-down copy of only the entities and columns it uses, with relationships replaced by IDs.
- All database changesets moved into one place, so schema history didn't get scattered across new repositories.
- Configuration that used to live in a database table moved to plain Quarkus properties, read through `@ConfigMapping`.

```java
@ConfigMapping(prefix = "app.reporting")
public interface ReportingConfig {
    Duration exportTimeout();
    int pageSize();
}
```

JNDI turned out to be a non-issue for us. We were already using injection everywhere, so there was little to untangle. EJB was another story.

## The EJB problems

Quarkus implements CDI, not EJB. Some of the translation is mechanical. Our `@Singleton` EJBs became `@ApplicationScoped` beans:

```java
// Before (EJB)
@Singleton
public class ExchangeRateCache { ... }

// After (Quarkus)
@ApplicationScoped
public class ExchangeRateCache { ... }
```

We also lost time to bean discovery. Quarkus discovers beans at build time, and in a multi-module build it only scans dependency modules that are indexed. Until we added a `beans.xml` (its content is ignored) to every module, beans from shared modules silently weren't found.

The real trouble was scheduled work.

## Schedulers: from EJB timers to Quartz

In the application server, scheduled jobs were EJB timers. The obvious replacement in Quarkus is the Quarkus Scheduler, and the code change is small:

```java
// Before (EJB timer)
@Schedule(hour = "2", minute = "0", persistent = false)
public void nightlyCleanup() { ... }

// After (Quarkus Scheduler)
@Scheduled(cron = "{jobs.cleanup.cron}")
void nightlyCleanup() { ... }
```

Moving the schedule into configuration was a nice side effect. The problem showed up once services ran with more than one replica. The default Quarkus Scheduler keeps its state in memory, so every pod runs every job. A nightly cleanup that runs twice is annoying. A job that sends notifications or generates documents twice is a bug report.

We moved to Quartz through the `quarkus-quartz` extension with a JDBC job store and clustering turned on. Quartz records in the database when a job last ran and when it is due next, and the replicas coordinate through those tables, so each trigger fires once across the cluster. The `@Scheduled` methods stayed exactly as they were. Only the configuration changed:

```properties
quarkus.quartz.store-type=jdbc-cmt
quarkus.quartz.clustered=true
quarkus.quartz.table-prefix=reports_qrtz_
```

Two follow-ups came later. At first several services shared one set of Quartz tables, and we moved each service to its own table prefix so no two services share scheduler state. We also removed the Quartz extension from services that had no scheduled methods at all.

Quartz isn't the end of the story. Scheduled jobs that run in the service work fine while each deployment serves one tenant. They get harder in a shared multi-tenant deployment, because a job has to know which tenant it is working for before it touches the database. A job that runs without a tenant context will quietly use the default datasource. That is the next problem we are working on, and probably a post of its own.

## Other things that bit us

Hibernate 6 had its own list of surprises. The generic PostgreSQL dialect didn't know some functions our queries used, such as `STRING_AGG`, so we registered them in a custom dialect. `@Lob` string fields failed with "Bad value for type long" on PostgreSQL until we mapped them as text. Hibernate returned empty strings where EclipseLink had returned null, which broke a few converters. Lazy loading outside a transaction failed in places that had always worked, and we fixed those with dedicated `JOIN FETCH` queries instead of changing shared ones.

On the REST side, an empty query parameter bound to an `Integer` returned a 404 instead of null. Mixing RESTEasy Classic and Quarkus REST dependencies in one service caused confusing errors, and `mvn dependency:tree` was the quickest way to find the stray dependency. Behind a reverse proxy in Docker, the service also needed `quarkus.http.host=0.0.0.0` before anything could reach it.

## Would I do it the same way?

Mostly, yes. Going to WildFly first looked like a detour, but it took pressure off. We had a stable, supported platform while we planned the Quarkus migration properly, instead of rushing it because the old server was a risk.

What I would change is when we thought about scheduled jobs. We treated them as a line item, "replace EJB timers", when they were really a question about how the system behaves with several replicas and, later, several tenants. If you are planning a similar migration, list every scheduled job early and decide for each one where it should run. That decision shapes more of the architecture than the annotation change suggests.
