---
title: "GitOps with Pulumi and Helm: Our Setup"
description: "How we moved from SSH scripts and Jenkins buttons to deployments driven by Git, using Pulumi for infrastructure and Helm for applications, and what went wrong along the way."
date: 2023-11-15
tags: ["gitops", "pulumi", "helm", "kubernetes", "devops"]
image: "/images/blog/gitops-pulumi-helm.jpg"
series: "monolith-to-saas"
seriesLabel: "GitOps with Pulumi & Helm"
---

For a long time, deploying meant SSHing into servers and running scripts. When we moved to Kubernetes, that changed into clicking buttons in Jenkins. The second was more comfortable than the first, but both had the same weakness: what was running in production was the result of whatever someone had last done by hand, and the only complete record of it was the system itself. If you wanted to know why something was configured the way it was, or what had changed since yesterday, you had to go and look, and hope that nobody had changed it in a way the scripts didn't know about.

Neither approach was great, and moving to GitOps changed how we think about deployments. This post is about how we set it up, with Pulumi for the infrastructure and Helm for the applications, and about the things that went wrong before it settled down.

## What GitOps means for us

The idea behind GitOps is simple to say. Git is the source of truth: what's in Git is what's running. If you want to change something, whether it is the number of replicas of a service or the memory a namespace may use, you don't change it on the cluster. You change the Git repository, and an automated process handles the rest.

That one rule gives you a lot of things that used to take effort. Every change is a commit, so we get an audit trail for free: who changed what, when, and with which message. Rolling back means reverting that commit and letting the same automation apply the old state again. Changes go through pull requests and get reviewed before they reach any environment, the same way application code does. And because nothing is deployed from someone's laptop, we no longer have "works on my machine" deployments, where the result depends on what happened to be installed or configured on the computer of the person deploying.

GitOps on its own says nothing about tools, though. We still had to decide what would describe our infrastructure in Git and what would describe our applications.

## Why Pulumi over Terraform

By infrastructure I mean everything the applications run on: Kubernetes namespaces, quotas, secrets and the cloud resources around them. Describing that in code is called infrastructure as code, and the best-known tool for it is Terraform. We evaluated both Terraform and Pulumi. Terraform is more established, but Pulumi won for a few reasons.

The biggest one is that Pulumi uses a real programming language. Terraform has its own configuration language, HCL, which is good at declaring resources but gets awkward as soon as you need logic: creating the same set of resources for every item in a list, or only creating something under a condition, needs special constructs that feel like workarounds. We write Pulumi in TypeScript, so loops, conditionals and functions are just code.

The other reasons follow from that. TypeScript gives us type safety, so IDE autocomplete and compile-time errors catch mistakes early, before anything reaches a cluster. Because it is ordinary code, we write actual unit tests for our infrastructure code. And Pulumi Cloud handles the state for us. Every infrastructure-as-code tool has to remember what it created last time, so that it can work out what to change next time, and that record is called state. Keeping it somewhere safe and shared is a chore you otherwise have to solve yourself, although Pulumi also supports self-hosted backends.

Here is what defining a namespace looks like. In Kubernetes a namespace is a way of dividing one cluster into separate areas, and we give each tenant its own. Next to it we create a ResourceQuota, which caps how much CPU and memory all the workloads in that namespace may request and use together, so that one tenant can't take resources from the others:

```typescript
import * as k8s from "@pulumi/kubernetes";

export function createTenantNamespace(name: string) {
    const ns = new k8s.core.v1.Namespace(name, {
        metadata: {
            name: name,
            labels: {
                "tenant": name,
                "managed-by": "pulumi"
            }
        }
    });

    const quota = new k8s.core.v1.ResourceQuota(`${name}-quota`, {
        metadata: { namespace: ns.metadata.name },
        spec: {
            hard: {
                "requests.cpu": "4",
                "requests.memory": "8Gi",
                "limits.cpu": "8",
                "limits.memory": "16Gi"
            }
        }
    });

    return { namespace: ns, quota };
}
```

That's real code. The function takes the tenant's name as a parameter, and creating namespaces for every tenant is a loop over a list of tenants. We can write tests for it like for any other function. In HCL this would have been possible too, but it is the kind of code that reads naturally in TypeScript and awkwardly in a configuration language.

## Helm for application deployment

Pulumi handles infrastructure. Helm handles applications. A Kubernetes application is described by a set of YAML manifests: a deployment, a service, configuration and so on. Helm packages those manifests as a chart, a set of templates with placeholders, and fills in the placeholders from a values file when you install it. The same chart can then be installed many times with different values. We use Helm charts for:

- Our own services (internal chart repository)
- Third-party software (official Helm repos)

A typical values file for one of our services sets the number of replicas, the image to run, the resources it requests and its configuration:

```yaml
replicaCount: 3

image:
  repository: registry.example.com/api-service
  tag: "1.2.3"

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

config:
  databaseUrl: "${DATABASE_URL}"
  logLevel: "info"
```

In the `resources` section, requests are what Kubernetes reserves for the container when it decides where to run it, and limits are the most it is allowed to use. The defaults in this file are the base for every environment. Environment-specific values override the defaults, so the production file only needs to contain what is different:

```yaml
# values-production.yaml
replicaCount: 5
resources:
  requests:
    cpu: 200m
    memory: 512Mi
```

