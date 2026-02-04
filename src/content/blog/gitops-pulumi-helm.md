---
title: "GitOps with Pulumi and Helm: Our Setup"
description: "How we implemented GitOps for infrastructure and application deployment using Pulumi and Helm."
date: 2023-11-15
tags: ["gitops", "pulumi", "helm", "kubernetes", "devops"]
---

We used to deploy by SSHing into servers and running scripts. Then we moved to Kubernetes and deployment became clicking buttons in Jenkins. Neither was great. GitOps changed how we think about deployments.

## What GitOps Means for Us

The core idea: Git is the source of truth. What's in Git is what's running. If you want to change something, change the Git repository. An automated process handles the rest.

This gives us:
- **Audit trail**: Every change is a commit
- **Easy rollbacks**: Revert the commit
- **Review process**: Changes go through PRs
- **Consistency**: No more "works on my machine" deployments

## Why Pulumi Over Terraform

We evaluated both. Terraform is more established, but Pulumi won because:

1. **Real programming language**: We use TypeScript. Loops, conditionals, and functions are native, not HCL workarounds.
2. **Type safety**: IDE autocomplete and compile-time errors catch mistakes early.
3. **Testing**: We write actual unit tests for infrastructure code.
4. **State management**: Pulumi Cloud handles state for us (though self-hosted backends exist).

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

## Helm for Application Deployment

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

## The Pipeline

Our deployment pipeline:

1. **PR created**: Pulumi preview runs, showing what would change
2. **PR merged**: Pipeline triggers
3. **Infrastructure changes**: Pulumi applies changes to staging
4. **Integration tests**: Automated tests verify staging
5. **Promotion**: Same changes apply to production
6. **Application deployment**: Helm upgrade runs

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

## Handling Secrets

Secrets don't belong in Git, even encrypted. We use:

1. **Pulumi Config secrets**: For infrastructure secrets
2. **External Secrets Operator**: Syncs secrets from Vault to Kubernetes

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

## What Went Wrong

**Drift detection was missing at first**. Someone made a manual change in production. Git said one thing, reality said another. Now we run `pulumi preview` periodically to detect drift.

**Chart versioning confusion**. We updated a chart without changing the version, and Helm didn't pick up the change. Now we enforce version bumps in CI.

**Too many environments**. We had dev, staging, QA, pre-prod, and production. Managing five sets of values files was tedious. We consolidated to staging and production.

## Tips That Helped

**Use Pulumi stacks for environments**. Each environment is a stack with its own state. `pulumi stack select production` switches context.

**Pin Helm chart versions**. Never use `latest` or omit the version. Reproducible deployments require explicit versions.

**Separate infrastructure and application repos**. Different change frequencies and different reviewers. Mixing them creates noise.

**Automate rollbacks**. If health checks fail after deployment, automatically revert. Don't wait for humans to notice.

## The Result

Deployments went from nerve-wracking to boring. That's the goal. Changes go through PRs, get reviewed, merge, and deploy automatically. If something breaks, we revert the commit.

Our deployment frequency increased from weekly to daily. Not because we push people to deploy more, but because deploying became safe and easy.
