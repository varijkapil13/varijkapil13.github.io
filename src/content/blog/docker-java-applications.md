---
title: "Docker for Java Developers: From Development to Production"
description: "How I package Java services as containers, from the multi-stage Dockerfile and JVM memory settings to local development with Docker Compose, health checks, smaller images and logging."
date: 2022-03-25
image: "/images/blog/docker-java-applications.jpg"
series: "monolith-to-saas"
seriesLabel: "Docker for Java"
tags: ["docker", "java", "devops", "containers"]
---

The first time you put a Java service into a container, it looks like the easy part of the job. You take the JAR you already build, copy it into an image with a Java runtime, and start it. It runs, and for a while that feels like the end of it. The trouble shows up later, in production, and most of it comes from the fact that the JVM was designed long before containers existed. It has its own ideas about how much memory it may use, how it should be shut down and how it reports that it is healthy, and those ideas don't always match what a container runtime expects.

This post is about the setup I've ended up with after running Java services in containers in production for a while. I'll go from the Dockerfile itself through memory, local development, shutdown and health checks, to making images smaller and safer, and I'll try to explain why each piece is there, because most of these settings only make sense once you know what goes wrong without them.

## The Dockerfile, built in two stages

The most natural first Dockerfile for a Java project starts from an image with Maven and a JDK, copies the source in, runs the build and then starts the result. It works, but the image you ship then contains everything that was needed to build the application: Maven, the full JDK, the downloaded dependencies and the source code. None of that is needed at runtime, all of it makes the image larger, and every extra tool in a production image is one more thing that can have a vulnerability.

A multi-stage build solves this. You describe two (or more) images in one Dockerfile. The first stage has all the build tools and produces the JAR. The second stage starts from a small runtime image and copies in only that JAR. Only the last stage becomes the image you push, so the build tools never reach production. This is the Dockerfile I use as a starting point:

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

A few things in it are worth pointing out. The build stage copies `pom.xml` on its own and downloads the dependencies before it copies the source code. Docker caches every step of a build and reuses the cached result as long as the inputs of that step haven't changed. Dependencies change rarely and source code changes all the time, so with this order a normal code change skips the slow download step and only recompiles.

The runtime stage creates a dedicated user and switches to it before the application starts. By default a process in a container runs as root, and while the container isolates it, a root process that gets compromised has far more room to do damage than an unprivileged one. For us, running as a non-root user is a requirement for anything that goes to production.

The rest of the file, the `JAVA_OPTS`, the health check and the entrypoint, each deserve their own section, starting with memory.

## Teaching the JVM about container memory

Most of the trouble I've had with Java in containers came down to memory settings. To see why, it helps to know how the two sides look at memory.

A container gets a memory limit, say 1GB. If the processes inside it use more than that, the kernel doesn't slow them down or ask them nicely; it kills them. From the outside the container simply disappears and gets restarted, which is called an OOM kill (OOM for "out of memory").

The JVM, on its side, decides at startup how large its heap may grow, the heap being the area where your Java objects live. Older JVMs made that decision by looking at the memory of the whole machine, so a JVM inside a 1GB container on a large host could happily plan for a heap many times bigger than its container allowed, and the first time it actually grew that large, the kernel killed it. Modern JVMs know when they run in a container and read the container's limit instead. These are the flags that control that behaviour:

```bash
# Let JVM automatically size heap based on container limits
-XX:+UseContainerSupport          # Enabled by default in JDK 10+
-XX:MaxRAMPercentage=75.0         # Use 75% of container memory for heap
-XX:InitialRAMPercentage=50.0     # Start with 50%

# For predictable behavior, set explicit limits
-Xmx512m -Xms512m                 # Fixed heap size
```

The percentage flags let the heap follow whatever limit the container gets, so the same image works in a small and a large container without changes. The alternative at the bottom, a fixed heap with `-Xmx` and `-Xms` set to the same value, is less flexible but completely predictable: the JVM takes that much heap up front and never more. Which one you prefer depends on whether you'd rather adjust the container limit or the heap size when things need to grow.

### Why 75% and not 100%

