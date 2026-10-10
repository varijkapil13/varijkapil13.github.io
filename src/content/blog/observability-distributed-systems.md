---
title: "Building Observability into Distributed Systems"
description: "Splitting our monolith into microservices broke the way we used to debug. This is how structured logs, metrics and distributed tracing gave us back a view of what our services were doing."
date: 2022-11-20
image: "/images/blog/observability-distributed-systems.jpg"
tags: ["observability", "monitoring", "microservices", "distributed-systems"]
---

When we had a monolith, debugging was straightforward. The whole application ran in one process, so when something misbehaved you could attach a debugger, set breakpoints and step through the code until you reached the line that did the wrong thing. Then we split into microservices, and suddenly a single request touched six different services. Each of them ran in its own process with its own logs, and the error you saw in one service was often only the symptom of something that had gone wrong a couple of calls earlier in another. You can't step through a request that hops across six processes, so the old approach didn't work anymore.

What we needed instead goes by the name observability: being able to tell what a running system is doing from the outside, using the data it emits about itself. This post is about how we built that up, what each piece is for, and the mistakes we made on the way.

## Three kinds of signal

Observability is usually split into logs, metrics and traces, and you need all three because each answers a different question.

Logs tell you what happened. A log entry is a record of one event in one service at one moment, so logs are great for debugging specific issues once you know where to look. They are much less helpful for finding out where to look in the first place.

Metrics tell you how the system is behaving overall. A metric is a number tracked over time, such as requests per second or the share of requests that fail. Is latency increasing? Are errors spiking? Metrics answer aggregate questions like these, and because they summarize instead of storing every event they are cheap to keep. The flip side is that a metric can tell you something is wrong without telling you which request it happened to.

Traces follow a single request. When a request fails, a trace shows you which service failed and why, even across service boundaries. That is exactly the view we lost when the monolith was split up.

## Making logs searchable

Structured logging was the first change. In a monolith you can open the log file and read the lines around an error. Once logs from several services and all their instances are collected into one place, you are searching instead of reading, and free text is hard to search. A line like this one tells you that something failed, but not which order, which customer or which request it was about, and every developer phrases these messages a little differently:

```
2024-01-15 10:23:45 ERROR Something went wrong with order processing
```

Structured logging means writing each entry as data with named fields rather than as a sentence. We write JSON, so the same event now looks like this:

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

Structured logs are searchable. Every field can be filtered on, so "Show me all errors for customer CUST-789 in the last hour" becomes a simple query. Keep an eye on the `traceId` field, because it becomes the thread that ties everything together later on.

The pipeline behind this is fairly standard. Our code logs through SLF4J, the common logging API in Java, with Logback as the implementation that formats each entry as JSON and writes it to stdout. Writing to stdout keeps the services out of the business of managing log files; something outside the process picks the output up. In our case that is Fluentd, which collects the logs and ships them to Elasticsearch, where they are indexed, and we search them in Kibana.

Adding the order ID and customer ID to every single log call by hand would be tedious, and someone would always forget. SLF4J has a feature for this called MDC, the Mapped Diagnostic Context. It is a small key-value map attached to the current thread, and the logging framework adds its contents to every entry written from that thread. You fill it in once at the start of a unit of work, and every log statement underneath picks the values up, even in code that knows nothing about orders:

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

The `finally` block is the part to notice. Server threads are reused from request to request, and the MDC belongs to the thread, so if you don't clear it, the next request handled on that thread starts out carrying the previous order's IDs and its logs end up pointing at the wrong customer.

## Metrics that matter

We started by collecting everything, which was a mistake. It feels like the safe choice, since you don't yet know which numbers you will need. In practice, with too many metrics, nobody looks at any of them, and the dashboards become walls of graphs that no one can read during an incident.

Now we focus on two well-known methods that each name a small set of numbers. For services we use the RED method, which measures a service from the point of view of whoever is calling it:

- Rate: requests per second
- Errors: failed requests per second
- Duration: the distribution of request latency

For resources underneath the services, things like CPU, memory, thread pools and queues, we use the USE method, which asks whether a resource is running out:

- Utilization: how busy is the resource?
- Saturation: how much work is queued?
- Errors: are operations failing?

