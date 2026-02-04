---
title: "What I Learned Building Multi-Tenant SaaS on Kubernetes"
description: "Hard-won lessons from migrating a VM-per-customer architecture to shared Kubernetes clusters with namespace isolation."
date: 2024-02-28
tags: ["kubernetes", "saas", "multi-tenancy", "architecture"]
---

Last year, we started migrating our platform from a VM-per-customer setup to shared Kubernetes clusters. It wasn't straightforward, and I made plenty of mistakes along the way. Here's what actually worked.

## The Problem We Had

Our original architecture gave each customer their own VM. Simple, isolated, but expensive. When you have 50 customers, you have 50 VMs to maintain. Scaling meant provisioning more VMs, which took hours. Our ops team was drowning in maintenance work.

We needed tenant isolation without the overhead.

## Why Namespace-Per-Tenant

After researching various multi-tenancy patterns, we settled on namespace-per-tenant. The alternatives were:

- **Cluster-per-tenant**: Same problem as VMs, just with clusters
- **Shared namespaces with labels**: Too easy to accidentally leak data between tenants
- **Virtual clusters**: Promising but added complexity we weren't ready for

Namespaces gave us good isolation without going overboard. Each tenant gets their own namespace with resource quotas, network policies, and RBAC rules.

## Setting Up Tenant Isolation

The first thing we got wrong was trusting namespace isolation alone. Namespaces are a logical boundary, not a security boundary. We added:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-cross-tenant
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector: {}
  egress:
    - to:
        - podSelector: {}
    - to:
        - namespaceSelector:
            matchLabels:
              name: kube-system
      ports:
        - port: 53
          protocol: UDP
```

This blocks all cross-namespace traffic while allowing DNS resolution. We also set up resource quotas to prevent noisy neighbors:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: tenant-quota
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    persistentvolumeclaims: "5"
```

## The Onboarding Pipeline

Creating a new tenant manually was error-prone. We built a pipeline that provisions everything:

1. Create namespace with standard labels
2. Apply network policies
3. Set up resource quotas
4. Create service accounts with limited RBAC
5. Deploy tenant-specific secrets from Vault
6. Initialize database schema
7. Deploy the application

We use Pulumi for this because our team already knew TypeScript. Terraform would work just as well.

## Secrets Management Was Harder Than Expected

With VMs, secrets lived in environment files on each machine. Not great, but manageable. With shared infrastructure, we needed something better.

HashiCorp Vault solved this. Each tenant gets a path in Vault, and their pods authenticate using Kubernetes service accounts. The key insight was using the Vault Agent Injector—it handles token renewal automatically, which we definitely would have gotten wrong ourselves.

## What We Got Wrong

**Underestimating database isolation**: We initially tried a shared database with row-level security. Don't do this unless you really know what you're doing. A bug in one query could expose another tenant's data. We switched to database-per-tenant running in the same PostgreSQL cluster.

**Ignoring egress traffic**: Our network policies blocked ingress but allowed all egress. One compromised pod could have called out to anywhere. Lock down egress to only what's needed.

**Not testing resource limits**: We set conservative limits and never hit them during development. In production, legitimate workloads started getting OOM-killed. Test with realistic loads.

## Monitoring Per Tenant

We added tenant labels to all metrics:

```java
Counter.builder("api_requests_total")
    .tag("tenant", tenantId)
    .register(meterRegistry);
```

This lets us track usage per tenant for billing and identify who's causing issues. Grafana dashboards with tenant dropdowns made debugging much easier.

## Was It Worth It?

Honestly, yes. Provisioning went from hours to minutes. Our infrastructure costs dropped by about 40%. The ops team spends less time on maintenance.

But it took longer than we planned, and we underestimated the complexity. If you're considering this migration, double your timeline estimate. You'll need it.
