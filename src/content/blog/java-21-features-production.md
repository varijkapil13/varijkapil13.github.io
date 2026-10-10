---
title: "Java 21 Features We're Actually Using in Production"
description: "We have run Java 21 in production for several months. This is the story of which new features made it into our everyday code, why, and what virtual threads did to our main API service."
date: 2024-11-20
image: "/images/blog/java-21-features-production.jpg"
tags: ["java", "enterprise", "backend"]
---

Every Java release comes with a long list of new features, and most teams I know read that list, nod, and then keep writing code the way they did before. Java 21 is the latest LTS (long-term support) release, which matters for enterprise teams like ours because LTS versions are the ones we can run in production for years with security updates. So when we moved our enterprise applications onto it, the question I cared about was simple: which of these features would we actually use, and which would stay in the release notes?

We have now been running Java 21 in production for several months, long enough to have an answer. A few features changed how we write code every day, one of them changed what our hardware can handle, and a couple are still marked as previews that we are watching rather than depending on. This post goes through them roughly in the order they mattered to us.

## Virtual threads, and why thread pools were always a compromise

To see why virtual threads are the headline feature of Java 21, it helps to remember how Java has handled concurrency until now. A classic Java thread, now called a platform thread, is a thin wrapper around a thread of the operating system. Operating system threads are expensive: each one reserves memory for its stack, and switching between them costs CPU time in the kernel. You can't create one for every incoming request when thousands arrive at once, so for years the standard answer has been a thread pool: create a fixed number of threads up front and let tasks queue up for them.

The trouble is picking that number. In a typical backend service most of the time is spent waiting, for the database, for another service, for a file. A thread that is waiting on I/O does nothing useful, but it still occupies a slot in the pool. If the pool is small, requests queue up behind threads that are just waiting. If it is large, you pay in memory and in context switching. This is what our code looked like, and the comments in it are the dilemma in two lines:

```java
// Managing thread pools was always a balancing act
ExecutorService executor = Executors.newFixedThreadPool(200);

// Too few threads = poor throughput
// Too many threads = memory issues and context switching overhead

List<Future<Result>> futures = new ArrayList<>();
for (Request request : requests) {
    futures.add(executor.submit(() -> processRequest(request)));
}
```

Virtual threads remove the need for that guess. A virtual thread is a thread managed by the JVM itself, not by the operating system. The JVM runs many virtual threads on top of a small number of platform threads, called carrier threads. When a virtual thread blocks on I/O, the JVM takes it off its carrier and lets another virtual thread run there until the I/O completes. Because a virtual thread is cheap to create and costs almost nothing while it waits, you no longer pool them. You create one per task and throw it away afterwards:

```java
// Just create as many virtual threads as you need
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Result>> futures = requests.stream()
        .map(request -> executor.submit(() -> processRequest(request)))
        .toList();

    // Process results
    for (Future<Result> future : futures) {
        handleResult(future.get());
    }
}
```

What I like about this is how little the code changes. It is still an `ExecutorService` and still `Future`s, so the programming model stays the plain, blocking style that everyone on the team can read and debug. Notice also the try-with-resources block: closing the executor waits for all submitted tasks to finish, so nothing leaks out of that block. I'd heard plenty of hype about virtual threads before we tried them, and in our case they lived up to it. In our API gateway they let us handle 10x more concurrent connections on the same hardware.

## Structured concurrency, still in preview

Once threads are cheap, a different problem becomes more visible. A single request often needs several independent pieces of data, and the natural thing is to fetch them in parallel. With plain executors, though, nothing ties those parallel tasks together. If one fails, the others keep running and their results get thrown away, and it's easy to forget to cancel them or to handle the error in the right place.

Structured concurrency, which is a preview feature in Java 21 and needs the `--enable-preview` flag, treats a group of concurrent tasks as one unit with a clear beginning and end. Here a request handler loads a user, their orders and their preferences at the same time:

