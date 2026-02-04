---
title: "Java Logging Best Practices for Production Systems"
description: "Effective logging strategies that help you debug issues faster and monitor application health in production."
date: 2021-06-15
tags: ["java", "logging", "monitoring", "best-practices"]
---

Good logging is the difference between hours of debugging and minutes. After years of troubleshooting production issues, here are the logging practices that have saved me countless times.

## Choosing the Right Log Level

Use levels consistently across your application:

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

## Structured Logging

Make logs machine-parseable for better querying:

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

Output:
```json
{
  "timestamp": "2024-05-10T14:30:00.000Z",
  "level": "INFO",
  "message": "Order processed",
  "orderId": "ORD-12345",
  "customerId": "CUST-789",
  "amount": 150.00,
  "itemCount": 3,
  "processingTimeMs": 45
}
```

## MDC for Request Context

Add context that's automatically included in all log entries:

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

Logback configuration:

```xml
<pattern>%d{ISO8601} [%X{correlationId}] [%X{userId:-anonymous}] %-5level %logger{36} - %msg%n</pattern>
```

## What to Log

### Always Log

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

### Never Log

```java
// NEVER log sensitive data
log.info("User password: {}", password);          // NEVER
log.info("Credit card: {}", cardNumber);          // NEVER
log.info("SSN: {}", socialSecurityNumber);        // NEVER
log.info("Auth token: {}", authToken);            // NEVER

// Mask sensitive data if needed
log.info("Processing card ending in {}", maskCardNumber(cardNumber));
```

## Exception Logging

Log exceptions properly:

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

## Performance Considerations

### Avoid Expensive Operations in Log Statements

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

### Async Logging for High-Throughput Systems

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

## Log Aggregation Configuration

Configure for centralized logging (ELK, Splunk, etc.):

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

## Log Levels Per Environment

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

## Useful Logging Patterns

### Method Entry/Exit for Debugging

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

### Timed Operations

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

## Key Takeaways

1. **Use appropriate log levels** - ERROR for failures, INFO for business events
2. **Structure your logs** - JSON format for easier querying
3. **Add context with MDC** - Correlation IDs, user IDs, request paths
4. **Never log secrets** - Passwords, tokens, personal data
5. **Log exceptions properly** - Include stack trace for unexpected errors
6. **Consider performance** - Use parameterized logging, async appenders
7. **Configure per environment** - Verbose in dev, focused in production

Good logging is an investment that pays off during every production incident.
