---
title: "What I Learned Building Multi-Tenant SaaS on Kubernetes"
description: "How we moved from one VM per customer to shared Kubernetes clusters with a namespace per tenant, and what network policies, secrets, databases and resource limits taught us on the way."
date: 2024-02-28
image: "/images/blog/kubernetes-multi-tenant-saas.jpg"
series: "monolith-to-saas"
seriesLabel: "Multi-tenant Kubernetes"
tags: ["kubernetes", "saas", "multi-tenancy", "architecture"]
---

Last year we started moving our platform off a setup where every customer had their own virtual machine and onto shared Kubernetes clusters. On paper it looked like a well-trodden path, since a lot of software runs this way. In practice it wasn't straightforward, and I made plenty of mistakes along the way. This post follows that move from the beginning: why the old setup stopped working for us, how we kept customers apart once they shared the same machines, and where our first attempt was wrong.

A bit of vocabulary first, because it shapes everything else. In a SaaS product, a tenant is one customer, usually a whole organization with its own users and data. Multi-tenancy means several tenants are served by the same running infrastructure. The hard part is making each tenant feel as if they had the system to themselves: they must never see each other's data, and one tenant's heavy usage shouldn't slow everyone else down.

## One VM per customer

Our original architecture solved isolation in the simplest way there is. Each customer got their own VM. That has real advantages. A VM is a hard boundary, so one customer's application can't see another's memory, files or network traffic, and when one VM has a problem the others carry on. It is also easy to reason about, because "where does customer X run?" has exactly one answer.

The cost shows up as the customer list grows. Every VM is a machine that someone has to patch, monitor and upgrade, so when you have 50 customers, you have 50 VMs to maintain. Scaling meant provisioning more VMs, which took hours, and our ops team was drowning in maintenance work. On top of that the whole setup was expensive. We liked the isolation and wanted to keep it, without all that overhead.

## Choosing a namespace per tenant

Kubernetes runs containers across a pool of machines and decides by itself which machine each one lands on. Out of the box, anything in a cluster can talk to anything else, so if you put several customers into one cluster you have to build the separation yourself. There are a handful of common patterns for that, and we researched them before choosing.

The most isolated option is a cluster per tenant. It is clean, but it has the same problem as VMs, just with clusters: every tenant is another cluster to upgrade and look after. At the other extreme, you can run all tenants together in shared namespaces and tell their workloads apart only by labels. That is cheap, but it makes it too easy to accidentally leak data between tenants. Labels are just tags on resources, and nothing stops a pod with one tenant's label from talking to a pod with another's, so a single wrong label in a manifest is enough. Virtual clusters, which give each tenant something that looks like its own Kubernetes control plane while sharing the underlying machines, looked promising, but they added complexity we weren't ready for.

Namespaces sit in the middle. A namespace is Kubernetes' way of dividing one cluster into named sections. Most resources, such as pods, services, secrets and service accounts, belong to exactly one namespace, and many kinds of rules can be applied per namespace. That gave us good isolation without going overboard. Each tenant gets their own namespace with resource quotas, network policies, and RBAC rules (role-based access control, the Kubernetes system that decides which identities may do what to which resources).

## Namespaces don't isolate anything on their own

The first thing we got wrong was trusting namespace isolation alone. A namespace is a logical boundary, a way of grouping and naming things, and Kubernetes doesn't treat it as a security boundary. By default a pod in one namespace can open a connection to a pod in any other namespace, as long as it knows the address. Without extra rules, two tenants in two namespaces are no better separated on the network than two tenants in one.

The tool for this is the NetworkPolicy. As soon as a policy selects a pod, only the traffic the policy explicitly allows can reach that pod or leave it. We added this one to every tenant namespace:

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

The empty `podSelector: {}` near the top means "every pod in this namespace", so the policy covers all of the tenant's workloads. The ingress rule lets traffic in only from pods in the same namespace. The egress rules let traffic out only to pods in the same namespace, with one exception: UDP port 53 in `kube-system`, which is where the cluster's DNS server runs. Without that exception the pods couldn't even look up the names of their own services, and almost everything would break in confusing ways. Together this blocks all cross-namespace traffic while still allowing DNS resolution.

Keeping tenants from seeing each other doesn't stop them from crowding each other out. On shared machines, a tenant whose workload suddenly wants a lot of CPU or memory takes it from the same pool everyone else relies on. This is usually called the noisy neighbor problem. To prevent it, we also set up resource quotas, which cap what a whole namespace can claim:

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