The heap is not the only memory a JVM uses. Metaspace holds the loaded classes, every thread has its own stack, the JIT compiler keeps compiled code, and the JVM and libraries also use native memory outside the heap. All of that counts against the container's limit too. For a container with a 1GB memory limit, the numbers work out like this:

- MaxRAMPercentage=75% gives a 768MB max heap
- The remaining 256MB covers metaspace, threads and native memory
- Always leave headroom to avoid OOM kills

If you give the heap the full limit, the heap alone fits, but the JVM as a whole doesn't, and the container gets killed even though your Java code never ran out of heap. Those crashes are confusing, because there is no `OutOfMemoryError` in the logs to explain them.

## A development setup that looks like production

Containers are not only for production. Locally, the hardest part of starting work on a backend service is usually everything around it, most often the database. With Docker Compose I describe the application and a PostgreSQL database in one file, and one command starts both, with the Java debug port open so I can attach a debugger from the IDE:

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

The detail I'd point at first is `depends_on` with `condition: service_healthy`. A plain `depends_on` only waits until the database container has started, which is not the same as the database being ready to accept connections. PostgreSQL needs a few seconds to initialise, especially on the first run, and an application that tries to connect in that window fails on startup. With the health check on the database (`pg_isready`), Compose waits until PostgreSQL actually answers before it starts the application.

The database keeps its data in a named volume, so it survives restarts of the container, and the `init.sql` file in `docker-entrypoint-initdb.d` is run by the PostgreSQL image the first time the database is created. Inside the Compose network, the application reaches the database by its service name, `db`, which is why the JDBC URL points there and not at `localhost`.

The application itself is built from a separate development Dockerfile. It uses the full JDK instead of the slim runtime, adds a couple of tools that are handy for poking around inside a container, and runs the application through Maven with the debug agent enabled:

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

The `jdwp` agent is what makes remote debugging work: the JVM listens on port 5005, and `suspend=n` means it starts normally instead of waiting for a debugger to attach first. Together with Spring Boot DevTools, which restarts the application when the compiled classes change, and the `target` directory mounted into the container, I can recompile in the IDE and see the change without rebuilding the image. This image is only ever meant for a laptop. Everything that makes it convenient, the JDK, the extra tools and the open debug port, is exactly what I keep out of the production image.

## Shutting down gracefully

In production, containers get stopped all the time: during deployments, when a host is drained, when a service is scaled down. The runtime does this politely at first. It sends the main process a SIGTERM signal, waits for a grace period, and only then sends SIGKILL, which ends the process immediately. A well-behaved service uses that grace period to stop accepting new requests and finish the ones it is already working on. A service that ignores SIGTERM gets killed in the middle of whatever it was doing, and the users whose requests were in flight get errors.

On the application side, this is the configuration that registers a graceful shutdown handler with the embedded Tomcat server:

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

All of that is useless if the signal never reaches Java, and this is where the way you write `ENTRYPOINT` matters. Docker sends SIGTERM to the process with ID 1 in the container. In the exec form, written as a JSON array, Java itself is that process. In the shell form, Docker starts the command through `/bin/sh -c`, so the shell is that process and Java runs as its child, and the shell does not pass the signal on. To get both the signal handling and the `$JAVA_OPTS` expansion that needs a shell, you can use the shell form with `exec`, which replaces the shell with the Java process:

```dockerfile
# Use exec form to receive signals
ENTRYPOINT ["java", "-jar", "app.jar"]

# Or with shell form, use exec
ENTRYPOINT exec java $JAVA_OPTS -jar app.jar
```

## Health checks: alive and ready are different questions

A container runtime can see whether a process is running, but not whether it is doing anything useful. A Java process can be up while it is stuck, or while it can't reach its database, and from the outside both look the same as a healthy service. Health checks are how the service tells the platform what state it is really in.

There are two different questions here, and they need different answers. Liveness asks whether the process is still working at all; if it isn't, the right reaction is to restart it. Readiness asks whether it can handle requests right now; if it can't, the right reaction is to stop sending it traffic for a while, but not to restart it. A service whose database is briefly unreachable is alive but not ready, and restarting it would not bring the database back. So I expose separate endpoints for general health, readiness and liveness:

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

