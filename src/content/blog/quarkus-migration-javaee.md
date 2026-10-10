---
title: "Why We Moved from Java EE to Quarkus (And What Broke)"
description: "How we took a Java EE monolith apart into Quarkus services one piece at a time, why we chose Quarkus in the first place, and the parts that didn't go smoothly."
date: 2025-02-26
image: "/images/blog/quarkus-migration-javaee.jpg"
series: "monolith-to-saas"
seriesLabel: "Java EE → Quarkus"
tags: ["quarkus", "java", "microservices", "migration"]
---

We ran our monolith on Java EE for nearly a decade. It worked, and customers were happy with it. A Java EE application runs inside an application server, a large runtime that starts first and then loads your code, and that model was built for servers that start once and keep running for months. Then running applications in containers became the norm. In a container platform a process starts on every deployment and every restart, and it can't take traffic until it has finished starting. Our application took 45 seconds to start, and that went from a minor annoyance to a real problem.

## Why Quarkus

The decision wasn't purely technical, and I'd rather say that openly. Our CTO had been reading about Quarkus, and the team was excited to try something new. That kind of enthusiasm helps when you're about to spend a long time on a migration, but it isn't a reason by itself, so we also checked what Quarkus would give us.

Startup was the obvious one. Quarkus starts in under 2 seconds, while our Java EE app took at least 45. It gets there by doing at build time much of the work an application server does at every startup, like scanning classes and wiring dependencies together. Memory was the second. We went from a 512MB heap to 128MB for similar functionality. The third was developer experience, because hot reload in Quarkus actually works: code changes show up instantly instead of after a 10-second restart. And Quarkus was built for containers and Kubernetes from the start, which was where we were heading.

We considered Spring Boot as well, but chose Quarkus because the team wanted to stay closer to the standards we already used. Quarkus builds on JAX-RS for REST endpoints and CDI for dependency injection, the same Java EE APIs our code was written against, so most of our existing code would need fewer changes.

## Migration strategy

Rewriting everything at once would have been suicide. A big-bang rewrite means months in which the new system can't be used yet, while the old one keeps changing underneath you. Instead we used the strangler fig pattern, named after a plant that grows around a tree and slowly takes its place. You build the new system around the old one and move functionality across piece by piece, until the old code has nothing left to do:

1. Identify a bounded context to extract
2. Build it as a Quarkus service
3. Route traffic through a facade
4. Gradually move functionality
5. Decommission the old code

A bounded context is a part of the business domain with its own clear boundary and language, which makes it a natural candidate for a separate service. The facade is what lets this happen without anyone noticing: callers keep using the same entry point, and behind it requests go either to the old code or to the new service.

We started with the reporting module. It was fairly isolated, it had clear API boundaries, and it wasn't on the critical path, so if something went wrong, the core of the application would keep working while we fixed it.

## What worked well

CDI compatibility was excellent. Most of our injection code worked unchanged; a few `@Stateless` beans became `@ApplicationScoped`, and that was it. (`@Stateless` is an EJB annotation, and Quarkus doesn't support EJB, so those beans had to become plain CDI beans.)

JAX-RS was nearly identical. Quarkus uses RESTEasy, which implements JAX-RS, so our resource classes needed only small changes.

I've mentioned dev mode already, but I'll say it again: being able to change code and see the result immediately changed how we work. We spend much less time waiting.

## What broke

### JPA lazy loading outside transactions

JPA can load related entities lazily. When you load a customer, its orders aren't fetched until the code first touches them, which saves queries you may never need. The catch is that the lazy load needs an open persistence context, the session that tracks loaded entities and talks to the database. Touch the collection after that session has closed and Hibernate throws a `LazyInitializationException`.

In Java EE, the container kept sessions open longer. Part of the reason is that EJB methods run inside a transaction by default, so code in a `@Stateless` bean could reach lazy collections without ever thinking about it. CDI beans don't get that default, and Quarkus is stricter, so we had to add `@Transactional` in more places and rethink some entity relationships. Here is the typical case:

```java
// This worked in Java EE but failed in Quarkus
public List<Order> getOrdersWithItems(Long customerId) {
    Customer customer = customerRepository.findById(customerId);
    return customer.getOrders(); // LazyInitializationException
}

// Fixed version
@Transactional
public List<Order> getOrdersWithItems(Long customerId) {
    Customer customer = customerRepository.findById(customerId);
    customer.getOrders().size(); // Force initialization
    return customer.getOrders();
}
```

`@Transactional` keeps the session open for the whole method, and calling `size()` makes Hibernate load the orders while it is still open, so the caller receives a list that is already filled.

### Some CDI patterns don't work

A few places in our code used `CDI.current().select()` for dynamic lookups, where the code asks the container for a bean at runtime instead of having it injected. Quarkus resolves beans at build time, so dynamic bean lookup is limited. When it analyzes the application during the build, Quarkus removes beans that nothing injects, and a lookup that only happens at runtime is invisible to that analysis. We refactored those places to use `Instance<T>` injection instead. An `Instance<T>` is still a way to pick a bean at runtime, but because it is an injection point, Quarkus can see at build time which beans are needed.

### Native compilation

Quarkus can also compile an application into a native executable ahead of time, which starts even faster than the JVM version. We wanted native images for that reason, but native compilation has to know at build time every class that will be accessed through reflection, and reflection-heavy code needed extra configuration. After two weeks of fighting with it, we decided JVM mode was fast enough for us.

## Performance numbers

Before (Java EE on WildFly):
- Startup: 45 seconds
- Memory: 512MB heap
- First request latency: ~200ms (after warmup)

After (Quarkus JVM mode):
- Startup: 1.8 seconds
- Memory: 128MB heap
- First request latency: ~50ms

For our Kubernetes deployment, the memory savings alone justified the migration. That matters more after a split than before it, because every service extracted from the monolith runs in its own JVM, and the memory each one needs adds up.

## Lessons learned

Don't migrate everything at once. We extracted seven services over 18 months, and each one taught us something.

Write integration tests first. Before touching any code, we wrote tests that verified the API contract, the requests and responses other systems depend on. When the implementation behind an endpoint moves, those tests are what tell you the outside still looks the same, and they caught regressions we would otherwise have missed.

Keep the old system running. For months we ran both systems side by side and compared results, which saved us several times when the new code had subtle bugs.

Expect productivity to drop at first. The team needed time to learn Quarkus idioms, and we were slower on the first few services.

## Would I do it again?

Yes. The better developer experience alone was worth it. Our deployment frequency went from weekly to multiple times per day, because a service that starts in under two seconds makes a rollback cheap, and we're no longer afraid of slow rollbacks.

I'd plan for a longer timeline, though. We estimated 12 months and took 18, which is not unusual for this kind of migration.
