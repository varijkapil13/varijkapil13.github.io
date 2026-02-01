---
title: "Building a Robust CI/CD Pipeline with GitLab for Java and React"
description: "How we built continuous integration and deployment workflows for a full-stack application using GitLab CI/CD."
date: 2024-07-10
tags: ["devops", "gitlab", "cicd", "java", "react"]
---

A well-designed CI/CD pipeline can dramatically improve your team's productivity and code quality. I'll share how we built our GitLab CI/CD pipeline for a full-stack application with a Jakarta EE backend and React frontend.

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
  NODE_VERSION: "20"

cache:
  paths:
    - .m2/repository/
    - frontend/node_modules/

# ============== BUILD STAGE ==============

build-backend:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - cd backend
    - mvn clean compile -DskipTests
  artifacts:
    paths:
      - backend/target/
    expire_in: 1 hour

build-frontend:
  stage: build
  image: node:20-alpine
  script:
    - cd frontend
    - npm ci
    - npm run build
  artifacts:
    paths:
      - frontend/dist/
    expire_in: 1 hour

# ============== TEST STAGE ==============

test-backend:
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
    - cd backend
    - mvn test
  artifacts:
    reports:
      junit: backend/target/surefire-reports/*.xml
    paths:
      - backend/target/jacoco.exec
  coverage: '/Total.*?([0-9]{1,3})%/'

test-frontend:
  stage: test
  image: node:20-alpine
  script:
    - cd frontend
    - npm ci
    - npm run test:ci
  artifacts:
    reports:
      junit: frontend/junit.xml
      coverage_report:
        coverage_format: cobertura
        path: frontend/coverage/cobertura-coverage.xml
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'

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
    - cd backend
    - mvn sonar:sonar
        -Dsonar.projectKey=$CI_PROJECT_NAME
        -Dsonar.host.url=$SONAR_HOST_URL
        -Dsonar.login=$SONAR_TOKEN
  only:
    - main
    - develop

lint-frontend:
  stage: quality
  image: node:20-alpine
  script:
    - cd frontend
    - npm ci
    - npm run lint
    - npm run type-check

# ============== PACKAGE STAGE ==============

package-backend:
  stage: package
  image: maven:3.9-eclipse-temurin-21
  script:
    - cd backend
    - mvn package -DskipTests
  artifacts:
    paths:
      - backend/target/*.war
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

### 1. Parallel Execution

Frontend and backend builds run in parallel, significantly reducing pipeline time:

```
build-backend ─┬─ test-backend ─┬─ package-backend
               │                │
build-frontend ─┴─ test-frontend ─┴─ build-docker
```

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

Proper caching dramatically improves build times:

```yaml
cache:
  paths:
    - .m2/repository/    # Maven dependencies
    - frontend/node_modules/  # npm packages
```

### 4. Environment-Specific Deployments

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
    - npm test
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

## Monitoring Pipeline Performance

We track pipeline metrics:

- **Average pipeline duration**: ~12 minutes
- **Build success rate**: 94%
- **Time to first feedback**: 3 minutes (lint + compile)

## Tips for Optimization

1. **Use `needs` keyword** for dependency-based execution instead of stage-based
2. **Parallelize test suites** using test splitting
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

## Conclusion

A well-designed CI/CD pipeline pays dividends in developer productivity and code quality. The initial investment in setting it up properly is worth it.

Key takeaways:
- Run jobs in parallel where possible
- Fail fast with quick feedback loops
- Use caching strategically
- Automate everything, including deployments
- Monitor and continuously improve

The pipeline we built has reduced our deployment frequency from weekly to multiple times per day, while maintaining high quality standards.
