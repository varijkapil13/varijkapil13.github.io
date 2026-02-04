---
title: "Applying Team Topologies: What Actually Changed for Us"
description: "How we restructured our engineering organization using Team Topologies principles and what we learned."
date: 2024-09-15
tags: ["team-topologies", "engineering", "organization", "leadership"]
---

A year ago, I read Team Topologies by Matthew Skelton and Manuel Pais. It resonated with problems we were having—teams stepping on each other's toes, unclear ownership, and too much coordination overhead. We decided to reorganize. Here's what happened.

## The Problem We Had

Our structure was typical for a company our size: teams organized by technology layer. Frontend team, backend team, database team, DevOps team. Every feature required coordination across all of them.

A simple change to add a field would go like this:
1. Backend team adds the field to the API
2. Frontend team waits, then updates the UI
3. Database team schedules the migration
4. DevOps deploys everything in the right order

A three-day task took two weeks because of handoffs and waiting.

## The Four Team Types

Team Topologies defines four types:

1. **Stream-aligned teams**: Deliver value directly to customers, own a slice of the product
2. **Platform teams**: Provide internal services that make stream-aligned teams faster
3. **Enabling teams**: Help other teams adopt new capabilities
4. **Complicated subsystem teams**: Own technically complex components

We didn't have stream-aligned teams. Everyone was either "platform" (infrastructure) or undefined (the feature teams that crossed boundaries constantly).

## How We Restructured

We identified three main value streams in our product:
- Customer onboarding and management
- Core transaction processing
- Reporting and analytics

Each became a stream-aligned team. They own everything from database to UI for their domain. No more handoffs for typical features.

We created one platform team responsible for:
- Kubernetes infrastructure
- CI/CD pipelines
- Observability stack
- Common libraries

Their job is to make the stream-aligned teams faster, not to be a bottleneck.

We didn't create explicit enabling teams, but our senior engineers rotate through teams to share knowledge. This works for our size.

## What Changed Day-to-Day

**Less coordination meetings**. Before, we had daily cross-team syncs. Now, most work happens within teams. We sync between teams weekly instead of daily.

**Clearer ownership**. When something breaks in customer onboarding, everyone knows who owns it. No more "that's the backend team's problem, but also the DevOps team needs to look at it."

**Faster delivery**. That three-day task that took two weeks? Now it actually takes three days. Teams can make changes end-to-end without waiting.

**Some duplication**. Different teams have similar code for common patterns. We accept this as a cost of independence. The platform team extracts truly common stuff into shared libraries when patterns stabilize.

## The Hard Parts

**Conway's Law is real**. Our architecture didn't match the new team structure. We spent months splitting our monolith so each team could deploy independently. You can't just reorganize people without reorganizing code.

**Some people didn't like it**. Our "backend experts" suddenly had to learn some frontend. A few people left because they wanted to specialize deeply. We hired differently—looking for T-shaped people who could work across the stack.

**Platform team sizing is tricky**. Too small and they can't keep up with requests. Too large and they start building things nobody asked for. We started with 3 people, grew to 5, and that seems right for 4 stream-aligned teams.

## Interaction Modes

Team Topologies describes three interaction modes:
- **Collaboration**: Working together closely (temporary)
- **X-as-a-Service**: Using another team's output via clear interface
- **Facilitating**: Helping another team learn something

We use X-as-a-Service for most platform capabilities. Stream-aligned teams use the CI/CD pipeline without needing to understand how it works.

We use collaboration temporarily when adopting new things. When we moved to Kubernetes, the platform team embedded with each stream-aligned team for a few weeks.

## Metrics That Improved

- **Lead time for changes**: From 2 weeks average to 3 days
- **Deployment frequency**: From weekly to daily
- **Escaped defects**: Down 40% (ownership means more careful attention)
- **Developer satisfaction**: Survey scores up significantly

## What I'd Do Differently

Start with architecture, not org structure. We reorganized teams first, then struggled to split the monolith. I'd get the architecture closer to target state first.

Over-communicate the "why." Some team members felt like they were being shuffled around arbitrarily. I should have explained the reasoning better and earlier.

Set clearer platform team expectations. Initially, stream-aligned teams expected the platform team to do whatever they asked. We had to establish that platform provides capabilities, not custom work.

## Is It Worth It?

For us, definitely yes. The reduced coordination overhead alone justified the change. Teams are happier because they can ship without waiting on others.

But it's not a quick fix. The transition took about six months of disruption. If your current structure is working okay, think carefully before reorganizing. Team Topologies is a tool, not a goal.
