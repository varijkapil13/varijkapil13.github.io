---
title: "Why We Moved from Java EE to Quarkus (And What Broke)"
description: "How we migrated a monolithic Java EE application to Quarkus microservices, including the parts that didn't go smoothly."
date: 2023-08-22
tags: ["quarkus", "java", "microservices", "migration"]
---

We ran our monolith on Java EE for nearly a decade. It worked and customers were happy. Then container orchestration became the norm, and our 45-second startup times became a problem.

## Why Quarkus

The decision wasn't purely technical. Our CTO had been reading about Quarkus, and the team was excited to try something new. There were solid technical reasons as well:

- Startup time: Quarkus starts in under 2 seconds. Our Java EE app took at least 45.
- Memory: we went from a 512MB heap to 128MB for similar functionality.
- Developer experience: hot reload actually works. Code changes show up instantly instead of after a 10-second restart.
- Kubernetes: Quarkus was built for containers from the start.

We considered Spring Boot but chose Quarkus because the team wanted to stick closer to standards (JAX-RS, CDI). Most of our existing code would need fewer changes.

## Migration strategy

Rewriting everything at once would have been suicide. We used the strangler fig pattern:

1. Identify a bounded context to extract
2. Build it as a Quarkus service
3. Route traffic through a facade
4. Gradually move functionality
5. Decommission the old code

We started with the reporting module because it was fairly isolated, had clear API boundaries, and wasn't on the critical path.

## What worked well

CDI compatibility was excellent. Most of our injection code worked unchanged; a few `@Stateless` beans became `@ApplicationScoped`, and that was it.

JAX-RS was nearly identical. Quarkus uses RESTEasy, which implements JAX-RS, so our resource classes needed only small changes.

I've mentioned dev mode already, but I'll say it again: being able to change code and see the result immediately changed how we work. We spend much less time waiting.

## What broke

### JPA lazy loading outside transactions

In Java EE, the container kept sessions open longer. Quarkus is stricter, so we had to add `@Transactional` in more places and rethink some entity relationships.

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

### Some CDI patterns don't work

A few places in our code used `CDI.current().select()` for dynamic lookups. Quarkus resolves beans at build time, so dynamic bean lookup is limited. We refactored those places to use `Instance<T>` injection instead.

### Native compilation

We wanted native images for even faster startup, but reflection-heavy code needed extra configuration. After two weeks of fighting with it, we decided JVM mode was fast enough for us.

## Performance numbers

Before (Java EE on Payara):
- Startup: 45 seconds
- Memory: 512MB heap
- First request latency: ~200ms (after warmup)

After (Quarkus JVM mode):
- Startup: 1.8 seconds
- Memory: 128MB heap
- First request latency: ~50ms

For our Kubernetes deployment, the memory savings alone justified the migration, because we can run more replicas on the same resources.

## Lessons learned

Don't migrate everything at once. We extracted seven services over 18 months, and each one taught us something.

Write integration tests first. Before touching any code, we wrote tests that verified the API contract, and they caught regressions we would otherwise have missed.

Keep the old system running. For months we ran both systems side by side and compared results, which saved us several times when the new code had subtle bugs.

Expect productivity to drop at first. The team needed time to learn Quarkus idioms, and we were slower on the first few services.

## Would I do it again?

Yes. The better developer experience alone was worth it. Our deployment frequency went from weekly to multiple times per day because we're no longer afraid of slow rollbacks.

I'd plan for a longer timeline, though. We estimated 12 months and took 18, which is not unusual for this kind of migration.
