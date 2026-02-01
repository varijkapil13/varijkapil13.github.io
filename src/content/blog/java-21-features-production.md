---
title: "Java 21 Features We're Actually Using in Production"
description: "A look at the Java 21 features that have made a real difference in our enterprise applications."
date: 2025-01-10
tags: ["java", "enterprise", "backend"]
---

Java 21 is the latest LTS release, and after running it in production for several months, I want to share which new features have genuinely improved our codebase.

## Virtual Threads (Project Loom)

This is the headline feature, and it lives up to the hype. Virtual threads have transformed how we handle concurrent operations.

### Before: Thread Pool Management

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

### After: Virtual Threads

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

In our API gateway, virtual threads allowed us to handle **10x more concurrent connections** with the same hardware.

### Structured Concurrency (Preview)

Even better, structured concurrency makes concurrent code easier to reason about:

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

All tasks are scoped together - if one fails, others are cancelled automatically.

## Record Patterns

Pattern matching for records makes data extraction cleaner:

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

## Pattern Matching for Switch

Combined with sealed classes, this is incredibly powerful:

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

## Sequenced Collections

Finally, a proper way to access first/last elements:

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

## String Templates (Preview)

String templates make string composition safer and cleaner:

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

## Practical Tips for Migration

### 1. Start with Virtual Threads

If you're using thread pools for I/O-bound operations, switching to virtual threads is usually straightforward:

```java
// Find these patterns
ExecutorService executor = Executors.newFixedThreadPool(100);
ExecutorService executor = Executors.newCachedThreadPool();

// Replace with
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
```

### 2. Update Your Records

If you're already using records, you can immediately benefit from record patterns in switch statements.

### 3. Gradual Adoption

You don't need to use everything at once. We started with:
1. Virtual threads (biggest impact)
2. Sequenced collections (quality of life)
3. Record patterns (where applicable)

## Performance Results

After migrating our main API service to Java 21 with virtual threads:

| Metric | Before | After |
|--------|--------|-------|
| Max concurrent requests | 2,000 | 20,000 |
| P99 latency | 450ms | 180ms |
| Memory usage | 8GB | 6GB |
| Thread count | 500 | 50 platform + thousands virtual |

## Conclusion

Java 21 is a significant release. Virtual threads alone justify the upgrade for any I/O-heavy application. Combined with pattern matching improvements and other features, it makes Java code more expressive and efficient.

If you're still on Java 11 or 17, Java 21 is worth the migration effort. The new features aren't just syntactic sugar - they enable fundamentally better approaches to common problems.