Duration is tracked as a distribution and not as one average, because an average hides the slow requests. If most requests take a few milliseconds and a few take seconds, the average still looks fine while some users are waiting. Percentiles such as the 99th show that tail. Micrometer, the metrics library we use in Java, can record timings either with an annotation or by hand:

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

The annotation is the quick option, and `histogram = true` makes Micrometer publish histogram buckets so percentiles can be calculated later. The manual version takes more code, but it lets you attach tags that are only known once the work is done, such as whether it succeeded, so that one timer covers both durations and failure counts per tenant.

We export to Prometheus and visualize in Grafana. Prometheus regularly collects the current values from each service and stores them as time series, Grafana draws the dashboards, and alerts fire when error rates exceed thresholds or latency degrades.

## Distributed tracing

Metrics told us that something was wrong and logs told us what each service did, but neither could follow one request from service to service. Tracing fills that gap. With tracing, a single request gets a trace ID when it enters the system, and that ID propagates across all services, passed along with every call the request causes. Each piece of work along the way is recorded as a span, with a start time, a duration and attributes describing what it did. Put all spans with the same trace ID together and you can follow the request end to end.

We use OpenTelemetry. It's vendor-neutral, which means the instrumentation in our code doesn't tie us to one tracing backend, and it has good Java support. Its auto-instrumentation creates spans for common things like incoming HTTP requests and outgoing calls without any code changes, so you only write spans yourself for business logic you care about. Payment processing was one of those places:

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

The span is created as a child of `parentSpan`, so it appears in the right place in the request's trace. It carries the amount, the currency and the outcome as attributes, and `makeCurrent()` means anything that happens inside the block, including spans from the auto-instrumented HTTP client, is attached to it. If the charge throws, the exception and an error status are recorded on the span before it is re-thrown, and the `finally` block makes sure the span is closed either way.

Traces flow to Jaeger (or Tempo, or whatever your backend is). When something fails, you can see exactly which service, which method, and how long each step took.

## Correlating logs, metrics, and traces

Each signal is useful on its own, but the real payoff comes from linking the three together, and the link is the trace ID. It should appear in log entries, in error reports and in span attributes, and in metric labels where cardinality allows. Cardinality is the number of distinct values a label can take. In Prometheus every distinct combination of label values is stored as its own time series, so a label with a new value for every request would multiply storage until the metrics system can't cope. That is why the trace ID goes into metrics only where it is affordable, while logs and spans can always carry it.

With those links in place, investigating an alert follows the same steps every time. When an alert fires for high error rate, I:

1. Look at the dashboard to see which endpoint
2. Click through to traces for failed requests
3. Find the trace ID
4. Search logs with that trace ID
5. See the full context of what happened

Each step narrows the search: the metrics show which endpoint, the traces show which requests and which service, and the logs show what that service was doing at the time. This workflow takes minutes instead of hours.

## What we got wrong

Getting here involved a few wrong turns. The first was too much log volume. We logged every request body initially, and storage costs exploded. Now we log bodies only for errors, and even then we redact sensitive fields.

The opposite problem showed up in our traces: missing context. Early traces had spans but no useful attributes. A span called "HTTP request" isn't helpful when you are looking for a failed order, while "GET /api/orders/123 for customer ABC" is.

Then we were sampling too aggressively. Sampling means keeping only some traces to save storage, and to reduce costs we sampled 1% of traces. When the decision to keep a trace doesn't depend on what happened in it, the rare failures get thrown away along with everything else, and we couldn't debug rare issues. We switched to tail-based sampling, which waits until a trace is complete before deciding: it keeps all traces for errors and slow requests and samples the normal ones.

The last mistake was ignoring the baseline. We added observability but didn't establish what "normal" looked like. When alerts fired, we didn't know if 50ms latency was good or bad for that service. An alert threshold is only meaningful compared to normal behavior, so spend time understanding baseline behavior before setting alert thresholds.

## Start small

If you're just starting, don't try to do everything at once. Each step below builds on the one before it, starting with logs that already carry a trace ID:

1. First: structured logging with trace correlation
2. Next: RED metrics for your most critical endpoints
3. Then: distributed tracing for cross-service requests
4. Finally: refine dashboards and alerts based on real incidents

You won't know up front which dashboards and alerts you need. Each incident teaches you something about what you need to see, so build incrementally based on what you actually needed while debugging.
