---
title: "Building a CI/CD Pipeline with GitLab for Java Applications"
description: "How we built a GitLab CI/CD pipeline that builds, tests, scans and deploys our Jakarta EE applications, and how it took us from weekly releases to several deployments a day."
date: 2022-07-14
image: "/images/blog/gitlab-cicd-java-backend.jpg"
tags: ["devops", "gitlab", "cicd", "java", "enterprise"]
---

Our enterprise Java applications run on Jakarta EE, and for a long time we deployed them once a week. When you deploy weekly, every release carries a week's worth of changes, and the bigger and less frequent releases are, the more changes each one carries and the harder it is to tell which of them broke something. We wanted to deploy small changes often, and the only way to do that without lowering our quality bar was to let a machine do the building, testing and deploying every single time, in the same way, without anyone having to remember the steps.

That machine is a CI/CD pipeline. CI, continuous integration, means that every change pushed to the repository is built and tested automatically, so problems show up minutes after they are introduced instead of days later. CD, continuous delivery or deployment, extends that all the way to getting the tested build onto servers. We use GitLab, where the whole pipeline is described in a file called `.gitlab-ci.yml` that lives in the repository next to the code. In this post I'll first walk through the complete file and then go back to the parts that made the biggest difference for us.

## Five stages, fastest first

A GitLab pipeline is made of jobs, and jobs are grouped into stages. All jobs in a stage can run at the same time, and a stage only starts when the one before it has succeeded. Ours has five:

```yaml
stages:
  - build
  - test
  - quality
  - package
  - deploy
```

The order follows one idea: each stage has one job to do, and the early ones are fast, so developers hear about problems quickly. A compile error should fail the pipeline within a minute or two, not after twenty minutes of packaging and scanning. The expensive and slow work, like building images and deploying, comes at the end and only runs for changes that have already passed everything else.

## The complete pipeline

This is our `.gitlab-ci.yml`. It is long, but most of it is the same pattern repeated: a job names its stage, the Docker image it runs in, the commands to run and what it leaves behind for later jobs.

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

Two GitLab concepts appear all over this file and are worth explaining before going further. Every job runs in a fresh container, so nothing a job produces survives it unless you say so. Artifacts are how a job says so: files listed under `artifacts` are uploaded when the job ends and made available to later jobs and in the GitLab interface, including test reports, which GitLab then shows on the merge request. The `only` lists decide which branches a job runs on. Building and testing happen for every push, while SonarQube analysis and Docker images are limited to `main` and `develop`, and each deployment is tied to one branch: `develop` goes to staging automatically, and `main` can go to production.

Production is the one place where we kept a human in the loop. The `deploy-production` job has `when: manual`, so the pipeline prepares everything and then waits for someone to press the button. The deployment itself is deliberately simple: the job connects to the server over SSH, pulls the new image from GitLab's container registry and restarts the application with Docker Compose.

## The parts that made the biggest difference

### Separating unit and integration tests

The single most useful change was splitting our tests into two kinds, for faster feedback:

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

Unit tests check a single class or a small group of classes in isolation. They run quickly without external dependencies, so they give an answer within seconds. Integration tests check that the pieces work together, including against a real database, and they are much slower and need more setup. If both run as one job, every developer waits for the slowest test before seeing any result. Split into two jobs, matched by naming convention (`*UnitTest` and `*IntegrationTest`), they run side by side in the same stage, and integration tests get their own database container.

### Testing against a real database

That database container comes from a GitLab feature called services. A service is an extra container that GitLab starts next to the job's container for as long as the job runs, reachable under a hostname you choose. We use it to spin up a PostgreSQL container for integration tests:

```yaml
services:
  - name: postgres:16-alpine
    alias: postgres
variables:
  POSTGRES_DB: testdb
  DATABASE_URL: "jdbc:postgresql://postgres:5432/testdb"
```

The alias `postgres` is the hostname, which is why the JDBC URL points at `postgres:5432`. The alternative would be an in-memory database that imitates PostgreSQL, and those are convenient, but they differ from the real thing in SQL dialect and behaviour, and those differences tend to show up late. With a real PostgreSQL container, the integration tests run against the same database we use in production, and every job gets a clean, empty one, so tests can't interfere with each other across pipelines.

### Caching the Maven repository

Maven downloads every dependency of a project into a local repository the first time it builds. In a fresh CI container that repository is empty, so without help every job would download the same libraries again. Caching the Maven repository makes builds much faster:

```yaml
cache:
  paths:
    - .m2/repository/
```

`MAVEN_OPTS` in the global variables points Maven's local repository into the project directory, because GitLab can only cache paths inside the project. With caching, subsequent builds skip downloading dependencies entirely.

### Checking dependencies for known vulnerabilities

Most of the code in a Java application is not ours. It comes from libraries, and libraries regularly turn out to have security vulnerabilities that get published with an identifier and a description. The OWASP dependency check compares every library in the build against those published vulnerabilities and reports the ones that match:

