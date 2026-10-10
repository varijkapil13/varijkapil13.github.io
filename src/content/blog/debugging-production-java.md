---
title: "How I Debug Production Issues in Java Applications"
description: "The JVM tools I reach for when a Java service breaks at 2 AM, and how a thread dump turned random API timeouts into a fifteen-minute diagnosis."
date: 2020-09-12
image: "/images/blog/debugging-production-java.jpg"
tags: ["java", "debugging", "production", "monitoring"]
---

Nobody wants the 2 AM PagerDuty alert, but when it comes you need to find the problem and fix it fast. You can't attach a debugger to a production service that is serving real users, and you can't easily reproduce the problem on your laptop. What you can do is ask the running JVM what it is doing. Over the years I've settled on a small set of tools for that, and they've got me out of trouble more times than I can count. This post walks through them and through one incident where they paid off.

## First, don't panic

I've seen developers SSH into production and start changing things immediately. Don't. Every change you make before you understand the problem can hide the original cause or add a new one, so take 60 seconds to understand what's actually happening.

I start with the basics. Is the service up? Are its dependencies healthy? Did something change recently, such as a deploy, a config change or a traffic spike? And what do the metrics show? Most incidents fall into a few categories: memory issues, thread problems, slow dependencies, or bad deployments. Knowing which one you're dealing with tells you which of the tools below to pick up.

## The tools I actually use

### Thread dumps

A Java application does its work on threads, and when it seems stuck or slow, the question is what those threads are doing. A thread dump answers it: a snapshot of every thread in the JVM, its state, and the stack of method calls it is in at that moment. That makes thread dumps my first stop. `jcmd` ships with the JDK and prints one without stopping the application:

```bash
jcmd <pid> Thread.print > thread_dump.txt
```

A single dump only shows one instant, and a thread that happens to be in a slow method at that moment may be perfectly fine a second later. So I take three dumps, 10 seconds apart, and compare them. I look for threads stuck in the same place across all dumps, which usually means a deadlock or a slow operation. I look for many threads waiting on the same lock, which points to contention. And I look for threads in the BLOCKED state, meaning they are waiting to enter a `synchronized` block that another thread holds:

```bash
# Quick way to find blocking threads
grep -A 2 "BLOCKED" thread_dump.txt
```

The two lines after each match show where in the code the blocked thread is waiting, which is usually enough to see whether they all point at the same place.

### Heap dumps

When the problem is memory, for example the heap keeps growing or the service dies with an `OutOfMemoryError`, I go straight to a heap dump. It is a file containing the objects on the heap and the references between them, so you can see what is taking up the memory and what is keeping it alive:

```bash
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

I analyze these with Eclipse MAT (Memory Analyzer Tool). Its "Leak Suspects" report looks for objects that hold on to an unusually large share of the heap, and it usually points directly at the problem.

One gotcha: heap dumps pause the JVM while the heap is written to disk, and on a large heap that takes a while. On a busy production server, this can cause timeout errors for the users whose requests are in flight. I usually dump on a replica I've pulled from the load balancer, so no live traffic is waiting on it.

### GC logs

The garbage collector (GC) is the part of the JVM that frees memory no longer in use. While it works, it can pause the application, so its behavior shows up directly in response times. If you're not already logging GC, start now, because you can't turn the history on after the incident has happened:

```
-Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=5,filesize=10M
```

This writes all GC events to a log file with timestamps and rotates it across five files of 10 MB each, so it never fills the disk. When memory issues hit, these logs tell you how often GC runs, how much time is spent in GC, and whether memory is actually being reclaimed after each collection.

Long GC pauses line up directly with latency spikes. A leak also leaves a recognizable pattern: as live objects pile up, each collection frees less and the next one comes sooner. I've caught memory leaks just by noticing GC running more and more often over time.

### Async profiler

For CPU issues the question is which code is burning the CPU. async-profiler is a sampling profiler: many times per second it records what each thread is running, and it adds those samples up into a flame graph without significant overhead, which is why I'm comfortable running it in production:

```bash
./profiler.sh -d 30 -f profile.html <pid>
```

This profiles the process for 30 seconds and writes an interactive HTML flame graph. Each box is a method, stacked on top of the method that called it, and the width of a box is the share of samples it appeared in. The flame graph shows exactly where CPU time goes. The wide boxes at the top are methods that were running on the CPU themselves rather than waiting for something they called, and that is where I start optimizing.

## A real debugging session

Last month our API started timing out at random. A problem that shows up at random gives you no obvious request or input to start from, so this is how I tracked it down.

I started with the metrics. The p99 latency was spiking while p50 stayed normal. The p50 is the median request, and the p99 is the slowest one percent, so this pattern meant that typical requests were fine and only a subset of requests were slow. Something was hurting some requests and not others.

The next step was a thread dump. It showed 40 threads stuck in `SocketInputStream.read()`, all talking to our cache server. `read()` on a socket blocks until data arrives, so these threads had sent a request and were waiting for an answer that was taking far too long.

The obvious suspect was the cache itself, but Redis was healthy. The network metrics, though, showed packet loss to that subnet. When packets are lost, TCP has to retransmit them, which explains why some requests waited a long time while others went through normally. The root cause was a flapping network switch, which the infra team fixed.

The whole thing took 15 minutes. Without the thread dump, I would have spent hours looking at application code, because nothing about the symptom pointed outside the application.

## What I always have ready

These tools only help if they are available when the alert fires, and 2 AM is a bad time to install anything. So I make sure of a few things in advance:

- The JDK tools (`jcmd`, `jstack`, `jmap`) installed in the container
- A known location for heap dumps, with enough disk space to hold one
- async-profiler installed, and the know-how to attach it
- Working log aggregation, because you can't debug without logs

The first point matters more than it looks, since slim container images often include only a JRE, which doesn't ship these tools.

## Prevention

I'd rather not need any of this, so I've learned to build services that fail in more predictable ways. I add circuit breakers around external calls: when a dependency keeps failing, the breaker stops sending it requests for a while and fails fast, so threads don't pile up waiting on something that isn't going to answer. I set sensible timeouts everywhere and never use infinite timeouts, because without a timeout a thread waiting on a slow socket can wait forever, much like the threads in that incident. I monitor queue depths and thread pool saturation, which show trouble building up before requests start failing. And I alert on error rate increases, not just errors, since a service that handles a lot of traffic always has a few errors and the useful signal is a change in the rate.

Our monitoring now catches most issues before users notice. When something does slip through, I fall back on the tools above.

## Write it down

After fixing something, document the incident while it's still fresh: what broke, how you diagnosed it, what you did to fix it, and how to prevent it. The next time something similar breaks, you (or a teammate) will have a head start.