Kubernetes has two numbers for resources, and the quota caps both. A request is what a container is guaranteed, and the scheduler uses it to decide which machine has room. A limit is the most the container may use: go over the CPU limit and it gets throttled, go over the memory limit and it gets killed (an OOM kill, for "out of memory"). This quota lets a tenant request up to 4 CPUs and 8 GiB of memory across all their pods, use at most 8 CPUs and 16 GiB, and create at most five persistent volume claims, which is how a pod asks for disk storage. Those limits come back later in this story.

## Turning tenant setup into a pipeline

A tenant now needed a namespace, policies, a quota, permissions, secrets, a database and the application itself. Creating all of that manually was error-prone, and the errors were the quiet kind: a namespace without its network policy works perfectly well, it just isn't isolated. So we built a pipeline that provisions everything, in the same order, every time:

1. Create namespace with standard labels
2. Apply network policies
3. Set up resource quotas
4. Create service accounts with limited RBAC
5. Deploy tenant-specific secrets from Vault
6. Initialize database schema
7. Deploy the application

We use Pulumi for this, because it lets you describe infrastructure in a general-purpose programming language and our team already knew TypeScript. Terraform would work just as well. What mattered to us was having one definition of what a tenant consists of, so that every tenant is built the same way.

## Secrets were harder than expected

Step five on that list took more thought than the others. With VMs, secrets lived in environment files on each machine. Not great, but manageable, because each of those files sat on a machine that belonged to one customer. With shared infrastructure that safety net is gone, and we needed something better: a way to give each tenant's pods exactly that tenant's secrets and nothing else.

HashiCorp Vault solved this. Vault is a dedicated store for secrets that keeps them encrypted and uses policies to decide who may read what. Each tenant gets a path in Vault, and their pods authenticate using Kubernetes service accounts. A service account is the identity a pod runs under, and Kubernetes gives each pod a signed token that proves it. Vault can check that token with the cluster and map the service account to a Vault policy, so a pod running as one tenant's service account can only read secrets under that tenant's path.

The part that made it work was the Vault Agent Injector. Vault deliberately hands out short-lived tokens, which means an application has to log in, fetch its secrets and keep renewing its token for as long as it runs. The injector adds a small Vault Agent container to each pod that does all of this and writes the secrets to a file the application can read. It handles token renewal automatically, which we definitely would have gotten wrong ourselves.

## What we got wrong

Not everything from the first round held up. The biggest mistake was underestimating database isolation. We initially tried a shared database with row-level security. Row-level security is a PostgreSQL feature where the database filters which rows a session may see, based on policies you write, such as "only rows whose tenant column matches the current tenant". In theory that keeps tenants apart even when they share tables. In practice every table needs the right policy and the current tenant has to be set correctly on every connection, and a bug in one query could expose another tenant's data. Don't do this unless you really know what you're doing. We switched to a database per tenant, running in the same PostgreSQL cluster. That kept a single cluster to operate, and since a connection to one PostgreSQL database can't query tables in another, a query can no longer reach the wrong tenant's rows by accident.

The second mistake was ignoring egress traffic. Ingress is traffic coming into a pod and egress is traffic going out of it. Our network policies blocked ingress but allowed all egress, so one compromised pod could have called out to anywhere. That is why the policy earlier lists `Egress` as well as `Ingress` and spells out where pods may connect. Lock down egress to only what's needed.

The third was not testing resource limits. We set conservative limits and never hit them during development. In production, legitimate workloads started getting OOM-killed: real tenants doing real work needed more memory than our development runs ever had, and the containers were killed for crossing their memory limit. If you set limits, test them with realistic loads before you trust the numbers.

## Monitoring per tenant

Once tenants share infrastructure, a graph of all API requests together tells you very little. When something goes wrong you want to know which tenant it is happening to, and for billing you need to know how much each one uses. So we added tenant labels to all metrics. In our Java services that is one extra tag when a metric is registered:

```java
Counter.builder("api_requests_total")
    .tag("tenant", tenantId)
    .register(meterRegistry);
```

This lets us track usage per tenant for billing and identify who's causing issues. Grafana dashboards with tenant dropdowns made debugging much easier, since you pick a tenant and every panel on the dashboard narrows down to them.

## Was it worth it?

Yes. Provisioning went from hours to minutes, because a new tenant is now a pipeline run instead of a new machine. Our infrastructure costs dropped by about 40%. The ops team spends less time on maintenance.

It took longer than we planned, though, and we underestimated the complexity. Looking back, much of the work went into rebuilding on purpose what separate VMs had given us without any effort: network separation, resource boundaries, a safe home for secrets and data that can't mix. If you're considering this migration, double your timeline estimate.
