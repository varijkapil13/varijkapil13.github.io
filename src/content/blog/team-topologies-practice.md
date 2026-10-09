---
title: "Applying Team Topologies: What Actually Changed for Us"
description: "How we restructured our engineering organization using Team Topologies principles and what we learned."
date: 2024-09-15
tags: ["team-topologies", "engineering", "organization", "leadership"]
---

A year ago I read Team Topologies by Matthew Skelton and Manuel Pais. It described problems we were having: teams stepping on each other's toes, unclear ownership, and too much coordination overhead. We decided to reorganize, and this is how it went.

## The problem we had

Our structure was typical for a company our size, with teams organized by technology layer: frontend, backend, database, and DevOps. Every feature needed coordination across all of them.

Adding a single field went like this:
1. Backend team adds the field to the API
2. Frontend team waits, then updates the UI
3. Database team schedules the migration
4. DevOps deploys everything in the right order

A three-day task took two weeks because of handoffs and waiting.

## The four team types

Team Topologies defines four types:

1. Stream-aligned teams deliver value directly to customers and own a slice of the product.
2. Platform teams provide internal services that make stream-aligned teams faster.
3. Enabling teams help other teams adopt new capabilities.
4. Complicated subsystem teams own technically complex components.

We didn't have stream-aligned teams. Everyone was either "platform" (infrastructure) or undefined (the feature teams that crossed boundaries constantly).

## How we restructured

We identified three main value streams in our product:
- Customer onboarding and management
- Core transaction processing
- Reporting and analytics

Each became a stream-aligned team that owns everything from database to UI for its domain, so typical features no longer need handoffs.

We created one platform team responsible for:
- Kubernetes infrastructure
- CI/CD pipelines
- Observability stack
- Common libraries

Their job is to make the stream-aligned teams faster without becoming a bottleneck themselves.

We didn't create explicit enabling teams. Instead, our senior engineers rotate through teams to share knowledge, which works at our size.

## What changed day to day

We have fewer coordination meetings. We used to hold cross-team syncs every day; now most work happens within a team, and teams sync with each other weekly.

Ownership is clearer. When something breaks in customer onboarding, everyone knows which team owns it. We no longer hear "that's the backend team's problem, but the DevOps team also needs to look at it."

Delivery is faster. The three-day task that used to take two weeks now takes three days, because teams can make changes end to end without waiting.

There is some duplication. Different teams have similar code for common patterns, and we accept that as the cost of independence. When a pattern stabilizes, the platform team pulls the truly common parts into shared libraries.

## The hard parts

Conway's Law caught up with us. Our architecture didn't match the new team structure, and we spent months splitting the monolith so each team could deploy independently. Reorganizing people without reorganizing the code doesn't work.

Some people didn't like the change. Our "backend experts" suddenly had to learn some frontend, and a few people left because they wanted to specialize deeply. We changed how we hired and started looking for T-shaped people who could work across the stack.

Sizing the platform team is tricky. If it's too small, it can't keep up with requests; if it's too large, it starts building things nobody asked for. We started with 3 people and grew to 5, which seems right for 4 stream-aligned teams.

## Interaction modes

Team Topologies describes three interaction modes:
- Collaboration: working together closely, for a limited time
- X-as-a-Service: using another team's output through a clear interface
- Facilitating: helping another team learn something

We use X-as-a-Service for most platform capabilities. Stream-aligned teams use the CI/CD pipeline without needing to understand how it works.

We switch to collaboration for a while when adopting something new. When we moved to Kubernetes, the platform team embedded with each stream-aligned team for a few weeks.

## Metrics that improved

- Lead time for changes: from an average of 2 weeks to 3 days
- Deployment frequency: from weekly to daily
- Escaped defects: down 40% (teams that own their code pay closer attention to it)
- Developer satisfaction: survey scores up significantly

## What I'd do differently

I'd start with the architecture. We reorganized teams first and then struggled to split the monolith; next time I'd get the architecture closer to its target state before moving people.

I'd explain the reasons far more often. Some team members felt they were being shuffled around arbitrarily, and I should have explained the reasoning better and earlier.

I'd set clearer expectations for the platform team. At first, stream-aligned teams expected it to do whatever they asked, and we had to establish that the platform team provides shared capabilities and doesn't take on custom work for individual teams.

## Is it worth it?

For us, yes. The reduced coordination overhead alone justified the change, and teams are happier because they can ship without waiting on others.

It isn't a quick fix, though. The transition meant about six months of disruption. If your current structure works reasonably well, think carefully before reorganizing; Team Topologies is a tool for solving problems you actually have.
