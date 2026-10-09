---
title: "How I Debug Production Issues in Java Applications"
description: "The tools and techniques I actually use when something breaks at 2 AM."
date: 2020-09-12
image: "/images/blog/debugging-production-java.jpg"
tags: ["java", "debugging", "production", "monitoring"]
---

Nobody wants the 2 AM PagerDuty alert, but when it comes you need to find the problem and fix it fast. Over the years I've settled on a small set of tools for production debugging, and they've got me out of trouble more times than I can count.

## First, don't panic

I've seen developers SSH into production and start changing things immediately. Don't. Take 60 seconds to understand what's actually happening.

Check the basics first:
- Is the service up?
- Are dependencies healthy?
- Did something change recently? (Deploy, config change, traffic spike)
- What do the metrics show?

Most incidents fall into a few categories: memory issues, thread problems, slow dependencies, or bad deployments. Knowing which you're dealing with guides your investigation.

## The tools I actually use

### Thread dumps

When an application seems stuck or slow, thread dumps are my first stop:

```bash
jcmd <pid> Thread.print > thread_dump.txt
```

I take three dumps, 10 seconds apart. Then I look for:

- Threads stuck in the same place across all dumps (likely deadlock or slow operation)
- Many threads waiting on the same lock (contention)
- Threads in BLOCKED state

```bash
# Quick way to find blocking threads
grep -A 2 "BLOCKED" thread_dump.txt
```

### Heap dumps

For memory issues I go straight to a heap dump:

```bash
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

I analyze these with Eclipse MAT (Memory Analyzer Tool). The "Leak Suspects" report usually points directly at the problem.

One gotcha: heap dumps pause the JVM. On a busy production server, this can cause timeout errors. I usually dump on a replica I've pulled from the load balancer.

### GC logs

If you're not already logging GC, start now:

```
-Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=5,filesize=10M
```

When memory issues hit, these logs tell you:
- How often GC runs
- How much time is spent in GC
- Whether memory is actually being reclaimed

Long GC pauses line up directly with latency spikes. I've caught memory leaks just by noticing GC running more and more often over time.

### Async profiler

For CPU issues, async-profiler generates flame graphs without significant overhead:

```bash
./profiler.sh -d 30 -f profile.html <pid>
```

The flame graph shows exactly where CPU time goes. The wide boxes at the top are where I start optimizing.

## A real debugging session

Last month our API started timing out at random. This is how I tracked it down.

1. Metrics first. The p99 latency was spiking while p50 stayed normal, so only a subset of requests were slow.
2. A thread dump showed 40 threads stuck in `SocketInputStream.read()`, all talking to our cache server.
3. Redis itself was healthy, but the network metrics showed packet loss to that subnet.
4. The root cause was a flapping network switch, which the infra team fixed.

The whole thing took 15 minutes. Without the thread dump, I would have spent hours looking at application code.

## What I always have ready

- The JDK tools (`jcmd`, `jstack`, `jmap`) installed in the container
- A known location for heap dumps, with enough disk space to hold one
- async-profiler installed, and the know-how to attach it
- Working log aggregation, because you can't debug without logs

## Prevention

I'd rather not need any of this, so I've learned to:

- Add circuit breakers around external calls
- Set sensible timeouts everywhere (never use infinite timeouts)
- Monitor queue depths and thread pool saturation
- Alert on error rate increases, not just errors

Our monitoring now catches most issues before users notice. When something does slip through, I fall back on the tools above.

## Write it down

Document your incidents. After fixing something, write down:
- What broke
- How you diagnosed it
- What you did to fix it
- How to prevent it

The next time something similar breaks, you (or a teammate) will have a head start.
