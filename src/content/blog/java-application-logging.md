---
title: "Java Logging Best Practices for Production Systems"
description: "When something breaks in production, the logs are often the only record of what happened. These are the logging habits that have made that record useful to me, from log levels to correlation IDs to keeping logging cheap."
date: 2021-06-15
image: "/images/blog/java-application-logging.jpg"
tags: ["java", "logging", "monitoring", "best-practices"]
---

When something goes wrong in production, you usually can't attach a debugger, you can't reproduce the exact request, and the user who saw the error has long since moved on. What you have is whatever the application wrote down while it was happening. With good logs, a production issue takes minutes to debug. With bad ones it takes hours, most of them spent guessing.

I've spent years troubleshooting production systems, and over that time I've come to treat logging as part of the design of an application rather than something sprinkled in afterwards. This post walks through the habits that have saved me again and again, roughly in the order you'd need them: deciding how important a message is, making logs searchable, tying lines from one request together, choosing what to write and what never to write, and keeping all of it cheap enough to leave switched on.

## Deciding how loud a message should be

Every logging framework lets you attach a level to a message, and you choose at runtime which levels are written. In production you might keep only INFO and above, and while investigating a problem you might switch one package to DEBUG. That only works if everyone uses the levels to mean the same thing. If one developer logs routine events as ERROR and another logs real failures as INFO, nobody can tell from the level whether to wake up, and alerts built on log levels become noise.

So the first habit is to agree on what each level means across the whole application. This is the convention I use, written down as code with the meaning next to each level:

```java
// ERROR: Something failed and needs attention
// - Exceptions that affect functionality
// - Failed external service calls after retries
log.error("Failed to process payment for order {}", orderId, exception);

// WARN: Something unexpected but handled
// - Retry attempts
// - Deprecated API usage
// - Performance degradation
log.warn("Database connection slow, query took {}ms", duration);

// INFO: Business events and application lifecycle
// - Request processing completed
// - Configuration loaded
// - Scheduled jobs started/completed
log.info("Order {} created for customer {}", orderId, customerId);

// DEBUG: Detailed information for troubleshooting
// - Method entry/exit with parameters
// - Intermediate values
// - External service request/response
log.debug("Calculating discount for items: {}", items);

// TRACE: Very detailed, usually disabled
// - Loop iterations
// - Every step in an algorithm
log.trace("Processing item {} of {}", index, total);
```

The line I care most about is the one between ERROR and WARN. ERROR means a human needs to look at it. WARN means something odd happened and the application dealt with it, like a retry that succeeded. If you keep that line clean, an ERROR in your logs means something, and that matters later when you build alerts on top of them.

## Writing logs a machine can read

A plain log line like "Order 12345 processed in 45ms" is easy for a person to read and awkward for a computer. Once logs from many servers end up in a central system, you want to ask questions like "show me every order for this customer" or "which orders took longer than a second", and with free text that means writing fragile regular expressions.

Structured logging solves this by writing each log entry as a set of named fields, usually as JSON. With SLF4J and Logback you can do that through the logstash encoder, which provides helpers for attaching key-value pairs to a message:

```java
// Using SLF4J with Logback and logstash-encoder
import static net.logstash.logback.argument.StructuredArguments.*;

log.info("Order processed",
    kv("orderId", order.getId()),
    kv("customerId", order.getCustomerId()),
    kv("amount", order.getTotalAmount()),
    kv("itemCount", order.getItems().size()),
    kv("processingTimeMs", duration));
```

What comes out is one JSON object per log entry, with the message and every field as a separate property:

```json
{
  "timestamp": "2021-05-10T14:30:00.000Z",
  "level": "INFO",
  "message": "Order processed",
  "orderId": "ORD-12345",
  "customerId": "CUST-789",
  "amount": 150.00,
  "itemCount": 3,
  "processingTimeMs": 45
}
```

Now `processingTimeMs` is a number your log system can filter and graph, and `customerId` is a field you can search on exactly instead of hoping the text matches.

## Tying one request's lines together with MDC

Structured fields help with a single line, but a production problem rarely lives in a single line. One request might produce twenty log entries across a resource, a service, a repository and a call to another system, and on a busy server those twenty lines are interleaved with thousands of lines from other requests. Without something that ties them together, finding "everything that happened during this one failed request" is close to impossible.

The tool for this in the Java logging world is MDC, the Mapped Diagnostic Context. It is a small map of values attached to the current thread. Anything you put into it is added to every log entry written from that thread until you remove it, without you having to pass it into each log call. The natural place to fill it is at the edge of the application, when a request comes in. In a JAX-RS application that means a filter that runs before and after every request:

