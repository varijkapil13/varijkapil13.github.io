---
title: "Applying Team Topologies: What Actually Changed for Us"
description: "How we moved from teams organized by technology layer to stream-aligned teams and a platform team, what got better, and what I would do differently."
date: 2024-09-15
image: "/images/blog/team-topologies-practice.jpg"
tags: ["team-topologies", "engineering", "organization", "leadership"]
---

A year ago I read Team Topologies by Matthew Skelton and Manuel Pais, and it was uncomfortable reading, because it described problems we were having every week. Teams stepped on each other's toes, nobody was quite sure who owned what, and a large part of everyone's time went into coordinating with other teams instead of building things. We decided to reorganize around the ideas in the book. This is how that went, including the parts that were harder than I expected.

## How our teams used to be organized

Our structure was typical for a company our size. Teams were organized by technology layer: a frontend team, a backend team, a database team and a DevOps team. On paper that looks tidy, since each group of specialists sits together and owns its part of the stack. The trouble is that customers don't ask for layers. They ask for features, and almost every feature touches several layers at once, so every feature needed coordination across all four teams.

The simplest example was adding a single field to the product. It went like this:

1. Backend team adds the field to the API
2. Frontend team waits, then updates the UI
3. Database team schedules the migration
4. DevOps deploys everything in the right order

None of these steps is much work on its own. The time went into the gaps between them: each team had its own queue and its own priorities, so the change sat waiting at every handoff until the next team got to it, and then waited again for a deployment that had to happen in the right order. A task that needed about three days of actual work took two weeks.

## What the book gave us

Team Topologies argues that you should design teams around the flow of work rather than around technical specialties, and it gives you a small vocabulary for doing that. There are four team types:

1. Stream-aligned teams deliver value directly to customers and own a slice of the product.
2. Platform teams provide internal services that make stream-aligned teams faster.
3. Enabling teams help other teams adopt new capabilities.
4. Complicated subsystem teams own technically complex components.

The idea is that most teams should be stream-aligned, able to take a piece of work from idea to production on their own, and the other three types exist to support them.

When we held our own organization up against this list, the gap was obvious. We didn't have a single stream-aligned team. Everyone was either "platform", in the sense of looking after infrastructure, or undefined: the teams that built features had no slice of the product to call their own and crossed each other's boundaries constantly.

## How we restructured

The first step was to stop thinking in layers and look at what the product actually does for its users. We identified three main value streams:

- Customer onboarding and management
- Core transaction processing
- Reporting and analytics

Each one became a stream-aligned team that owns everything from the database to the UI for its domain. The field example from earlier now stays inside one team: the people who add it to the API are the same people who change the UI, write the migration and ship it, so a typical feature no longer needs a handoff at all.

Giving every team the whole stack doesn't mean every team should build its own infrastructure, so we created one platform team. It is responsible for the Kubernetes infrastructure, the CI/CD pipelines, the observability stack and the common libraries. Its job is to make the stream-aligned teams faster without becoming a bottleneck itself, which is easy to write down and turned out to be one of the harder things to get right.

We didn't create explicit enabling teams. In the book, an enabling team is a small group of specialists who spend time with other teams to help them pick up a new skill or practice, and then move on. At our size a separate team for that felt like too much, so our senior engineers rotate through the teams to share what they know instead, and that has worked for us.

## How teams work with each other now

Changing who is on which team is only half of it. The book also describes how teams should interact, and it names three interaction modes:

- Collaboration: working together closely, for a limited time
- X-as-a-Service: using another team's output through a clear interface
- Facilitating: helping another team learn something

Most of the time, the stream-aligned teams use the platform team's capabilities as X-as-a-Service. The CI/CD pipeline is the clearest example: a stream-aligned team uses it to build and deploy without needing to understand how it works inside, much as you would use any external service.

