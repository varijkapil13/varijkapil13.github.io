---
title: "Building Observability into Distributed Systems"
description: "Splitting our monolith into microservices broke the way we used to debug. Structured logs, metrics and distributed tracing gave us back a view of what our services were doing."
date: 2022-11-20
image: "/images/blog/observability-distributed-systems.jpg"
tags: ["observability", "monitoring", "microservices", "distributed-systems"]
---

When we had a monolith, debugging was straightforward. The whole application ran in one process, so you could attach a debugger, set breakpoints and step through the code until you found the line that misbehaved. Then we split into microservices, and suddenly a single request touched six different services, each in its own process with its own logs. An error in one service was often only the symptom of something that had gone wrong a few calls earlier somewhere else, and you can't step through a request that hops across six processes. The old approach didn't work anymore.

What we needed is usually called observability: being able to tell what a running system is doing from the data it emits about itself. This is how we built it up, and what we got wrong on the way.

## Logs, metrics, and traces

Observability is usually split into logs, metrics and traces, and you need all three because each answers a different question.

Logs tell you what happened. Each entry records one event in one service, which makes logs great for debugging specific issues once you know where to look, and not much help in finding where to look.

Metrics tell you how the system is behaving overall. A metric is a number tracked over time, like requests per second. Is latency increasing? Are errors spiking? Metrics answer aggregate questions like these cheaply, because they summarize instead of storing every event, but that also means they can't tell you which request went wrong.

Traces follow a single request. When a request fails, a trace shows you which service failed and why, even across service boundaries, which is the view we had lost when the monolith was split.

## Our logging setup

Structured logging was the first change. In a monolith you can read the lines around an error in one file. Once the logs of many services are collected in one place, you search them, and free text is hard to search. A line like this says something failed, but not which order, which customer or which request:

```
2022-10-12 10:23:45 ERROR Something went wrong with order processing
```

Structured logging writes each entry as data with named fields. We write JSON, so the same event looks like this:

```json
{
  "timestamp": "2022-10-12T10:23:45.123Z",
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

Structured logs are searchable. "Show me all errors for customer CUST-789 in the last hour" becomes a simple query. The `traceId` field matters most of all, as we'll see later.

We use SLF4J with Logback, writing JSON to stdout. SLF4J is the logging API our code calls and Logback is the library that formats and writes the entries. Writing to stdout keeps the services from managing log files; Fluentd collects the logs and ships them to Elasticsearch, and we search them in Kibana.

Adding the order and customer IDs to every log call by hand would be tedious and easy to forget. MDC, the Mapped Diagnostic Context, solves this. It is a small key-value map attached to the current thread, and Logback adds its contents to every entry written from that thread, so you fill it in once and every log statement below picks the values up:

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

Notice the `finally` block. Server threads are reused across requests, and the MDC belongs to the thread, so without `MDC.clear()` the next request on that thread would log the previous order's IDs.

## Metrics that matter

We started by collecting everything, which was a mistake. It feels safe, because you don't know yet which numbers you'll need, but with too many metrics, nobody looks at any of them.

Now we focus on two well-known methods that each name a few numbers to watch. The RED method looks at a service from its callers' point of view:

- Rate: requests per second
- Errors: failed requests per second
- Duration: request latency distribution

The USE method looks at the resources underneath, such as CPU, memory, thread pools and queues, and asks whether they are running out:

- Utilization: how busy is the resource?
- Saturation: how much work is queued?
- Errors: are operations failing?

Duration is a distribution because an average hides the slow requests: a handful of requests taking seconds barely moves the mean, while a high percentile such as the 99th shows them. With Micrometer, a timer can come from an annotation or be recorded by hand:

```java
// Micrometer makes this easy
@Timed(value = "order.process", histogram = true)
public void processOrder(Order order) {
    // ...
}

// Or manually
Timer.Sample sample = Timer.start(meterRegistry);
boolean success = false;
try {
    processOrder(order);
    success = true;
} finally {
    sample.stop(meterRegistry.timer("order.process",
        "status", success ? "success" : "failure",
        "tenant", order.getTenantId()));
}
```

With `histogram = true` the annotation publishes histogram buckets, so percentiles can be calculated later. The manual version is longer, but it can add tags that are only known when the work is done, like whether it succeeded, plus the tenant.

We export to Prometheus and visualize in Grafana. Prometheus collects the values from each service at regular intervals and stores them as time series, and alerts fire when error rates exceed thresholds or latency degrades.

## Distributed tracing

Metrics showed that something was wrong and logs showed what each service did, but neither followed one request between services. With tracing, a single request gets a trace ID that propagates across all services, so you can follow it end to end. Each step along the way is recorded as a span, with a start time, a duration and attributes, and all spans sharing a trace ID make up the trace.

We use OpenTelemetry. It's vendor-neutral, so our instrumentation isn't tied to one tracing backend, and it has good Java support. Auto-instrumentation creates spans for things like incoming HTTP requests without code changes, and manual spans cover business logic such as a payment:

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

The span is a child of `parentSpan`, so it lands in the right place in the trace, and it carries the amount, currency and result as attributes. `makeCurrent()` attaches anything that happens inside the block to this span. If the charge throws, the exception and an error status are recorded before it is re-thrown, and `finally` closes the span either way.

Traces flow to Jaeger (or Tempo, or whatever your backend is). When something fails, you can see exactly which service, which method, and how long each step took.

## Correlating logs, metrics, and traces

The real payoff comes from linking the three together through the trace ID. It should appear in log entries, error reports and span attributes, and in metric labels where cardinality allows. Cardinality is the number of distinct values a label can have. Prometheus stores every distinct label combination as its own time series, so a label with a new value for every request quickly becomes too expensive, which is why metrics carry the trace ID only where that cost is acceptable.

With those links in place, every alert gets the same treatment. When an alert fires for high error rate, I:

1. Look at the dashboard to see which endpoint
2. Click through to traces for failed requests
3. Find the trace ID
4. Search logs with that trace ID
5. See the full context of what happened

Each step narrows the search, from an endpoint to a request to the exact log lines, and this workflow takes minutes instead of hours.

## What we got wrong

The first problem was log volume. We logged every request body initially, and storage costs exploded. Now we log bodies only for errors, and even then we redact sensitive fields.

Our early traces had the opposite problem: missing context. They had spans but no useful attributes. "HTTP request" isn't helpful. "GET /api/orders/123 for customer ABC" is helpful.

We also sampled too aggressively. Sampling means keeping only some traces, and to reduce costs we sampled 1% of them. If the choice doesn't depend on what happened in the trace, rare failures are thrown away with everything else, and we couldn't debug rare issues. We switched to tail-based sampling, which decides after a trace is complete: it keeps all traces for errors and slow requests and samples the normal ones.

Finally, we ignored the baseline. We added observability but didn't establish what "normal" looked like. When alerts fired, we didn't know if 50ms latency was good or bad. A threshold means little without knowing normal behavior, so spend time understanding the baseline before setting alert thresholds.

## Start small

If you're just starting, don't try to do everything at once. Each step builds on the one before:

1. First: structured logging with trace correlation
2. Next: RED metrics for your most critical endpoints
3. Then: distributed tracing for cross-service requests
4. Finally: refine dashboards and alerts based on real incidents

You won't know up front which dashboards and alerts you need. Each incident teaches you something about what you need to see, so build incrementally based on what you actually needed while debugging.