```java
@Provider
@Priority(Priorities.USER)
public class LoggingContextFilter implements ContainerRequestFilter, ContainerResponseFilter {

    @Override
    public void filter(ContainerRequestContext request) {
        // Generate or extract correlation ID
        String correlationId = request.getHeaderString("X-Correlation-ID");
        if (correlationId == null) {
            correlationId = UUID.randomUUID().toString();
        }

        // Add to MDC - automatically included in all logs
        MDC.put("correlationId", correlationId);
        MDC.put("method", request.getMethod());
        MDC.put("path", request.getUriInfo().getPath());

        // Add user context if authenticated
        SecurityContext security = request.getSecurityContext();
        if (security.getUserPrincipal() != null) {
            MDC.put("userId", security.getUserPrincipal().getName());
        }
    }

    @Override
    public void filter(ContainerRequestContext request,
                       ContainerResponseContext response) {
        // Pass correlation ID to response
        response.getHeaders().add("X-Correlation-ID", MDC.get("correlationId"));

        // Clean up MDC
        MDC.clear();
    }
}
```

There are three details worth noticing. The correlation ID is taken from the incoming `X-Correlation-ID` header if a caller already sent one, so a request that passes through several services keeps the same ID everywhere, and a new one is generated only when the request starts here. The ID is also sent back in the response, so when someone reports an error they can give you the ID and you can search for it directly. And the response filter clears the MDC at the end. Application servers reuse threads from a pool, so if you forget this step, the next request handled by that thread would start out with the previous user's ID in its logs.

For plain text output, the Logback pattern picks the MDC values up with `%X{...}`, and the `:-anonymous` part supplies a default when there is no user:

```xml
<pattern>%d{ISO8601} [%X{correlationId}] [%X{userId:-anonymous}] %-5level %logger{36} - %msg%n</pattern>
```

## What to write down

With levels, structure and context in place, the remaining question is what deserves a log line at all. My rule of thumb is to log the things I'd want to know when reconstructing an incident: how the application was configured when it started, who did what, which business transactions happened, how long calls to other systems took, and the full details of anything that failed.

```java
// Application startup and configuration
log.info("Application starting with profile: {}", activeProfile);
log.info("Database connection pool: min={}, max={}", minPool, maxPool);

// Security events
log.info("User {} logged in from IP {}", username, ipAddress);
log.warn("Failed login attempt for user {} from IP {}", username, ipAddress);

// Business transactions
log.info("Order {} submitted: {} items, total={}", orderId, itemCount, total);

// External service calls
log.debug("Calling payment service for order {}", orderId);
log.info("Payment service responded in {}ms with status {}", duration, status);

// Errors with full context
log.error("Failed to send email to {}: {}", email, exception.getMessage(), exception);
```

The startup lines look boring, but they answer a question that comes up surprisingly often during an incident: was this instance even running with the configuration we think it was? Logging the call to an external service at DEBUG and its result at INFO keeps the normal logs short while still recording how long the other side took to answer.

## What never to write down

The opposite list matters just as much. Logs get copied into central systems, kept for a long time and read by many more people than the production database is. Anything you write into them should be treated as widely visible. Passwords, card numbers, national identifiers like social security numbers, and authentication tokens never belong there. If you need to know which card a payment used, log a masked version:

```java
// NEVER log sensitive data
log.info("User password: {}", password);          // NEVER
log.info("Credit card: {}", cardNumber);          // NEVER
log.info("SSN: {}", socialSecurityNumber);        // NEVER
log.info("Auth token: {}", authToken);            // NEVER

// Mask sensitive data if needed
log.info("Processing card ending in {}", maskCardNumber(cardNumber));
```

## Logging exceptions so they're still useful later

When an exception is the reason you're looking at the logs, the stack trace is usually the most valuable thing in them, because it tells you exactly where the failure happened and what called it. The two usual mistakes are losing the stack trace and logging the exception twice:

```java
// Bad: loses stack trace
log.error("Error: " + exception.getMessage());

// Bad: logs exception twice
log.error("Error: " + exception.getMessage(), exception);

// Good: message + exception as last argument
log.error("Failed to process order {}: {}", orderId, exception.getMessage(), exception);

// For expected exceptions, consider WARN without stack trace
try {
    externalService.call();
} catch (ServiceUnavailableException e) {
    log.warn("External service unavailable, will retry: {}", e.getMessage());
    // Retry logic...
} catch (Exception e) {
    log.error("Unexpected error calling external service", e);
    throw e;
}
```

The first version only writes the message, so the stack trace is gone for good. The version marked good relies on a convention in SLF4J: when the last argument to a logging call is an exception and there is no `{}` placeholder left for it, SLF4J treats it as the exception of the log entry and prints its full stack trace. The message still uses placeholders, so it also says which order failed.

The `try` block at the end shows the other half of the decision. Some exceptions are expected. A downstream service that is briefly unavailable and will be retried is the "unexpected but handled" case from the levels section, so it gets a WARN with just the message. Anything you didn't anticipate gets an ERROR with the full stack trace and is rethrown, so it isn't silently swallowed.

## Keeping logging cheap

All of this only helps if logging stays switched on, and it only stays switched on if it doesn't slow the application down. There are two places where logging costs more than it should.