When we adopt something new, we switch to collaboration for a while. When we moved to Kubernetes, the platform team embedded with each stream-aligned team for a few weeks, working alongside them until the team could run its services on the new platform. The "for a limited time" part matters here, because collaboration is expensive, and if it never ends, the two teams have effectively become one team with twice the meetings.

## What changed day to day

The most visible change was in the meeting schedule. We used to hold cross-team syncs every day, because every piece of work depended on someone in another team. Now most work happens within a team, and teams sync with each other weekly.

Ownership became clearer. When something breaks in customer onboarding, everyone knows which team owns it. We no longer hear the old "that's the backend team's problem, but the DevOps team also needs to look at it," which usually meant that the problem sat between two teams and neither felt fully responsible for it.

Delivery got faster. The three-day task that used to take two weeks now takes three days, because a team can make the change end to end without waiting for anyone.

We also got some duplication, and we accepted it on purpose. When teams work independently, different teams end up with similar code for common patterns. The alternative would be to force every common pattern into a shared library from the start, which brings back exactly the kind of cross-team dependency we were trying to remove. So we treat duplication as the cost of independence, and once a pattern has stabilized, the platform team pulls the truly common parts into shared libraries.

The numbers moved in the same direction:

- Lead time for changes: from an average of 2 weeks to 3 days
- Deployment frequency: from weekly to daily
- Escaped defects: down 40% (teams that own their code pay closer attention to it)
- Developer satisfaction: survey scores up significantly

Lead time and deployment frequency are two of the standard measures of software delivery performance, and both follow directly from removing handoffs: a change that doesn't wait in other teams' queues gets to production sooner, and a team that can deploy its own work can do it more often. The drop in escaped defects, meaning bugs that reach production instead of being caught before release, is the one I find most telling. When a team owns its code end to end, it pays closer attention to what it ships.

## The hard parts

The biggest surprise was Conway's Law. The law, an observation from the late 1960s, says that organizations design systems that mirror their own communication structure. The book leans on this heavily and recommends designing teams with the architecture you want in mind. Our architecture didn't match the new team structure. The software was still one monolith, and a stream-aligned team can't really own its domain if it can't deploy it independently. We spent months splitting the monolith so that each team could deploy on its own. Reorganizing people without reorganizing the code doesn't work.

Some people didn't like the change. Our "backend experts" suddenly had to learn some frontend, and a few people left because they wanted to specialize deeply, which a team that owns the whole stack can't offer in the same way. I understand that choice. It also changed how we hired: we started looking for T-shaped people, engineers with depth in one area and enough breadth to work across the stack.

Sizing the platform team was tricky. If it's too small, it can't keep up with requests from the other teams and becomes the bottleneck we had just removed. If it's too large, it starts building things nobody asked for. We started with 3 people and grew to 5, which seems right for 4 stream-aligned teams.

## What I'd do differently

I'd start with the architecture. We reorganized the teams first and then struggled to split the monolith while the new teams were already trying to work independently. Next time I'd get the architecture closer to its target state before moving people, so that the new teams start with something they can actually own.

I'd explain the reasons far more often. Some team members felt they were being shuffled around arbitrarily, and I should have explained the reasoning better and earlier, and kept repeating it while the change was happening.

I'd also set clearer expectations for the platform team from day one. At first the stream-aligned teams expected it to do whatever they asked, which is understandable when a team calls itself a platform for everyone else. We had to establish that the platform team provides shared capabilities and doesn't take on custom work for individual teams. If it did, it would turn into another team that everyone waits on.

## Was it worth it?

For us, yes. The reduced coordination overhead alone justified the change, and teams are happier because they can ship without waiting on others.

It wasn't quick, though. The transition meant about six months of disruption, and some of the cost, like the people who left, doesn't show up in the metrics. If your current structure works reasonably well, I'd think carefully before reorganizing. Team Topologies helped us because we had the exact problems it describes, and I'd use it the same way again: as a tool for solving problems you actually have.