The liveness endpoint is deliberately trivial. If the JVM can answer an HTTP request at all, it is alive. The readiness endpoint borrows a connection from the pool and returns a 503 if it can't get one, which is the signal for the platform to route traffic elsewhere until the database is back. The `HEALTHCHECK` line in the Dockerfile at the top calls the general `/health` endpoint, with a 60 second start period so that the time the JVM needs to start up doesn't count as a failure.

## Making the image smaller

Image size sounds like a cosmetic concern until you count how often images move around. Every deployment pulls the image onto a host, every new host pulls all of them, and a CI pipeline pushes a new one on every build. Smaller images move faster and, because they contain fewer packages, give a vulnerability scanner less to complain about.

### Ordering layers for the cache

The cheapest improvement doesn't make the image smaller at all, it makes rebuilding and pulling it cheaper. Each instruction in a Dockerfile produces a layer, and when a layer changes, every layer after it has to be rebuilt and pushed again. So the order should go from what changes least to what changes most:

```dockerfile
# Rarely changes
FROM eclipse-temurin:21-jre-alpine

# Changes occasionally
COPY --from=builder /app/target/lib/* /app/lib/

# Changes frequently
COPY --from=builder /app/target/app.jar /app/
```

With the libraries in their own layer, a typical code change only produces a new layer with the application JAR, and hosts that already have the earlier layers only download that.

### Choosing a base image

The base image is usually the largest part of the final image, and the choices differ a lot. These are approximate sizes for the common options:

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

A running application doesn't need a compiler, so the JDK image is only worth using for building. Alpine is a very small Linux distribution, which is why its JRE image is smaller still and the one I use in the main Dockerfile. Distroless images go furthest: they contain the Java runtime and the libraries it needs, and nothing else, not even a shell. That is good for security, but it changes how you work with the container. You can't open a shell inside it to look around, and anything that relies on a shell stops working, which in the Dockerfile above includes both the `sh -c` entrypoint and the `wget` health check.

### Building a runtime with only what you need

The Java runtime itself is modular, and most applications use only part of it. jlink builds a minimal JRE that contains only the modules your application needs, and its companion jdeps can work out which modules those are by analysing your JAR:

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

The result is an image of roughly 50 to 80MB, a fraction of the full JDK image. The cost is one more build stage to maintain, and the risk that a module is only needed at runtime through reflection and jdeps doesn't see it, so it is worth testing the application properly on the custom runtime before trusting it.

## Locking the container down

Most of the security work for a container image is a set of small habits rather than one big measure, and I keep them together in one place:

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

Each of these closes a different gap. A tag like `latest` points at whatever was published most recently, so the same Dockerfile can produce a different image next week, while an exact version gives you the same base every time. A read-only filesystem stops an attacker, or a buggy library, from writing files into the container. Linux capabilities are the individual privileges that root is normally made of, and a Java web service listening on a port like 8080 typically needs none of them, so dropping all of them costs nothing. Scanning the finished image for known vulnerabilities catches the problems that come in through the base image and dependencies rather than through your own code.

## Logging to stdout

The last piece is logging. On a traditional server, applications write log files to disk and something rotates and collects them. In a container that model works against you: the filesystem disappears with the container, and the platform already captures everything a container writes to stdout. So in containers I log to stdout and let the runtime collect it:

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

Both appenders write to the console, in two formats. The plain text pattern is what I want to read in a terminal during development. The JSON format is what a log aggregation system wants, because every field (timestamp, level, logger, message) arrives as a separate value that can be searched and filtered instead of being parsed out of a line of text. The `LOG_FORMAT` environment variable picks one, with plain text as the default, so the same image logs readably on a laptop and in structured form in production.

## Where this left us

None of these pieces is complicated on its own. What makes them easy to miss is that a Java service in a container without them still starts and still answers requests, and the gaps only show once it runs under real limits, gets redeployed or loses its database for a moment. The setup that came out of that is a multi-stage build, a heap sized from the container's limit, a non-root user, separate liveness and readiness checks, a slim Alpine or jlink runtime and logs on stdout. It has worked for us in development, staging and production, and it is the template I start from whenever a new Java service needs a container.
