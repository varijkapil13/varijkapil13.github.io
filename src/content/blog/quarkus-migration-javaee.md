---
title: "Why We Moved from Java EE to Quarkus (And What Broke)"
description: "Our journey migrating a monolithic Java EE application to Quarkus microservices, including the parts that didn't go smoothly."
date: 2023-08-22
tags: ["quarkus", "java", "microservices", "migration"]
---

We ran our monolith on Java EE for nearly a decade. It worked. Customers were happy. Then container orchestration became the norm, and our 45-second startup times became a problem.

## Why Quarkus

I'll be honest—the decision wasn't purely technical. Our CTO had been reading about Quarkus, and the team was excited to try something new. But there were legitimate reasons too:

- **Startup time**: Quarkus starts in under 2 seconds. Our Java EE app took 45 seconds minimum.
- **Memory footprint**: We went from 512MB heap to 128MB for similar functionality.
- **Developer experience**: Hot reload actually works. Not "restart in 10 seconds," but instant reflection of code changes.
- **Container-first**: Built for Kubernetes from the start.

We considered Spring Boot but chose Quarkus because the team wanted to stick closer to standards (JAX-RS, CDI). Most of our existing code would need fewer changes.

## The Migration Strategy

Rewriting everything at once would have been suicide. We used the strangler fig pattern:

1. Identify a bounded context to extract
2. Build it as a Quarkus service
3. Route traffic through a facade
4. Gradually move functionality
5. Decommission the old code

Our first candidate was the reporting module. It was relatively isolated, had clear API boundaries, and wasn't on the critical path.

## What Worked Well

**CDI compatibility was excellent**. Most of our injection code worked unchanged. A few `@Stateless` beans became `@ApplicationScoped`, but that was it.

**JAX-RS was nearly identical**. Quarkus uses RESTEasy, which implements JAX-RS. Our resource classes needed minimal changes.

**The dev mode is fantastic**. I know I mentioned it already, but seriously—being able to change code and see results immediately changed how we work. We spend less time waiting.

## What Broke

**JPA lazy loading outside transactions**: In Java EE, the container kept sessions open longer. Quarkus is stricter. We had to add `@Transactional` in more places and rethink some entity relationships.

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

**Some CDI patterns don't work**: We had a few places using `CDI.current().select()` dynamically. Quarkus does build-time optimization, so dynamic bean lookup is limited. We refactored to use `Instance<T>` injection instead.

**Native compilation was tricky**: We wanted native images for even faster startup. Reflection-heavy code needed configuration. After spending two weeks fighting with it, we decided JVM mode was fast enough for our needs.

## Performance Numbers

Before (Java EE on Payara):
- Startup: 45 seconds
- Memory: 512MB heap
- First request latency: ~200ms (after warmup)

After (Quarkus JVM mode):
- Startup: 1.8 seconds
- Memory: 128MB heap
- First request latency: ~50ms

The memory savings alone justified the migration for our Kubernetes deployment. We run more replicas with the same resources.

## Lessons Learned

**Don't migrate everything at once**. We extracted seven services over 18 months. Each one taught us something.

**Write integration tests first**. Before touching any code, we wrote tests that verified the API contract. This caught regressions we would have missed.

**Keep the old system running**. For months, we ran both systems and compared results. This saved us multiple times when the new code had subtle bugs.

**Expect productivity to drop initially**. The team needed time to learn Quarkus idioms. We were slower for the first few services.

## Would I Do It Again?

Absolutely. The improved developer experience alone was worth it. Our deployment frequency went from weekly to multiple times per day because we're no longer afraid of slow rollbacks.

But I'd plan for a longer timeline. We estimated 12 months and took 18. That's not unusual for this kind of migration.