```java
Response handleRequest(Request request) throws Exception {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        Supplier<User> user = scope.fork(() -> userService.getUser(request.getUserId()));
        Supplier<List<Order>> orders = scope.fork(() -> orderService.getOrders(request.getUserId()));
        Supplier<Preferences> prefs = scope.fork(() -> prefService.getPreferences(request.getUserId()));

        scope.join();           // Wait for all tasks
        scope.throwIfFailed();  // Propagate any errors

        return new Response(user.get(), orders.get(), prefs.get());
    }
}
```

The three tasks share one scope, so if one of them fails, the `ShutdownOnFailure` policy cancels the other two automatically and `throwIfFailed()` hands the error to the caller. The code reads top to bottom like sequential code, and the scope guarantees that no task outlives the method. That guarantee is what makes this kind of concurrent code easier to reason about.

## Record patterns: taking data apart in one step

The next group of features is less dramatic but shows up in far more places in our code. Records, which arrived in Java 16, are compact classes for plain data: you declare the components, and the compiler writes the constructor, accessors, `equals` and `hashCode` for you. What Java 21 adds is a way to take a record apart again. The example below shows how this kind of check has evolved, from the old cast, to the type pattern from Java 16, to the record pattern in Java 21 that pulls out the components directly:

```java
// Before
if (shape instanceof Circle) {
    Circle c = (Circle) shape;
    double radius = c.radius();
    // use radius
}

// With type patterns (Java 16+)
if (shape instanceof Circle c) {
    double radius = c.radius();
    // use radius
}

// With record patterns (Java 21)
if (shape instanceof Circle(double radius)) {
    // radius is directly available
    System.out.println("Circle with radius: " + radius);
}

// Nested patterns
if (shape instanceof Rectangle(Point(int x1, int y1), Point(int x2, int y2))) {
    int width = x2 - x1;
    int height = y2 - y1;
    System.out.println("Area: " + (width * height));
}
```

The nested case at the end is where it starts to pay off. A rectangle made of two points is matched and fully unpacked in a single line, and there's no intermediate variable that someone could later misuse.

## Pattern matching for switch, and letting the compiler count the cases

Record patterns get really useful once you combine them with `switch` and with sealed types. A sealed interface lists exactly which classes are allowed to implement it. That sounds like a restriction, and it is one on purpose: because the compiler knows the full list, it can check that a `switch` over that type handles every possibility. Payment methods are a good fit for this, since there is a fixed set of them and each needs different handling:

```java
sealed interface PaymentMethod permits CreditCard, BankTransfer, DigitalWallet {}

record CreditCard(String number, String expiry, String cvv) implements PaymentMethod {}
record BankTransfer(String iban, String bic) implements PaymentMethod {}
record DigitalWallet(String provider, String accountId) implements PaymentMethod {}

// Exhaustive switch - compiler ensures all cases are handled
String processPayment(PaymentMethod method, Amount amount) {
    return switch (method) {
        case CreditCard(var number, var expiry, _) ->
            processCreditCard(number, expiry, amount);

        case BankTransfer(var iban, var bic) ->
            processBankTransfer(iban, bic, amount);

        case DigitalWallet(var provider, var accountId) when provider.equals("PayPal") ->
            processPayPal(accountId, amount);

        case DigitalWallet(var provider, var accountId) ->
            processGenericWallet(provider, accountId, amount);
    };
}
```

There are a few things to notice. The switch has no `default` branch, and it doesn't need one, because the compiler can see that every permitted type is covered. If someone adds a fourth payment method to the `permits` list later, every switch like this one stops compiling until it handles the new case, which is exactly the moment you want to find out. The `when` clause adds a guard, so one kind of wallet gets special treatment before the general case. And the `_` in the credit card case says "there is a component here and I don't need it". That underscore, the unnamed pattern, is itself still a preview feature in Java 21 and became final in Java 22, so on 21 it needs the preview flag too.

## Sequenced collections: a small fix for an old annoyance

Not every improvement has to be clever. For as long as I have written Java, getting the first or last element of a collection depended on which collection you had. Lists used indexes, deques had their own methods, and ordered sets made you go through an iterator. Java 21 adds a `SequencedCollection` interface for every collection that has a defined order, and gives them all the same methods:

