---
title: "Java 21 Features We're Actually Using in Production"
description: "Which Java 21 features we use in our enterprise applications after several months in production, and what they changed."
date: 2024-11-20
image: "/images/blog/java-21-features-production.jpg"
tags: ["java", "enterprise", "backend"]
---

Java 21 is the latest LTS release. We've been running it in production for several months, and these are the new features that have improved our codebase.

## Virtual threads (Project Loom)

This is the headline feature, and it lives up to the hype. Virtual threads changed how we write concurrent code.

### Before: thread pool management

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

### After: virtual threads

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

In our API gateway, virtual threads let us handle 10x more concurrent connections on the same hardware.

### Structured concurrency (preview)

Structured concurrency goes further and makes concurrent code easier to reason about:

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

All tasks share one scope, so if one fails, the others are cancelled automatically.

## Record patterns

Pattern matching for records makes pulling data out of them cleaner:

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

## Pattern matching for switch

This gets really useful with sealed classes, because the compiler checks that the switch covers every case:

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

## Sequenced collections

We finally have a proper way to get the first and last elements:

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

This is especially useful in streams:

```java
// Get first and last from any sequenced collection
var firstAndLast = List.of(
    collection.getFirst(),
    collection.getLast()
);
```

## String templates (preview)

String templates make building strings safer and easier to read:

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

## Practical tips for migration

### 1. Start with virtual threads

If you're using thread pools for I/O-bound operations, switching to virtual threads is usually straightforward:

```java
// Find these patterns
ExecutorService executor = Executors.newFixedThreadPool(100);
ExecutorService executor = Executors.newCachedThreadPool();

// Replace with
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
```

### 2. Use record patterns on your existing records

If you already use records, you can start using record patterns in switch statements right away.

### 3. Adopt gradually

You don't need to use everything at once. We started with:
1. Virtual threads (biggest impact)
2. Sequenced collections (quality of life)
3. Record patterns (where applicable)

## Performance results

After migrating our main API service to Java 21 with virtual threads:

| Metric | Before | After |
|--------|--------|-------|
| Max concurrent requests | 2,000 | 20,000 |
| P99 latency | 450ms | 180ms |
| Memory usage | 8GB | 6GB |
| Thread count | 500 | 50 platform + thousands virtual |

## Is it worth upgrading?

For any I/O-heavy application, virtual threads alone justify the upgrade. The pattern matching improvements and the other features make the code more expressive on top of that.

If you're still on Java 11 or 17, I think Java 21 is worth the migration effort. Virtual threads and sealed types with exhaustive switches change how you solve common problems, which is more than you get from syntactic sugar.
