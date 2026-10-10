---
title: "From Payara to WildFly to Quarkus: How We Took a Java EE Monolith Apart"
description: "Why we first moved our Java EE monolith to WildFly for stability, then spent a long, planned migration turning it into Quarkus microservices, and what EJB timers, Hibernate and a shared database taught us on the way."
date: 2025-06-12
image: "/images/blog/payara-wildfly-quarkus.jpg"
tags: ["quarkus", "wildfly", "java", "migration"]
---

When people hear that we migrated the same Java EE application twice in a few years, first from Payara to WildFly and then from WildFly to Quarkus, the first question is usually why we didn't just go to Quarkus directly and save ourselves one migration. It's a fair question. The two moves were about different things. The first one was about getting back onto stable ground quickly. The second one was about changing what the application is: taking a large monolith and turning it into a set of services that can be built, deployed and eventually scaled on their own. The second move was much bigger, much slower and much more carefully planned, and most of this post is about it.

I'll try to explain the background as I go, because a lot of migration write-ups assume you already know why things like EJB or JNDI are painful. If you have never moved an application off a Java EE server, some of the problems below won't be obvious, and they weren't obvious to us either when we started.

![Our path: a monolith on an aging Payara server, then the same monolith as a WildFly bootable JAR, then separate Quarkus services that still share one database](/images/blog/payara-wildfly-quarkus/journey.png)

## Where we started

Our application was a classic Java EE monolith. If you haven't worked with one, the idea is that you write your business code against the Java EE (now Jakarta EE) APIs, package it as a WAR or EAR file, and deploy it into an application server. The server is a big piece of software that provides everything around your code: database connections and transactions, REST endpoints, security, scheduled jobs, messaging. Your application doesn't start itself; the server starts, then loads your application into it.

We ran on Payara, and the version we were on had become old. Upgrading it in place was no longer an attractive option, and we needed a stable, supported runtime soon. What we did not want was to combine "the platform is shaky" with "let's redesign the architecture". So we split the problem in two: get stable first, then take the time to do the bigger change properly.

## Step one: Payara to WildFly, for stability

WildFly made sense as the stepping stone because it is also a full Jakarta EE application server. Most of our code could move over unchanged, since it only talked to the standard APIs and not to anything Payara-specific.

Most, but not all. The biggest piece of preparation had nothing to do with WildFly at all. Payara ships EclipseLink as its JPA provider, the library that maps Java objects to database tables, while WildFly uses Hibernate. Both implement the same JPA standard, but they behave differently in plenty of small ways. Rather than switching the server and the persistence layer at the same moment and then trying to guess which one broke something, we moved every module from EclipseLink to Hibernate first, one module at a time, while still running on Payara. When we finally switched servers, the persistence layer was already known to work.

We also swapped Jersey for RESTEasy as the JAX-RS implementation, which mostly went smoothly except for file uploads: our multipart code was written against Jersey's own classes and had to be rewritten for RESTEasy.

On the WildFly side we used Galleon, a tool that lets you build a server containing only the parts you need instead of the full distribution. Combined with the WildFly JAR Maven plugin, it produces a bootable JAR: one executable file that contains a slimmed-down WildFly and our application together. That was already a step towards how we wanted to run things later, with one self-contained artifact per application rather than a server that applications get dropped into.

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

The configuration that used to live in Payara (the datasource, the JDBC driver, system properties, and the OIDC client for logging in through our identity provider) moved into WildFly's configuration through its command-line tool. One small thing cost us more time than it should have. In Java EE, the server registers resources such as the datasource under a name in a directory service called JNDI, and the application refers to the datasource by that name in `persistence.xml`. WildFly is stricter about these names than Payara was, so names that had worked for years were simply rejected until we renamed them to follow its conventions.

None of this was exciting, but it did what it was supposed to do. We were on a supported, stable server again, and that gave us room to plan the next step without time pressure.

## Step two: why Quarkus, and why it took longer

The move to Quarkus had a different goal. Quarkus is a Java framework built for containers: applications start in a fraction of the time a traditional application server needs, use far less memory, and run as plain processes that fit naturally into Docker and Kubernetes. Those are nice properties, but we chose Quarkus because we wanted to break our monolith into microservices. It gave us a modern, container-friendly base for those services while still letting us reuse most of our Jakarta EE knowledge and code.