```java
// Before - inconsistent APIs
list.get(0);                    // First element
list.get(list.size() - 1);      // Last element
set.iterator().next();          // First element (if ordered)
deque.getFirst();               // First element
deque.getLast();                // Last element

// After - consistent API
SequencedCollection<String> collection = ...;
collection.getFirst();
collection.getLast();
collection.addFirst("new first");
collection.addLast("new last");
collection.reversed();  // Returns reversed view
```

The `reversed()` method returns a view rather than a copy, so iterating backwards no longer means building a new list first. It also makes small helper code read more naturally, for example when we only care about both ends of an ordered collection:

```java
// Get first and last from any sequenced collection
var firstAndLast = List.of(
    collection.getFirst(),
    collection.getLast()
);
```

## String templates, the preview we're watching

String templates are the feature I'm most curious about and least ready to depend on, because in Java 21 they are a preview. The problem they address is old. Building strings by concatenation is hard to read, and when the string is a SQL query it's dangerous, because any user input you glue into the query can change what the query does. That's how SQL injection happens.

A string template puts expressions directly into the string with `\{...}`, and a template processor decides what to do with them. `STR` simply interpolates, `FMT` adds format specifiers, and the interesting part is that you can write your own processor, for example one that turns a template into a `PreparedStatement` with bound parameters instead of a concatenated string:

```java
// Before - error prone
String query = "SELECT * FROM users WHERE name = '" + name + "' AND age > " + age;
// SQL injection vulnerability!

// With String Templates
String name = "John";
int age = 30;

// STR processor - simple interpolation
String message = STR."Hello \{name}, you are \{age} years old";

// FMT processor - with formatting
String formatted = FMT."Balance: %.2f\{balance}";

// Custom processor for SQL (safe!)
PreparedStatement stmt = SQL."SELECT * FROM users WHERE name = \{name} AND age > \{age}";
```

The `SQL` processor in the last line isn't part of the JDK. It stands for a processor you would write yourself, and the safety comes from the processor binding each value as a parameter. The idea makes strings both safer and easier to read, but as long as the feature is in preview its syntax can still change, so it stays out of our production code for now.

## How we went about the migration

When we planned the upgrade, the main decision was what to do first, and the answer followed from where the benefit was. Virtual threads had the biggest impact for the least code. If you use thread pools for I/O-bound work, switching is usually as small as replacing the factory method:

```java
// Find these patterns
ExecutorService executor = Executors.newFixedThreadPool(100);
ExecutorService executor = Executors.newCachedThreadPool();

// Replace with
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
```

The rest of the code that submits tasks and reads futures stays the same, which is what makes this such an easy first step. Record patterns are similarly low-risk if you already have records: you can start using them in `switch` statements right away, without touching the records themselves.

We did not try to use everything at once. Our order was:

1. Virtual threads (biggest impact)
2. Sequenced collections (quality of life)
3. Record patterns (where applicable)

None of these depends on the others, so each one can go in as its own change.

## What changed in the numbers

After we migrated our main API service to Java 21 with virtual threads, these are the numbers we saw:

| Metric | Before | After |
|--------|--------|-------|
| Max concurrent requests | 2,000 | 20,000 |
| P99 latency | 450ms | 180ms |
| Memory usage | 8GB | 6GB |
| Thread count | 500 | 50 platform + thousands virtual |

The thread count row explains the others. Before, every request in flight needed a platform thread, so concurrency was capped by how many threads we could afford. After, requests run on virtual threads, and a small number of platform threads carry them. P99 latency is the time within which 99 percent of requests complete, so it describes the slow tail that users notice, and it dropped from 450ms to 180ms while memory use went down as well.

## Was it worth it?

For any I/O-heavy application, I think virtual threads alone justify the upgrade. The pattern matching improvements and the other features make the code more expressive on top of that, but they aren't the reason to move.

If you're still on Java 11 or 17, I think Java 21 is worth the migration effort. Virtual threads, and sealed types with exhaustive switches, change how you solve common problems: you write plain blocking code and the JVM handles the waiting, and you let the compiler tell you when a new case hasn't been handled. That goes well beyond syntactic sugar, and after several months in production it is the part of the upgrade I'd least want to give back.
