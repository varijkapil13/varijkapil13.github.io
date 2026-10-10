---
title: "What I Learned Building Multi-Tenant SaaS on Kubernetes"
description: "How we moved from one VM per customer to shared Kubernetes clusters with a namespace per tenant, and what isolation, secrets, databases and resource limits taught us on the way."
date: 2024-02-28
image: "/images/blog/kubernetes-multi-tenant-saas.jpg"
series: "monolith-to-saas"
seriesLabel: "Multi-tenant Kubernetes"
tags: ["kubernetes", "saas", "multi-tenancy", "architecture"]
---

Last year we started migrating our platform from a setup where every customer had their own virtual machine to shared Kubernetes clusters. It wasn't straightforward, and I made plenty of mistakes along the way. In a SaaS product each customer is a tenant, and sharing infrastructure between tenants only works if they never see each other's data and one tenant's load doesn't slow down the rest.

## One VM per customer

Our original architecture gave each customer their own VM. That was simple and isolated, since a VM is a hard boundary between customers. It was also expensive, and the cost grew with every customer. When you have 50 customers, you have 50 VMs to maintain. Scaling meant provisioning more VMs, which took hours, and our ops team was drowning in maintenance work. We wanted to keep the tenant isolation without that overhead.

## Why a namespace per tenant

Kubernetes runs containers across a pool of machines and decides where each one goes. Out of the box, anything in a cluster can talk to anything else, so when customers share a cluster, the separation between them is something you have to build.

A cluster per tenant has the same problem as VMs, just with clusters: every tenant is one more thing to upgrade and maintain. At the other end, you can run everyone in shared namespaces and tell tenants apart only by labels, the tags Kubernetes puts on resources. That makes it too easy to accidentally leak data between tenants, because nothing stops a pod with one tenant's label from talking to a pod with another's, and one wrong label in a manifest is enough. Virtual clusters, which give each tenant what looks like its own Kubernetes control plane on shared machines, were promising, but they added complexity we weren't ready for.

A namespace divides one cluster into named sections. Pods, services, secrets and service accounts each belong to exactly one namespace, and many rules can be applied per namespace, so namespaces gave us good isolation without going overboard. Each tenant gets their own namespace with resource quotas, network policies and RBAC rules (role-based access control, which decides which identities may do what to which resources).

## Namespaces are not a security boundary

The first thing we got wrong was trusting namespace isolation alone. A namespace is a logical boundary for grouping and naming things. By default, a pod in one namespace can still connect to a pod in any other namespace if it knows the address, so two tenants in two namespaces are no better separated on the network than two tenants in one.

A NetworkPolicy changes that: once a policy selects a pod, only traffic the policy allows can reach the pod or leave it. We added this one to every tenant namespace:

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

The empty `podSelector: {}` selects every pod in the namespace. Incoming traffic is allowed only from pods in the same namespace, and outgoing traffic only to pods in the same namespace plus UDP port 53 in `kube-system`, where the cluster's DNS runs. The result blocks all cross-namespace traffic while allowing DNS resolution.

Keeping tenants from seeing each other doesn't stop them from crowding each other out. On shared machines, a tenant whose workload suddenly needs a lot of CPU or memory takes it from everyone else, which is known as the noisy neighbor problem. We also set up resource quotas, which cap what a whole namespace can claim:

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

Kubernetes tracks two numbers per resource. A request is what a container is guaranteed, and the scheduler uses it to find a machine with room. A limit is the most it may use: above its CPU limit a container is throttled, and above its memory limit it is killed (an OOM kill, for "out of memory"). This quota lets a tenant request up to 4 CPUs and 8 GiB across all their pods, use at most 8 CPUs and 16 GiB, and create five persistent volume claims, which is how pods ask for disk storage. Those limits come back later in this story.

## The onboarding pipeline

Creating a new tenant manually was error-prone, and the errors were quiet ones: a namespace without its network policy works fine, it just isn't isolated. So we built a pipeline that provisions everything:

1. Create namespace with standard labels
2. Apply network policies
3. Set up resource quotas
4. Create service accounts with limited RBAC
5. Deploy tenant-specific secrets from Vault
6. Initialize database schema
7. Deploy the application

We use Pulumi for this, which describes infrastructure in a general-purpose language, because our team already knew TypeScript. Terraform would work just as well.

## Secrets management was harder than expected

With VMs, secrets lived in environment files on each machine. Not great, but manageable, since each machine belonged to one customer. On shared infrastructure we needed a way to give each tenant's pods that tenant's secrets and nothing else.

HashiCorp Vault solved this. Each tenant gets a path in Vault, and their pods authenticate using Kubernetes service accounts. A service account is the identity a pod runs as, and Kubernetes gives the pod a signed token to prove it. Vault checks that token with the cluster and maps the service account to a policy, so a tenant's pods can only read that tenant's path.

The part that made it work was the Vault Agent Injector. Vault tokens are short-lived on purpose, so an application has to log in, fetch its secrets and keep renewing its token while it runs. The injector adds a Vault Agent container to each pod that does this and writes the secrets to a file for the application. It handles token renewal automatically, which we definitely would have gotten wrong ourselves.

## What we got wrong

The biggest mistake was underestimating database isolation. We initially tried a shared database with row-level security, a PostgreSQL feature where the database filters which rows a session may see based on policies, such as "only rows for the current tenant". That keeps tenants apart only if every table has the right policy and the current tenant is set correctly every time, and a bug in one query could expose another tenant's data. Don't do this unless you really know what you're doing. We switched to database-per-tenant running in the same PostgreSQL cluster. A connection to one PostgreSQL database can't query tables in another.

We also ignored egress traffic, the traffic leaving a pod, as opposed to ingress coming in. Our network policies blocked ingress but allowed all egress, so one compromised pod could have called out to anywhere. That's why the policy above lists `Egress` as well and spells out where pods may connect. Lock down egress to only what's needed.

The quotas caught us out too, because we never tested resource limits. We set conservative limits and never hit them during development. In production, legitimate workloads started getting OOM-killed, since real tenants needed more memory than our development runs had. Test with realistic loads.

## Monitoring per tenant

On shared infrastructure, a graph of all requests together doesn't tell you which tenant has a problem, or how much each tenant uses. We added tenant labels to all metrics:

```java
Counter.builder("api_requests_total")
    .tag("tenant", tenantId)
    .register(meterRegistry);
```

This lets us track usage per tenant for billing and identify who's causing issues. Grafana dashboards with tenant dropdowns made debugging much easier, since one selection narrows every panel to that tenant.

## Was it worth it?

Yes. Provisioning went from hours to minutes. Our infrastructure costs dropped by about 40%. The ops team spends less time on maintenance.

But it took longer than we planned, and we underestimated the complexity. Much of the work went into rebuilding on purpose what separate VMs had given us for free: network separation, limits on resources, a safe place for secrets and data that can't mix. If you're considering this migration, double your timeline estimate.