That decision is what made this migration so much longer and more planned than the first one. Moving a monolith from one server to another is mostly a matter of configuration. Turning a monolith into services means deciding where the boundaries are, what code is shared, how services talk to each other, and what happens to the data. We were explicit with the team that this was a migration and not a rewrite. The plan was to change the shape of the application without rewriting its business logic.

![How a module of the monolith became a Quarkus service: its own repository and build, its own copy of only the entities it uses, shared code moved into small libraries, and all database changes kept in one central project because the database is still shared](/images/blog/payara-wildfly-quarkus/services.png)

Before migrating a single module, we built a sample Quarkus project and a shared Maven BOM, so that every new service would start from the same baseline: the same versions, Docker packaging, logging, metrics, tracing and OpenAPI documentation already set up. Then we went through the monolith module by module. As a first step, every existing module became its own service. That is not a perfect microservice split, and we knew it, but it is one you can carry out step by step.

The code that every module had shared, things like request filters, user helpers, messaging helpers, JAX-RS utilities and global configuration, moved into small shared libraries. We deliberately did not let the new services depend on the old, large core JARs of the monolith, because that would have pulled the whole monolith's entity model into every service. Instead, each service got its own stripped-down copy of only the entities and columns it actually uses, and relationships that crossed into another service's data were replaced by plain IDs.

```java
// In the monolith: the entity pulls in another module's entity graph
@ManyToOne
@JoinColumn(name = "customer_id")
private Customer customer;

// In the service: just the reference
@Column(name = "customer_id")
private Long customerId;
```

We also moved configuration that used to live in a database table into normal Quarkus properties, read through `@ConfigMapping` interfaces. Only development and test values are committed to the repository, so production configuration always has to be provided explicitly and can't silently fall back to a developer default.

```java
@ConfigMapping(prefix = "app.reporting")
public interface ReportingConfig {
    Duration exportTimeout();
    int pageSize();
}
```

The part that makes us "microservices in progress" rather than finished is the database. All the new services still talk to one shared database. Splitting code is hard enough; splitting a database that has grown together over many years, with foreign keys between tables that now belong to different services, is a project of its own. Because the schema is still shared, we moved every database change (all the Liquibase changesets from all modules) into a single central project. If each service owned its own migrations against a shared schema, two services could easily change the same table in conflicting ways. With one project, every schema change goes through one place and one history. Separating the database into per-service databases is what we are working on now, and it is the step that will turn these services into real microservices.

## JNDI: the problem we expected and didn't have

Remember JNDI, the directory where the application server registers resources by name? In a lot of older Java EE code, components don't get their dependencies injected; they look them up by name at runtime, with code like `new InitialContext().lookup("java:comp/env/...")`. Quarkus has no application server and no JNDI directory, so every one of those lookups has to be rewritten, and in some legacy applications there are hundreds of them hidden in utility classes. This is one of the first things people warn you about when you plan a move away from a Java EE server.

For us it turned out to be a non-issue. Our code had been using dependency injection (CDI) for years, so there was almost nothing to untangle. If you are planning a similar migration, though, search your code for `InitialContext` and `lookup(` before you estimate anything.

## EJB: the problem we did have

EJB, Enterprise JavaBeans, is the older of the two component models in Java EE. Over time CDI took over most of what EJB was used for, but many applications still use EJB annotations for things like singletons, transactions and scheduled jobs, because that is how it was done when the code was written. Quarkus implements CDI but not EJB, so every EJB has to become something else.

Some of that is mechanical. Our `@Singleton` EJBs became `@ApplicationScoped` CDI beans:

```java
// Before (EJB)
@Singleton
public class ExchangeRateCache { ... }

// After (Quarkus, CDI)
@ApplicationScoped
public class ExchangeRateCache { ... }
```

There is one difference to watch for here. An EJB singleton is locked by the container by default, so only one thread at a time can run its methods. A CDI bean has no such lock. If a singleton holds shared state that changes, like a cache that gets refreshed, you have to make that thread-safe yourself after the move, for example with concurrent collections or explicit locking.

We also lost time to a CDI detail. Quarkus finds your beans at build time rather than at startup, and in a multi-module Maven build it only looks inside dependency modules that are marked as containing beans. Until we added an (empty) `beans.xml` to every module, beans from our shared libraries were simply not found, with errors that did not point anywhere near the real cause.

