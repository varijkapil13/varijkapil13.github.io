---
title: "Building a Robust CI/CD Pipeline with GitLab for Java Applications"
description: "How we built continuous integration and deployment workflows for enterprise Java applications using GitLab CI/CD."
date: 2024-07-10
tags: ["devops", "gitlab", "cicd", "java", "enterprise"]
---

A well-designed CI/CD pipeline can dramatically improve your team's productivity and code quality. I'll share how we built our GitLab CI/CD pipeline for enterprise Java applications with Jakarta EE.

## Pipeline Overview

Our pipeline consists of several stages:

```yaml
stages:
  - build
  - test
  - quality
  - package
  - deploy
```

Each stage serves a specific purpose and provides fast feedback to developers.

## The Complete Pipeline

Here's our `.gitlab-ci.yml` configuration:

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

## Key Pipeline Features

### 1. Separate Unit and Integration Tests

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

Unit tests run quickly without external dependencies, while integration tests get their own database container.

### 2. Database Testing with Services

We use GitLab services to spin up a PostgreSQL container for integration tests:

```yaml
services:
  - name: postgres:16-alpine
    alias: postgres
variables:
  POSTGRES_DB: testdb
  DATABASE_URL: "jdbc:postgresql://postgres:5432/testdb"
```

### 3. Caching for Speed

Maven dependency caching dramatically improves build times:

```yaml
cache:
  paths:
    - .m2/repository/
```

With caching, subsequent builds skip downloading dependencies entirely.

### 4. OWASP Dependency Check

Security scanning for vulnerable dependencies:

```yaml
dependency-check:
  script:
    - mvn org.owasp:dependency-check-maven:check
  allow_failure: true  # Don't block pipeline, but report
```

### 5. Environment-Specific Deployments

We use GitLab environments for deployment tracking:

```yaml
environment:
  name: production
  url: https://example.com
```

This gives us:
- Deployment history
- Easy rollbacks
- Environment-specific variables

## Dockerfile for Java Applications

Our Dockerfile for Payara deployment:

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

## Merge Request Pipelines

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

## Security Scanning

GitLab provides built-in security scanning:

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

## Multi-Module Maven Projects

For complex multi-module projects:

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

## Monitoring Pipeline Performance

We track pipeline metrics:

- **Average pipeline duration**: ~8 minutes
- **Build success rate**: 94%
- **Time to first feedback**: 2 minutes (compile + unit tests)

## Tips for Optimization

1. **Use `needs` keyword** for dependency-based execution instead of stage-based
2. **Parallelize test suites** using Maven Surefire's parallel execution
3. **Use shallow clones** for faster checkout: `GIT_DEPTH: 10`
4. **Cache aggressively** but invalidate when needed

```yaml
build:
  cache:
    key:
      files:
        - pom.xml  # Invalidate when dependencies change
    paths:
      - .m2/repository/
```

## Database Migration in CI/CD

For Flyway migrations:

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

## Conclusion

A well-designed CI/CD pipeline pays dividends in developer productivity and code quality. The initial investment in setting it up properly is worth it.

Key takeaways:
- Separate unit and integration tests for fast feedback
- Use database containers for realistic testing
- Implement security scanning early
- Cache dependencies aggressively
- Automate everything, including deployments
- Monitor and continuously improve

The pipeline we built has reduced our deployment frequency from weekly to multiple times per day, while maintaining high quality standards.
