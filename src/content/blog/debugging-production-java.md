---
title: "How I Debug Production Issues in Java Applications"
description: "The tools and techniques I actually use when something breaks at 2 AM."
date: 2020-09-12
tags: ["java", "debugging", "production", "monitoring"]
---

Nobody wants that 2 AM PagerDuty alert. But when it comes, you need to diagnose and fix fast. Over the years, I've built a toolkit for production debugging that has saved me countless times.

## First: Don't Panic

I've seen developers SSH into production and start changing things immediately. Resist this urge. Take 60 seconds to understand what's actually happening.

Check the basics first:
- Is the service up?
- Are dependencies healthy?
- Did something change recently? (Deploy, config change, traffic spike)
- What do the metrics show?

Most incidents fall into a few categories: memory issues, thread problems, slow dependencies, or bad deployments. Knowing which you're dealing with guides your investigation.

## The Tools I Actually Use

### Thread Dumps

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

### Heap Dumps

For memory issues, nothing beats a heap dump:

```bash
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

I analyze these with Eclipse MAT (Memory Analyzer Tool). The "Leak Suspects" report usually points directly at the problem.

One gotcha: heap dumps pause the JVM. On a busy production server, this can cause timeout errors. I usually dump on a replica I've pulled from the load balancer.

### GC Logs

If you're not already logging GC, start now:

```
-Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=5,filesize=10M
```

When memory issues hit, these logs show you:
- How often GC runs
- How much time is spent in GC
- Whether memory is actually being reclaimed

Long GC pauses correlate directly with latency spikes. I've caught memory leaks by noticing GC frequency increasing over time.

### Async Profiler

For CPU issues, async-profiler generates flame graphs without significant overhead:

```bash
./profiler.sh -d 30 -f profile.html <pid>
```

The flame graph shows exactly where CPU time goes. Wide boxes at the top are where to focus optimization efforts.

## A Real Debugging Session

Last month, our API started timing out randomly. Here's how I diagnosed it.

**Step 1: Check metrics**. Latency percentiles showed p99 spiking while p50 was normal. This suggested a subset of requests were slow, not all of them.

**Step 2: Thread dump**. Found 40 threads stuck in `SocketInputStream.read()`, all connecting to our cache server.

**Step 3: Check the cache**. Redis was healthy, but network metrics showed packet loss to that subnet.

**Step 4: Root cause**. A network switch was flapping. Infra team fixed it.

Total time: 15 minutes. Without the thread dump, I would have spent hours looking at application code.

## Things I Always Have Ready

- **JDK tools available**: `jcmd`, `jstack`, `jmap` should be in the container
- **Heap dump location with space**: Know where dumps will go and ensure there's room
- **Profiler ready to attach**: Have async-profiler installed, know how to use it
- **Log aggregation working**: You can't debug without logs

## Prevention

The best debugging session is one that never happens. I've learned to:

- Add circuit breakers around external calls
- Set sensible timeouts everywhere (never use infinite timeouts)
- Monitor queue depths and thread pool saturation
- Alert on error rate increases, not just errors

Our monitoring now catches most issues before users notice. When something does slip through, the tools above help me fix it quickly.

## One More Thing

Document your incidents. After fixing something, write down:
- What broke
- How you diagnosed it
- What you did to fix it
- How to prevent it

Future you (or your teammates) will thank you.