And then there were the scheduled jobs, which deserve their own section.

## Scheduled jobs: from EJB timers to Quartz

A business application has a surprising number of things that run on a timer: nightly cleanups, reminder notifications, recalculations, imports. In the application server, ours were EJB timers. You put an annotation such as `@Schedule` on a method, and the server takes care of calling it at the right time.

Quarkus has no EJB timers, so every scheduled method had to be moved. The straightforward replacement is the Quarkus Scheduler, and the code change itself is small:

```java
// Before (EJB timer)
@Schedule(hour = "2", minute = "0", persistent = false)
public void nightlyCleanup() { ... }

// After (Quarkus Scheduler)
@Scheduled(cron = "{jobs.cleanup.cron}")
void nightlyCleanup() { ... }
```

A nice side effect is that the schedule moves into configuration, so changing when a job runs no longer needs a code change and a new release.

The default Quarkus Scheduler keeps everything in memory, though. It knows nothing about when a job last ran, and after a restart it simply starts counting again. We wanted the scheduling state to live somewhere durable, so we added Quartz through the `quarkus-quartz` extension with a JDBC job store. Quartz stores its jobs and triggers in database tables, including when each job last ran and when it is due next. The nice thing is that the `@Scheduled` methods themselves did not change at all; Quartz is switched on through configuration:

```properties
quarkus.quartz.store-type=jdbc-cmt
quarkus.quartz.table-prefix=reports_qrtz_
```

![Three generations of scheduling: EJB timers managed by the application server, the Quarkus Scheduler keeping its state in memory, and Quartz keeping jobs, triggers and last and next run times in database tables](/images/blog/payara-wildfly-quarkus/schedulers.png)

Two clean-ups came later. At first several services shared one set of Quartz tables, and we moved each service to its own table prefix so that no two services share scheduler state, which also fits the direction of giving each service its own data. We also removed the Quartz extension from services that had no scheduled methods at all.

Today each service runs as a single instance, so we don't have to deal with several copies of a service competing for the same job. That question did come up early in the planning, though, and having the scheduler's state in the database means we are not starting from zero if we ever need it.

## The smaller things that bit us

Hibernate 6 brought its own list of surprises when the services moved to Quarkus. The generic PostgreSQL dialect didn't know about some database functions our queries relied on, such as `STRING_AGG` and `DATE_TRUNC`, so we had to register them in a custom dialect. String fields annotated with `@Lob` failed on PostgreSQL with a confusing "Bad value for type long" error until we mapped them as text. Hibernate returned empty strings in places where EclipseLink had always returned `null`, which broke a few converters that had quietly depended on that. And lazy loading outside a transaction failed in code paths that had worked for years; we fixed those with dedicated `JOIN FETCH` queries rather than changing shared queries that other code also used.

On the REST side, an empty query parameter bound to an `Integer` made Quarkus answer with a 404 instead of passing `null`, which took a while to find. Having both RESTEasy Classic and the newer Quarkus REST on the classpath in the same service produced errors that made no sense until `mvn dependency:tree` showed the stray dependency. Security also behaves differently: Quarkus authenticates requests proactively, but endpoints still need explicit `@Authenticated` or `@RolesAllowed` annotations, so we went through every resource to make sure none was left open by accident. And when we ran services in Docker behind a reverse proxy during development, they needed `quarkus.http.host=0.0.0.0`, because in development mode Quarkus only listens on localhost, which inside a container means nothing outside can reach it.

For messaging between services we first tried to talk to a managed cloud message bus from Quarkus, but the client libraries we tested either could not authenticate against it or were poorly documented, so we settled on a self-hosted ActiveMQ Artemis broker with SmallRye Reactive Messaging.

## Looking back

Going to WildFly first looked like a detour at the time, but I think it was the right call. It gave us a stable, supported platform while we planned the Quarkus migration properly, instead of rushing a big architectural change because the old server had become a risk.

The Quarkus migration took a long time because we were taking a monolith apart while moving it, and that meant decisions about boundaries, shared code and data that no tool makes for you. The services are separate now, and the database is the last big piece. Once each service owns its own data, I'll write about how that went.