Helm merges the files in order, so in production a service runs with five replicas and larger requests, while everything not mentioned in the production file, like the image and the configuration, comes from the defaults.

## The pipeline

With infrastructure in Pulumi and applications in Helm charts, both in Git, the remaining piece is the automation that turns a merged change into a running system. Our deployment pipeline runs in this order:

1. When a PR is created, Pulumi preview runs and shows what would change.
2. Merging the PR triggers the pipeline.
3. Pulumi applies infrastructure changes to staging.
4. Automated integration tests verify staging.
5. The same changes are promoted to production.
6. Helm upgrade deploys the application.

The preview in the first step is what makes reviewing infrastructure changes practical. A reviewer doesn't have to imagine what a change to the TypeScript code will do; the preview lists exactly which resources would be created, changed or deleted. In the CI configuration, the two kinds of deployment are separate jobs:

```yaml
# GitLab CI excerpt
deploy-infrastructure:
  stage: deploy
  script:
    - pulumi login
    - pulumi stack select ${ENVIRONMENT}
    - pulumi up --yes
  only:
    changes:
      - infrastructure/**

deploy-application:
  stage: deploy
  script:
    - helm upgrade --install api-service ./charts/api-service
      -f values.yaml
      -f values-${ENVIRONMENT}.yaml
      --set image.tag=${CI_COMMIT_SHA}
  only:
    changes:
      - charts/**
      - src/**
```

The `only: changes` rules keep the jobs apart: a change to the infrastructure code runs `pulumi up` against the selected stack, and a change to the charts or the application source runs `helm upgrade`. `helm upgrade --install` installs the release if it doesn't exist yet and upgrades it if it does, so the same command works for the first deployment and every one after. It layers the environment's values file on top of the defaults and sets the image tag to the commit that triggered the pipeline, so what runs in the cluster can always be traced back to a commit.

## Handling secrets

Secrets were the one thing the "everything in Git" rule could not cover. Database passwords and API keys shouldn't be readable by everyone who can read the repository, and our rule is that secrets don't belong in Git, even encrypted. We use two things instead: Pulumi Config secrets for infrastructure secrets, and the External Secrets Operator, which syncs secrets from Vault to Kubernetes, for application secrets.

On the infrastructure side, Pulumi treats a value marked as secret differently from normal configuration. It is encrypted, and Pulumi keeps it out of its output, so it can be passed into resources like a Kubernetes Secret without showing up in logs:

```typescript
// Pulumi config secret
const dbPassword = config.requireSecret("dbPassword");

// Used in Pulumi resource
new k8s.core.v1.Secret("db-credentials", {
    metadata: { namespace: "default" },
    stringData: {
        password: dbPassword
    }
});
```

Application secrets live in Vault, a dedicated store for secrets. The External Secrets Operator runs inside the cluster and watches Kubernetes for ExternalSecret resources like the one below. Each one says which value to fetch from Vault and which Kubernetes Secret to put it in, and the operator pulls the value from Vault and keeps the Secret up to date:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
spec:
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: db-credentials
  data:
    - secretKey: password
      remoteRef:
        key: secret/data/database
        property: password
```

The useful property of this split is that the ExternalSecret resource contains no secret at all, only a reference to where the secret lives. It can sit in Git and go through review like everything else, while the actual password never leaves Vault and the cluster.

## What went wrong

The setup didn't work smoothly from the start. Three problems in particular shaped how it looks today.

The first was drift. Drift is what happens when the real state of a system moves away from what the code describes, and the usual cause is a manual change. We had no drift detection at first. Someone made a manual change in production, and from then on Git said one thing while the cluster said another. Drift often doesn't break anything right away, which is what makes it dangerous: the next deployment either silently undoes the manual change or runs into it. Now we run `pulumi preview` periodically to detect drift.

The second was chart versioning, which confused us. Every Helm chart has a version number, and Helm uses it to tell different releases of a chart apart. We updated a chart without changing its version, and Helm didn't pick up the change. Now CI enforces version bumps, so a chart change without a new version fails the pipeline.

The third was that we simply had too many environments: dev, staging, QA, pre-prod and production. Each one needed its own set of values files, and every change had to be made five times. Managing that was tedious, so we consolidated to staging and production.

## Tips that helped

Some of what we learned is easier to pass on as advice than as a story.

Use Pulumi stacks for environments. A stack is one instance of a Pulumi program with its own configuration and its own state. With one stack per environment, `pulumi stack select production` switches context, and each environment's state stays separate from the others.

Pin Helm chart versions. Never use `latest` or omit the version, because you can't reproduce a deployment without explicit versions. If the chart version can change under you, deploying the same commit twice can produce two different results, which defeats the point of Git being the source of truth.

Keep infrastructure and application code in separate repos. They change at different rates and have different reviewers, and mixing them creates noise for both.

Automate rollbacks. If health checks fail after a deployment, revert automatically instead of waiting for someone to notice. Since every deployment is a commit, going back to the previous one is a known path.

## The result

Deployments went from nerve-wracking to boring, which was what we wanted. Changes go through PRs, get reviewed, merge and deploy automatically, and if something breaks, we revert the commit.

Our deployment frequency went from weekly to daily. We never pushed people to deploy more often; deploying just became safe and easy, and the frequency followed.
