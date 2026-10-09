---
title: "GitOps with Pulumi and Helm: Our Setup"
description: "How we implemented GitOps for infrastructure and application deployment using Pulumi and Helm."
date: 2023-11-15
tags: ["gitops", "pulumi", "helm", "kubernetes", "devops"]
image: "/images/blog/gitops-pulumi-helm.jpg"
series: "monolith-to-saas"
---

We used to deploy by SSHing into servers and running scripts. Then we moved to Kubernetes and deployment became clicking buttons in Jenkins. Neither was great. GitOps changed how we think about deployments.

## What GitOps means for us

Git is the source of truth. What's in Git is what's running. If you want to change something, you change the Git repository, and an automated process handles the rest.

Every change is a commit, so we get an audit trail for free, and rolling back means reverting that commit. Changes go through PRs and get reviewed. And we no longer have "works on my machine" deployments.

## Why Pulumi over Terraform

We evaluated both. Terraform is more established, but Pulumi won for a few reasons:

1. It uses a real programming language. We write TypeScript, so loops, conditionals, and functions are just code instead of HCL workarounds.
2. Type safety. IDE autocomplete and compile-time errors catch mistakes early.
3. We write actual unit tests for infrastructure code.
4. Pulumi Cloud handles state for us (though self-hosted backends exist).

Here's what defining a namespace looks like:

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

That's real code. We can loop over a list of tenants, pass parameters, write tests.

## Helm for application deployment

Pulumi handles infrastructure. Helm handles applications. We use Helm charts for:

- Our own services (internal chart repository)
- Third-party software (official Helm repos)

A typical values file:

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

Environment-specific values override the defaults:

```yaml
# values-production.yaml
replicaCount: 5
resources:
  requests:
    cpu: 200m
    memory: 512Mi
```

## The pipeline

Our deployment pipeline runs in this order:

1. When a PR is created, Pulumi preview runs and shows what would change.
2. Merging the PR triggers the pipeline.
3. Pulumi applies infrastructure changes to staging.
4. Automated integration tests verify staging.
5. The same changes are promoted to production.
6. Helm upgrade deploys the application.

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

## Handling secrets

Secrets don't belong in Git, even encrypted. We use two things:

1. Pulumi Config secrets for infrastructure secrets
2. External Secrets Operator, which syncs secrets from Vault to Kubernetes

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

For application secrets, External Secrets Operator watches Kubernetes and pulls from Vault:

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

## What went wrong

We had no drift detection at first. Someone made a manual change in production, and Git said one thing while the cluster said another. Now we run `pulumi preview` periodically to detect drift.

Chart versioning confused us. We updated a chart without changing its version, and Helm didn't pick up the change. Now CI enforces version bumps.

We also had too many environments: dev, staging, QA, pre-prod, and production. Managing five sets of values files was tedious, so we consolidated to staging and production.

## Tips that helped

Use Pulumi stacks for environments. Each environment is a stack with its own state, and `pulumi stack select production` switches context.

Pin Helm chart versions. Never use `latest` or omit the version, because you can't reproduce a deployment without explicit versions.

Keep infrastructure and application code in separate repos. They change at different rates and have different reviewers, and mixing them creates noise.

Automate rollbacks. If health checks fail after a deployment, revert automatically instead of waiting for someone to notice.

## The result

Deployments went from nerve-wracking to boring, which was what we wanted. Changes go through PRs, get reviewed, merge, and deploy automatically. If something breaks, we revert the commit.

Our deployment frequency went from weekly to daily. We never pushed people to deploy more often; deploying just became safe and easy.