The first is building log messages that are never written. If you concatenate a string for a DEBUG message, Java builds that string before the logger ever checks whether DEBUG is enabled. With parameterized logging the logger checks the level first and only formats the message if it will be written. When even computing the argument is expensive, an explicit level check skips the work entirely:

```java
// Bad: toString() called even if DEBUG is disabled
log.debug("Processing items: " + items.toString());

// Good: parameterized logging, evaluated only if needed
log.debug("Processing items: {}", items);

// For expensive operations, check level first
if (log.isDebugEnabled()) {
    String expensiveData = calculateExpensiveDebugInfo();
    log.debug("Debug info: {}", expensiveData);
}
```

The second is the cost of writing itself. By default the thread that logs also does the I/O, so a slow disk makes your requests slow. For high-throughput systems, Logback's `AsyncAppender` puts log events on an in-memory queue and lets a background thread write them out:

```xml
<!-- logback.xml -->
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <queueSize>10000</queueSize>
    <discardingThreshold>0</discardingThreshold>
    <includeCallerData>false</includeCallerData>
    <appender-ref ref="FILE"/>
</appender>

<root level="INFO">
    <appender-ref ref="ASYNC"/>
</root>
```

Two settings in this configuration are deliberate choices. By default, once the queue is mostly full, the async appender starts dropping TRACE, DEBUG and INFO events to protect the application. A `discardingThreshold` of 0 turns that off, so no events are dropped and the application waits instead when the queue is completely full. And `includeCallerData` is off because finding the class and line that made the log call is expensive.

## Different output for production and development

The JSON from earlier is ideal for a log aggregation system like ELK or Splunk, and miserable to read in a terminal while you're developing. So I write JSON in production and readable, colored text in development. With Spring profiles, both can live in one Logback configuration:

```xml
<!-- logback-spring.xml -->
<configuration>
    <springProfile name="production">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder class="net.logstash.logback.encoder.LogstashEncoder">
                <includeMdcKeyName>correlationId</includeMdcKeyName>
                <includeMdcKeyName>userId</includeMdcKeyName>
                <customFields>{"service":"order-service","env":"${ENV}"}</customFields>
            </encoder>
        </appender>

        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>

    <springProfile name="development">
        <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
            <encoder>
                <pattern>%d{HH:mm:ss.SSS} %highlight(%-5level) [%thread] %cyan(%logger{36}) - %msg%n</pattern>
            </encoder>
        </appender>

        <root level="DEBUG">
            <appender-ref ref="CONSOLE"/>
        </root>
    </springProfile>
</configuration>
```

This is also where the earlier pieces come together. The production encoder includes the correlation ID and user ID from the MDC as JSON fields, and `customFields` stamps every entry with the service name and environment, so once logs from many services land in one place you can still tell them apart.

Log levels follow the same split. In development I want to see my own code at DEBUG and the SQL that Hibernate generates. In production the root level goes up to WARN so that libraries stay quiet, while our own packages stay at INFO so business events are still recorded:

```yaml
# application-dev.yml
logging:
  level:
    root: INFO
    com.mycompany: DEBUG
    org.hibernate.SQL: DEBUG

# application-prod.yml
logging:
  level:
    root: WARN
    com.mycompany: INFO
    org.hibernate: WARN
```

## Two patterns I keep coming back to

Two small patterns appear in almost every service I write. The first logs method entry and exit at DEBUG. Most of the time those lines are switched off and cost nothing, but when something odd is happening in one method, turning on DEBUG for that package shows exactly what went in and what came out. The failure path logs at ERROR with the request and rethrows, so the failure is visible even with DEBUG off:

```java
public Order processOrder(OrderRequest request) {
    log.debug("processOrder() called with request: {}", request);

    try {
        Order result = doProcess(request);
        log.debug("processOrder() returning: {}", result.getId());
        return result;
    } catch (Exception e) {
        log.error("processOrder() failed for request: {}", request, e);
        throw e;
    }
}
```

The second times long-running operations like a data sync. It logs when the operation starts, how many records it handled and how long it took, and on failure, how long it ran before it failed. That last number is often the first clue: a sync that fails after a few milliseconds has a different problem than one that fails after exactly the length of some timeout.

```java
public void syncData() {
    long start = System.currentTimeMillis();
    log.info("Starting data sync");

    try {
        int count = performSync();
        long duration = System.currentTimeMillis() - start;
        log.info("Data sync completed: {} records in {}ms", count, duration);
    } catch (Exception e) {
        long duration = System.currentTimeMillis() - start;
        log.error("Data sync failed after {}ms", duration, e);
        throw e;
    }
}
```

None of these habits is hard on its own. What makes them work is that they're applied everywhere, from the first commit, because the logs you need during an incident are the ones somebody decided to write months before it. Whenever I've been able to find the cause of a production problem in minutes, it was because those lines were already there, with a level that meant something, a correlation ID that tied them together, and nothing in them that shouldn't have been written down.
