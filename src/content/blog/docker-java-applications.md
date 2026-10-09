---
title: "Docker for Java Developers: From Development to Production"
description: "How I containerize Java applications: multi-stage Dockerfiles, JVM memory settings, health checks and the production configuration I use."
date: 2022-03-25
image: "/images/blog/docker-java-applications.jpg"
series: "monolith-to-saas"
tags: ["docker", "java", "devops", "containers"]
---

Running Java in containers means getting the usual Docker practices right and also dealing with how the JVM behaves inside a container. These are the setups I've ended up with after running Java services in containers in production.

## Optimized Dockerfile

A multi-stage build keeps the build tools out of the final image and runs the app as a non-root user:

```dockerfile
# Build stage
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /app

# Cache dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Build application
COPY src ./src
RUN mvn package -DskipTests -B

# Runtime stage
FROM eclipse-temurin:21-jre-alpine

# Security: run as non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -D appuser

WORKDIR /app

# Copy only the JAR file
COPY --from=builder /app/target/*.jar app.jar

# Change ownership
RUN chown -R appuser:appgroup /app
USER appuser

# JVM configuration
ENV JAVA_OPTS="-XX:+UseContainerSupport \
               -XX:MaxRAMPercentage=75.0 \
               -XX:InitialRAMPercentage=50.0 \
               -Djava.security.egd=file:/dev/./urandom"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s \
    CMD wget -q --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

## JVM memory configuration

Most of the trouble I've had with Java in containers came down to memory settings:

```bash
# Let JVM automatically size heap based on container limits
-XX:+UseContainerSupport          # Enabled by default in JDK 10+
-XX:MaxRAMPercentage=75.0         # Use 75% of container memory for heap
-XX:InitialRAMPercentage=50.0     # Start with 50%

# For predictable behavior, set explicit limits
-Xmx512m -Xms512m                 # Fixed heap size
```

### Memory calculation example

For a container with 1GB memory limit:
- MaxRAMPercentage=75% gives a 768MB max heap
- The remaining 256MB covers metaspace, threads and native memory
- Always leave headroom to avoid OOM kills

## Docker Compose for development

This gives me the app and a PostgreSQL database locally, with the debug port open:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "8080:8080"
      - "5005:5005"  # Debug port
    environment:
      - SPRING_PROFILES_ACTIVE=dev
      - DATABASE_URL=jdbc:postgresql://db:5432/appdb
      - DATABASE_USER=app
      - DATABASE_PASSWORD=secret
      - JAVA_OPTS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
    volumes:
      - ./target:/app/target:ro  # Hot reload compiled classes
    depends_on:
      db:
        condition: service_healthy
    networks:
      - app-network

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=appdb
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=secret
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./docker/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d appdb"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - app-network

volumes:
  postgres-data:

networks:
  app-network:
    driver: bridge
```

## Development Dockerfile with hot reload

```dockerfile
# Dockerfile.dev
FROM eclipse-temurin:21-jdk

WORKDIR /app

# Install useful tools
RUN apt-get update && apt-get install -y \
    curl \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Copy Maven wrapper and pom
COPY mvnw pom.xml ./
COPY .mvn .mvn

# Download dependencies
RUN ./mvnw dependency:go-offline -B

EXPOSE 8080 5005

# Run with Spring Boot DevTools for hot reload
CMD ["./mvnw", "spring-boot:run", \
     "-Dspring-boot.run.jvmArguments=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005"]
```

## Production configuration

### Graceful shutdown

```java
@Configuration
public class GracefulShutdownConfig {

    @Bean
    public GracefulShutdown gracefulShutdown() {
        return new GracefulShutdown();
    }

    @Bean
    public ConfigurableServletWebServerFactory webServerFactory(GracefulShutdown gracefulShutdown) {
        TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
        factory.addConnectorCustomizers(gracefulShutdown);
        return factory;
    }
}
```

Handle SIGTERM properly in your Dockerfile:

```dockerfile
# Use exec form to receive signals
ENTRYPOINT ["java", "-jar", "app.jar"]

# Or with shell form, use exec
ENTRYPOINT exec java $JAVA_OPTS -jar app.jar
```

### Health checks

I expose separate endpoints for general health, readiness and liveness:

```java
@RestController
@RequestMapping("/health")
public class HealthController {

    @Autowired
    private DataSource dataSource;

    @GetMapping
    public ResponseEntity<Map<String, String>> health() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        status.put("timestamp", Instant.now().toString());
        return ResponseEntity.ok(status);
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, Object>> readiness() {
        Map<String, Object> status = new HashMap<>();

        // Check database connectivity
        try (Connection conn = dataSource.getConnection()) {
            status.put("database", "UP");
        } catch (SQLException e) {
            status.put("database", "DOWN");
            status.put("error", e.getMessage());
            return ResponseEntity.status(503).body(status);
        }

        status.put("status", "UP");
        return ResponseEntity.ok(status);
    }

    @GetMapping("/live")
    public ResponseEntity<String> liveness() {
        return ResponseEntity.ok("OK");
    }
}
```

## Image optimization

### Layer caching

Order Dockerfile instructions from least to most frequently changed:

```dockerfile
# Rarely changes
FROM eclipse-temurin:21-jre-alpine

# Changes occasionally
COPY --from=builder /app/target/lib/* /app/lib/

# Changes frequently
COPY --from=builder /app/target/app.jar /app/
```

### Image size reduction

Approximate sizes for different base images:

```bash
# Full JDK image: ~400MB
FROM eclipse-temurin:21-jdk

# JRE only: ~200MB
FROM eclipse-temurin:21-jre

# Alpine JRE: ~150MB
FROM eclipse-temurin:21-jre-alpine

# Distroless: ~100MB (no shell!)
FROM gcr.io/distroless/java21-debian12
```

### Using jlink for a custom runtime

jlink builds a minimal JRE that contains only the modules your application needs:

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS jre-builder

# Find required modules
RUN jdeps --ignore-missing-deps -q \
    --recursive \
    --multi-release 21 \
    --print-module-deps \
    app.jar > modules.txt

# Create custom JRE
RUN jlink \
    --add-modules $(cat modules.txt) \
    --strip-debug \
    --no-man-pages \
    --no-header-files \
    --compress=2 \
    --output /custom-jre

FROM alpine:3.19
COPY --from=jre-builder /custom-jre /opt/java
ENV PATH="/opt/java/bin:$PATH"
# Result: ~50-80MB image!
```

## Security practices

```dockerfile
# 1. Use specific image tags, not 'latest'
FROM eclipse-temurin:21.0.1_12-jre-alpine

# 2. Run as non-root
USER 1001

# 3. Use read-only filesystem where possible
# In docker-compose or kubernetes:
# read_only: true

# 4. Drop capabilities
# In docker run:
# --cap-drop=ALL

# 5. Scan images for vulnerabilities
# docker scout cves myimage:tag
```

## Logging configuration

In containers I log to stdout and let the runtime collect it:

```xml
<!-- logback.xml -->
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{ISO8601} [%thread] %-5level %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- JSON format for log aggregation -->
    <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
    </appender>

    <root level="INFO">
        <appender-ref ref="${LOG_FORMAT:-STDOUT}"/>
    </root>
</configuration>
```

## Summary

The short version: use multi-stage builds, size the JVM heap from the container's limits with UseContainerSupport and the RAM percentage flags, run as a non-root user (a security requirement for production), add liveness and readiness checks, shrink the image with an Alpine base or jlink, and log to stdout. That setup has worked for us in development, staging and production.
