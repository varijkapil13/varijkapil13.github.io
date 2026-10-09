---
title: "Building a CI/CD Pipeline with GitLab for Java Applications"
description: "How we set up GitLab CI/CD to build, test, scan and deploy our enterprise Jakarta EE applications."
date: 2022-07-14
image: "/images/blog/gitlab-cicd-java-backend.jpg"
tags: ["devops", "gitlab", "cicd", "java", "enterprise"]
---

This is the GitLab CI/CD pipeline we built for our enterprise Java applications, which run on Jakarta EE. I'll go through the full configuration first and then the parts that made the biggest difference for us.

## Pipeline overview

The pipeline has five stages:

```yaml
stages:
  - build
  - test
  - quality
  - package
  - deploy
```

Each stage has one job to do, and the early ones are fast so developers hear about problems quickly.

## The complete pipeline

This is our `.gitlab-ci.yml`:

```yaml
variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository"
  JAVA_VERSION: "21"

cache:
  paths:
    - .m2/repository/

# ============== BUILD STAGE ==============

build-backend:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn clean compile -DskipTests
  artifacts:
    paths:
      - target/
    expire_in: 1 hour

# ============== TEST STAGE ==============

unit-tests:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn test -Dtest=*UnitTest
  artifacts:
    reports:
      junit: target/surefire-reports/*.xml

integration-tests:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  services:
    - name: postgres:16-alpine
      alias: postgres
  variables:
    POSTGRES_DB: testdb
    POSTGRES_USER: test
    POSTGRES_PASSWORD: test
    DATABASE_URL: "jdbc:postgresql://postgres:5432/testdb"
  script:
    - mvn test -Dtest=*IntegrationTest
  artifacts:
    reports:
      junit: target/surefire-reports/*.xml
    paths:
      - target/jacoco.exec
  coverage: '/Total.*?([0-9]{1,3})%/'

# ============== QUALITY STAGE ==============

sonarqube:
  stage: quality
  image: maven:3.9-eclipse-temurin-21
  variables:
    SONAR_USER_HOME: "${CI_PROJECT_DIR}/.sonar"
  cache:
    key: "${CI_JOB_NAME}"
    paths:
      - .sonar/cache
  script:
    - mvn sonar:sonar
        -Dsonar.projectKey=$CI_PROJECT_NAME
        -Dsonar.host.url=$SONAR_HOST_URL
        -Dsonar.login=$SONAR_TOKEN
  only:
    - main
    - develop

dependency-check:
  stage: quality
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn org.owasp:dependency-check-maven:check
  artifacts:
    paths:
      - target/dependency-check-report.html
    expire_in: 1 week
  allow_failure: true

# ============== PACKAGE STAGE ==============

package-war:
  stage: package
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn package -DskipTests
  artifacts:
    paths:
      - target/*.war
    expire_in: 1 week
  only:
    - main
    - develop
    - /^release\/.*$/

build-docker:
  stage: package
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - |
      if [ "$CI_COMMIT_BRANCH" == "main" ]; then
        docker tag $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA $CI_REGISTRY_IMAGE:latest
        docker push $CI_REGISTRY_IMAGE:latest
      fi
  only:
    - main
    - develop

# ============== DEPLOY STAGE ==============

deploy-staging:
  stage: deploy
  image: alpine:latest
  script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
    - ssh -o StrictHostKeyChecking=no $STAGING_USER@$STAGING_HOST "
        docker pull $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA &&
        docker-compose -f /opt/app/docker-compose.yml up -d"
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - develop

deploy-production:
  stage: deploy
  image: alpine:latest
  script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
    - ssh -o StrictHostKeyChecking=no $PROD_USER@$PROD_HOST "
        docker pull $CI_REGISTRY_IMAGE:latest &&
        docker-compose -f /opt/app/docker-compose.yml up -d"
  environment:
    name: production
    url: https://example.com
  when: manual
  only:
    - main
```

## Notable parts of the pipeline

### 1. Separate unit and integration tests

We split tests for faster feedback:

```yaml
unit-tests:
  script:
    - mvn test -Dtest=*UnitTest

integration-tests:
  services:
    - postgres:16-alpine
  script:
    - mvn test -Dtest=*IntegrationTest
```

Unit tests run quickly without external dependencies. Integration tests get their own database container.

### 2. Database testing with services

We use GitLab services to spin up a PostgreSQL container for integration tests:

```yaml
services:
  - name: postgres:16-alpine
    alias: postgres
variables:
  POSTGRES_DB: testdb
  DATABASE_URL: "jdbc:postgresql://postgres:5432/testdb"
```

### 3. Caching

Caching the Maven repository makes builds much faster:

```yaml
cache:
  paths:
    - .m2/repository/
```

With caching, subsequent builds skip downloading dependencies entirely.

### 4. OWASP dependency check

This job scans our dependencies for known vulnerabilities:

```yaml
dependency-check:
  script:
    - mvn org.owasp:dependency-check-maven:check
  allow_failure: true  # Don't block pipeline, but report
```

### 5. Environment-specific deployments

We use GitLab environments for deployment tracking:

```yaml
environment:
  name: production
  url: https://example.com
```

That gives us a deployment history per environment, easy rollbacks, and environment-specific variables.

## Dockerfile

We deploy to Payara with this Dockerfile:

```dockerfile
FROM payara/server-full:6.2024.1-jdk21

# Copy post-boot commands for configuration
COPY post-boot-commands.asadmin ${POSTBOOT_COMMANDS}

# Deploy application
COPY target/*.war ${DEPLOY_DIR}/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080 4848
```

## Merge request pipelines

For merge requests, we run a lighter pipeline:

```yaml
.mr-rules:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

test-mr:
  extends: .mr-rules
  stage: test
  script:
    - mvn test
```

## Security scanning

GitLab ships templates for security scanning that you can include directly:

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml

sast:
  stage: quality

dependency_scanning:
  stage: quality
```

## Multi-module Maven projects

For larger multi-module projects we build in parallel and test each module separately:

```yaml
build:
  script:
    - mvn clean install -DskipTests -T 1C  # Parallel build

test:
  parallel:
    matrix:
      - MODULE: [module-api, module-service, module-persistence]
  script:
    - mvn test -pl $MODULE -am
```

## Monitoring pipeline performance

The numbers we track:

| Metric | Value |
|---|---|
| Average pipeline duration | ~8 minutes |
| Build success rate | 94% |
| Time to first feedback | 2 minutes (compile + unit tests) |

## Optimization tips

1. Use the `needs` keyword so jobs run when their dependencies finish instead of waiting for the whole stage
2. Parallelize test suites with Maven Surefire's parallel execution
3. Use shallow clones for faster checkout: `GIT_DEPTH: 10`
4. Cache aggressively, but invalidate the cache when dependencies change

```yaml
build:
  cache:
    key:
      files:
        - pom.xml  # Invalidate when dependencies change
    paths:
      - .m2/repository/
```

## Database migrations in CI/CD

We run Flyway migrations as a manual job on `main`:

```yaml
migrate-database:
  stage: deploy
  image: flyway/flyway:10
  script:
    - flyway -url=$DATABASE_URL -user=$DB_USER -password=$DB_PASSWORD migrate
  only:
    - main
  when: manual
```

## Was it worth it?

Setting this up properly took real effort, and I think it paid for itself. If I had to pick what mattered most: split unit and integration tests so feedback is fast, test against a real database container, add security scanning early, cache dependencies, automate deployments too, and keep watching the pipeline metrics.

With this pipeline we went from deploying weekly to deploying several times a day, without lowering our quality bar.
