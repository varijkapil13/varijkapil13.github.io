---
title: "Building Observability into Distributed Systems"
description: "The logging, metrics, and tracing setup that helped us understand what our microservices were doing."
date: 2022-11-20
tags: ["observability", "monitoring", "microservices", "distributed-systems"]
---

When we had a monolith, debugging was straightforward. Attach a debugger, set breakpoints, step through code. Then we split into microservices, and suddenly a single request touched six different services. The old approach didn't work anymore.

## Logs, metrics, and traces

Observability is usually split into logs, metrics, and traces, and you need all three because each answers a different question.

Logs tell you what happened. They're great for debugging specific issues once you know where to look.

Metrics tell you how the system is behaving overall. Is latency increasing? Are errors spiking? Metrics answer aggregate questions like these.

Traces follow a single request. When a request fails, a trace shows you which service failed and why, even across service boundaries.

## Our logging setup

Structured logging was the first change. No more:

```
2024-01-15 10:23:45 ERROR Something went wrong with order processing
```

Instead:

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "ERROR",
  "message": "Order processing failed",
  "orderId": "ORD-12345",
  "customerId": "CUST-789",
  "service": "order-service",
  "traceId": "abc123def456",
  "error": "Payment declined",
  "duration_ms": 234
}
```

Structured logs are searchable. "Show me all errors for customer CUST-789 in the last hour" becomes a simple query.

We use SLF4J with Logback, writing JSON to stdout. Fluentd collects the logs and ships them to Elasticsearch, and we search them in Kibana.

```java
// MDC (Mapped Diagnostic Context) adds context to all logs
MDC.put("orderId", order.getId());
MDC.put("customerId", order.getCustomerId());
MDC.put("traceId", span.getTraceId());

try {
    processOrder(order);
    log.info("Order processed successfully");
} catch (PaymentException e) {
    log.error("Order processing failed", e);
    throw e;
} finally {
    MDC.clear();
}
```

## Metrics that matter

We started by collecting everything, which was a mistake. With too many metrics, nobody looks at any of them.

Now we focus on the RED method for services:

- **Rate**: Requests per second
- **Errors**: Failed requests per second
- **Duration**: Request latency distribution

And the USE method for resources:

- **Utilization**: How busy is the resource?
- **Saturation**: How much work is queued?
- **Errors**: Are operations failing?

```java
// Micrometer makes this easy
@Timed(value = "order.process", histogram = true)
public void processOrder(Order order) {
    // ...
}

// Or manually
Timer.Sample sample = Timer.start(meterRegistry);
try {
    processOrder(order);
} finally {
    sample.stop(meterRegistry.timer("order.process",
        "status", success ? "success" : "failure",
        "tenant", order.getTenantId()));
}
```

We export to Prometheus and visualize in Grafana. Alerts fire when error rates exceed thresholds or latency degrades.

## Distributed tracing

With tracing, a single request gets a trace ID that propagates across all services, so you can follow it end to end.

We use OpenTelemetry. It's vendor-neutral and has good Java support.

```java
// Auto-instrumentation handles most cases
// Manual spans for custom logic
Span span = tracer.spanBuilder("process-payment")
    .setParent(Context.current().with(parentSpan))
    .setAttribute("payment.amount", amount)
    .setAttribute("payment.currency", currency)
    .startSpan();

try (Scope scope = span.makeCurrent()) {
    PaymentResult result = paymentGateway.charge(amount);
    span.setAttribute("payment.result", result.getStatus());
} catch (Exception e) {
    span.recordException(e);
    span.setStatus(StatusCode.ERROR, e.getMessage());
    throw e;
} finally {
    span.end();
}
```

Traces flow to Jaeger (or Tempo, or whatever your backend is). When something fails, you can see exactly which service, which method, and how long each step took.

## Correlating logs, metrics, and traces

The real payoff comes from linking the three together. A trace ID should appear in:

- Log entries
- Metric labels (where cardinality allows)
- Error reports
- Span attributes

When an alert fires for high error rate, I:

1. Look at the dashboard to see which endpoint
2. Click through to traces for failed requests
3. Find the trace ID
4. Search logs with that trace ID
5. See the full context of what happened

This workflow takes minutes instead of hours.

## What we got wrong

**Too much log volume**. We logged every request body initially. Storage costs exploded. Now we log bodies only for errors, and even then we redact sensitive fields.

**Missing context**. Early traces had spans but no useful attributes. "HTTP request" isn't helpful. "GET /api/orders/123 for customer ABC" is helpful.

**Sampling too aggressively**. To reduce costs, we sampled 1% of traces. Then we couldn't debug rare issues. We switched to tail-based sampling, which keeps all traces for errors and slow requests and samples the normal ones.

**Ignoring the baseline**. We added observability but didn't establish what "normal" looked like. When alerts fired, we didn't know if 50ms latency was good or bad. Spend time understanding baseline behavior before setting alert thresholds.

## Start small

If you're just starting, don't try to do everything at once:

1. First: structured logging with trace correlation
2. Next: RED metrics for your most critical endpoints
3. Then: distributed tracing for cross-service requests
4. Finally: refine dashboards and alerts based on real incidents

Each incident teaches you something about what you need to see, so build incrementally based on what you actually needed while debugging.