```yaml
dependency-check:
  script:
    - mvn org.owasp:dependency-check-maven:check
  allow_failure: true  # Don't block pipeline, but report
```

We let this job fail without failing the pipeline. A newly published vulnerability in a library we have used for months would otherwise block every unrelated change until someone upgraded it, and that is a good way to get people to look for ways around the check. Instead it doesn't block the pipeline but does report, and the HTML report is kept as an artifact for a week so that we can look at it and plan the upgrade.

### Tracking deployments with environments

The last part of the pipeline that changed our day-to-day work is the `environment` keyword on the deploy jobs:

```yaml
environment:
  name: production
  url: https://example.com
```

It tells GitLab that this job deploys to an environment called production. GitLab then keeps track of what was deployed where and when. That gives us a deployment history per environment, easy rollbacks, and environment-specific variables, so the same job definition can deploy to different servers with different credentials.

## The image we deploy

The `build-docker` job builds the image that gets deployed. Our applications run on Payara, a Jakarta EE application server, so the image starts from the official Payara image and adds our application to it:

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

The Payara image runs any commands in the post-boot file after the server starts, which is the place for server configuration such as datasources, and it deploys any WAR file found in its deploy directory. The health check gives Payara a 60 second start period, because a full application server takes a while to start, before it begins counting failed checks.

## Lighter pipelines for merge requests

A merge request is where a change gets reviewed before it is merged, and GitLab can run a separate pipeline for it. For merge requests, we run a lighter pipeline:

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

The job with the leading dot, `.mr-rules`, is a hidden job. GitLab never runs it, but other jobs can inherit from it with `extends`, which keeps the rule in one place if more jobs need it later. The reviewer sees the test result on the merge request, and the heavier work runs once the change is merged into a branch.

## Security scanning from templates

Dependency checking covers the libraries, but not our own code or what we accidentally commit. GitLab ships templates for security scanning that you can include directly:

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

SAST (static application security testing) reads the source code looking for patterns that are known to be unsafe, dependency scanning is GitLab's own take on the library check above, and secret detection looks for things like keys and passwords that should never have been committed. The templates come with their own job definitions, so all we had to do was include them and move their jobs into our `quality` stage.

## Building multi-module projects

Some of our larger applications are split into several Maven modules, and building those one after another wastes time when most of them don't depend on each other. For larger multi-module projects we build in parallel and test each module separately:

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

`-T 1C` tells Maven to use one build thread per CPU core, building independent modules at the same time. The `parallel: matrix` turns one test job into one job per module, which GitLab can spread across runners. `-pl $MODULE` selects the module to test, and `-am` ("also make") builds the modules it depends on as well, so each job has what it needs.

## Watching the pipeline itself

A pipeline that is slow or unreliable gets worked around, so we keep an eye on it like on any other system. The numbers we track:

| Metric | Value |
|---|---|
| Average pipeline duration | ~8 minutes |
| Build success rate | 94% |
| Time to first feedback | 2 minutes (compile + unit tests) |

The time to first feedback is the number I care most about, because it decides whether a developer waits for the result or switches to something else and comes back much later. Two minutes, covering the compile and the unit tests, is short enough to wait.

Keeping those numbers down is an ongoing job, and a few techniques do most of the work:

1. Use the `needs` keyword so jobs run when their dependencies finish instead of waiting for the whole stage
2. Parallelize test suites with Maven Surefire's parallel execution
3. Use shallow clones for faster checkout: `GIT_DEPTH: 10`
4. Cache aggressively, but invalidate the cache when dependencies change

The last one is easy to get wrong in both directions. A cache that never changes keeps old dependencies around, and a cache that is thrown away too often is no cache at all. Keying the cache on `pom.xml` gives a new cache exactly when the dependencies change:

```yaml
build:
  cache:
    key:
      files:
        - pom.xml  # Invalidate when dependencies change
    paths:
      - .m2/repository/
```

## Database migrations

Deploying a new version of the application often means changing the database schema as well, and those changes have to happen in a controlled order. Flyway handles this by keeping versioned SQL migration scripts in the repository and recording in the database which of them have already been applied, so running it brings any database up to the latest version. We run Flyway migrations as a manual job on `main`:

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

Making it manual was a conscious choice. A schema change is much harder to undo than an application deployment, so we want a person to decide when it runs against production.

## Was it worth it?

Setting this up properly took real effort, and I think it paid for itself. Looking back, the things that mattered most were the ones that shortened the time between pushing a change and hearing about a problem: splitting unit and integration tests, testing against a real database container and caching dependencies. Adding security scanning early meant it became part of the normal flow instead of a separate audit, automating the deployments too removed the last manual step that made releases feel risky, and watching the pipeline's own metrics kept it fast enough that nobody wanted to skip it.

With this pipeline we went from deploying weekly to deploying several times a day, without lowering our quality bar.
