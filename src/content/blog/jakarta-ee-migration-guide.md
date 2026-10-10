---
title: "Migrating from Java EE to Jakarta EE"
description: "How we moved enterprise applications from Java EE 8 to Jakarta EE 10, and why a change of package name touched our dependencies, our code, our XML files and our app servers."
date: 2024-05-10
image: "/images/blog/jakarta-ee-migration-guide.jpg"
series: "monolith-to-saas"
seriesLabel: "Java EE → Jakarta EE"
tags: ["java", "jakarta-ee", "enterprise", "migration"]
---

When Oracle transferred Java EE to the Eclipse Foundation, the platform was renamed Jakarta EE. A new name on its own wouldn't have mattered much to us, but Oracle kept the rights to the "Java" name, so the specifications could not keep evolving under the `javax` packages. From Jakarta EE 9 onwards, everything moved to `jakarta.*`. For an existing enterprise application that means almost every class touches the change, because nearly every class imports something from those packages. This is how we migrated ours and what we learned along the way.

## What changed

The biggest change is the namespace move from `javax.*` to `jakarta.*`:

| Java EE 8 | Jakarta EE 9+ |
|-----------|---------------|
| `javax.servlet` | `jakarta.servlet` |
| `javax.persistence` | `jakarta.persistence` |
| `javax.ws.rs` | `jakarta.ws.rs` |
| `javax.inject` | `jakarta.inject` |
| `javax.enterprise.context` | `jakarta.enterprise.context` |
| `javax.validation` | `jakarta.validation` |
| `javax.json` | `jakarta.json` |

The classes themselves mostly stayed the same. An `@Inject` is still an `@Inject` and an `EntityManager` still works like an `EntityManager`. What makes the change hard is that old and new are incompatible at runtime: a server that implements `jakarta.persistence` has no idea what to do with a class that asks for `javax.persistence`. You can't move one module at a time inside the same deployment; the code, its libraries and the server have to move together.

## Migration strategy

We migrated in phases, starting with the build, then the Java code, then the XML configuration files, and finally the application server.

### Phase 1: Dependency updates

In a Java EE application, the APIs are declared with `provided` scope. You compile against them, but you don't package them, because the application server supplies the implementation at runtime. The first step was to point the build at the Jakarta EE 10 API in your `pom.xml`:

```xml
<!-- Before: Java EE 8 -->
<dependency>
    <groupId>javax</groupId>
    <artifactId>javaee-api</artifactId>
    <version>8.0.1</version>
    <scope>provided</scope>
</dependency>

<!-- After: Jakarta EE 10 -->
<dependency>
    <groupId>jakarta.platform</groupId>
    <artifactId>jakarta.jakartaee-api</artifactId>
    <version>10.0.0</version>
    <scope>provided</scope>
</dependency>
```

The single platform dependency is the simplest option. If you'd rather declare only the specifications a module actually uses, you can pull in individual dependencies:

```xml
<!-- JAX-RS -->
<dependency>
    <groupId>jakarta.ws.rs</groupId>
    <artifactId>jakarta.ws.rs-api</artifactId>
    <version>3.1.0</version>
    <scope>provided</scope>
</dependency>

<!-- JPA -->
<dependency>
    <groupId>jakarta.persistence</groupId>
    <artifactId>jakarta.persistence-api</artifactId>
    <version>3.1.0</version>
    <scope>provided</scope>
</dependency>

<!-- CDI -->
<dependency>
    <groupId>jakarta.enterprise</groupId>
    <artifactId>jakarta.enterprise.cdi-api</artifactId>
    <version>4.0.1</version>
    <scope>provided</scope>
</dependency>

<!-- Bean Validation -->
<dependency>
    <groupId>jakarta.validation</groupId>
    <artifactId>jakarta.validation-api</artifactId>
    <version>3.0.2</version>
    <scope>provided</scope>
</dependency>
```

Once the build points at the new APIs, nothing compiles anymore, and the compiler errors become your to-do list for the next phase.

### Phase 2: Namespace migration

The code change is simple to describe: replace all `javax` imports with `jakarta`. A typical class looks like this before and after:

```java
// Before
import javax.inject.Inject;
import javax.enterprise.context.RequestScoped;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.validation.constraints.NotNull;

// After
import jakarta.inject.Inject;
import jakarta.enterprise.context.RequestScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.validation.constraints.NotNull;
```

Only the package names change. The body of the class stays as it was.

### Automated migration

Nobody wants to edit thousands of imports by hand. The Eclipse Transformer can do the bulk of the work. It rewrites package references according to a rules file, and as the second command shows, it can transform a compiled archive such as a WAR directly:

```bash
# Using Maven plugin
mvn org.eclipse.transformer:transformer-maven-plugin:transform \
    -Dtransformer.rules=/path/to/jakarta-rules.properties

# Or standalone JAR
java -jar org.eclipse.transformer.cli.jar \
    source-app.war \
    target-app.war \
    -tr /path/to/jakarta-rules.properties
```

If you'd rather keep it simple, sed works too (Linux/Mac):

```bash
# Replace in all Java files
find src -name "*.java" -exec sed -i 's/javax\.inject/jakarta.inject/g' {} \;
find src -name "*.java" -exec sed -i 's/javax\.enterprise/jakarta.enterprise/g' {} \;
find src -name "*.java" -exec sed -i 's/javax\.ws\.rs/jakarta.ws.rs/g' {} \;
find src -name "*.java" -exec sed -i 's/javax\.persistence/jakarta.persistence/g' {} \;
find src -name "*.java" -exec sed -i 's/javax\.validation/jakarta.validation/g' {} \;
find src -name "*.java" -exec sed -i 's/javax\.servlet/jakarta.servlet/g' {} \;
find src -name "*.java" -exec sed -i 's/javax\.json/jakarta.json/g' {} \;
```

Notice that the script names each package instead of replacing every `javax`. Some `javax` packages, such as `javax.sql` and `javax.crypto`, are part of the JDK itself and did not move, so a blanket replacement would break code that was fine. The flip side is that a package missing from the list is silently left behind, which comes back in the pitfalls below.

### Phase 3: XML configuration files

The Java code is only half of an enterprise application. The deployment descriptors, the XML files that tell the server how to set up persistence, the web application and CDI, declare an XML namespace and a version at the top. The server reads them to decide which version of a specification the file follows, so they have to be updated along with the code.

Update `persistence.xml`:

```xml
<!-- Before -->
<persistence xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence
                                 http://xmlns.jcp.org/xml/ns/persistence/persistence_2_2.xsd"
             version="2.2">

<!-- After -->
<persistence xmlns="https://jakarta.ee/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="https://jakarta.ee/xml/ns/persistence
                                 https://jakarta.ee/xml/ns/persistence/persistence_3_0.xsd"
             version="3.0">
```

Update `web.xml`:

```xml
<!-- Before -->
<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee
                             http://xmlns.jcp.org/xml/ns/javaee/web-app_4_0.xsd"
         version="4.0">

<!-- After -->
<web-app xmlns="https://jakarta.ee/xml/ns/jakartaee"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="https://jakarta.ee/xml/ns/jakartaee
                             https://jakarta.ee/xml/ns/jakartaee/web-app_6_0.xsd"
         version="6.0">
```

`beans.xml` deserves a closer look. It controls bean discovery in CDI, meaning which classes the container treats as injectable beans. Since CDI 4.0, an empty `beans.xml` means only explicitly annotated classes are discovered, so writing `bean-discovery-mode="all"` explicitly, as ours does, keeps the old behavior instead of depending on the default:

```xml
<!-- Before -->
<beans xmlns="http://xmlns.jcp.org/xml/ns/javaee"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee
                           http://xmlns.jcp.org/xml/ns/javaee/beans_2_0.xsd"
       bean-discovery-mode="all"
       version="2.0">

<!-- After -->
<beans xmlns="https://jakarta.ee/xml/ns/jakartaee"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xsi:schemaLocation="https://jakarta.ee/xml/ns/jakartaee
                           https://jakarta.ee/xml/ns/jakartaee/beans_4_0.xsd"
       bean-discovery-mode="all"
       version="4.0">
```

## Application server migration

Because old and new namespaces don't mix at runtime, the server has to move too. Your application can only run on a server that implements the `jakarta` APIs.

### Payara Server

Payara 6+ supports Jakarta EE 10. The dependency below is the embedded Payara, scoped to tests, so that tests can run inside a Payara 6 server:

```xml
<!-- Use Payara 6 for Jakarta EE 10 -->
<dependency>
    <groupId>fish.payara.extras</groupId>
    <artifactId>payara-embedded-all</artifactId>
    <version>6.2024.1</version>
    <scope>test</scope>
</dependency>
```

### WildFly

WildFly 27+ supports Jakarta EE 10. WildFly publishes a BOM (bill of materials), a POM that you import so that every WildFly-provided dependency in your build gets the version that matches the server:

```xml
<dependency>
    <groupId>org.wildfly.bom</groupId>
    <artifactId>wildfly-ee</artifactId>
    <version>30.0.0.Final</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>
```

## Common pitfalls

Our own code was the easy part. The surprises came from the places that the rename doesn't reach directly.

### 1. Third-party libraries

Some libraries still use the `javax` namespace, so check which version you're on. A library compiled against `javax` will often still build next to your migrated code, and then fail at runtime when it reaches for a class the new server doesn't have. Hibernate Validator is a good example, because the major version tells you the namespace:

```xml
<!-- Old Hibernate Validator (javax) -->
<dependency>
    <groupId>org.hibernate.validator</groupId>
    <artifactId>hibernate-validator</artifactId>
    <version>6.2.5.Final</version>  <!-- Uses javax -->
</dependency>

<!-- New Hibernate Validator (jakarta) -->
<dependency>
    <groupId>org.hibernate.validator</groupId>
    <artifactId>hibernate-validator</artifactId>
    <version>8.0.1.Final</version>  <!-- Uses jakarta -->
</dependency>
```

### 2. JAX-RS Client

The JAX-RS client lives in the same `ws.rs` package family as the server-side annotations, so code that calls other services moves along with your resources:

```java
// Before
import javax.ws.rs.client.ClientBuilder;
import javax.ws.rs.client.Client;

Client client = ClientBuilder.newClient();

// After
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.Client;

Client client = ClientBuilder.newClient();
```

### 3. Security annotations

These are easy to miss. `@RolesAllowed` and `@PermitAll` come from the separate `annotation` package, which isn't in the sed list above, so a script like that leaves them on `javax`:

```java
// Before
import javax.annotation.security.RolesAllowed;
import javax.annotation.security.PermitAll;

// After
import jakarta.annotation.security.RolesAllowed;
import jakarta.annotation.security.PermitAll;
```

### 4. JSON-B

JSON-B, the API for binding Java objects to JSON, sits under the `json` package and moves the same way:

```java
// Before
import javax.json.bind.Jsonb;
import javax.json.bind.JsonbBuilder;

// After
import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbBuilder;
```

## Testing after migration

Compiling only proves that the imports are consistent. What we needed to know was whether the server still wired everything together, because a missed descriptor or a stray `javax` reference shows up as a bean that doesn't get injected or an endpoint that doesn't respond. We wrote a small test suite to check that injection, persistence, validation, and REST endpoints still work. It uses Arquillian, which deploys a small test archive into a real server and runs the tests against it:

```java
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.ws.rs.client.ClientBuilder;
import jakarta.ws.rs.client.WebTarget;
import java.net.URL;
import org.jboss.arquillian.test.api.ArquillianResource;
// other imports omitted for brevity

@ExtendWith(ArquillianExtension.class)
public class MigrationVerificationTest {

    @Deployment
    public static WebArchive createDeployment() {
        return ShrinkWrap.create(WebArchive.class)
                .addPackages(true, "com.mycompany")
                .addAsResource("META-INF/persistence.xml")
                .addAsWebInfResource("beans.xml");
    }

    @Inject
    private OrderService orderService;

    @PersistenceContext
    private EntityManager em;

    @ArquillianResource
    private URL baseUrl;

    private final Validator validator =
        Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    public void testCDIInjection() {
        assertNotNull(orderService);
    }

    @Test
    public void testJPAEntityManager() {
        assertNotNull(em);
    }

    @Test
    public void testBeanValidation() {
        OrderRequest invalid = new OrderRequest();
        Set<ConstraintViolation<OrderRequest>> violations =
            validator.validate(invalid);
        assertFalse(violations.isEmpty());
    }

    @Test
    public void testJAXRS() {
        WebTarget target = ClientBuilder.newClient().target(baseUrl.toExternalForm());
        Response response = target.path("api/health").request().get();
        assertEquals(200, response.getStatus());
    }
}
```

Each test checks one specification: CDI injects the service, JPA provides an entity manager, Bean Validation rejects an invalid object, and the REST layer answers. None of them is clever, but a missed import, library or descriptor would show up in one of them.

## Migration checklist

Put together as a checklist:

- [ ] Update `pom.xml` dependencies to Jakarta EE
- [ ] Replace `javax` imports with `jakarta`
- [ ] Update `persistence.xml` namespace
- [ ] Update `web.xml` namespace
- [ ] Update `beans.xml` namespace
- [ ] Update third-party library versions
- [ ] Upgrade application server
- [ ] Run full test suite
- [ ] Test deployment to staging
- [ ] Monitor for runtime issues

## What Jakarta EE 10 adds

The namespace change itself gives you nothing new; it is the price of entry. Once you've migrated, you can use what came with Jakarta EE 10:

- CDI 4.0: CDI Lite, a build-time-friendly subset of CDI, and an empty `beans.xml` now means bean discovery mode `annotated` by default
- JPA 3.1: UUID as a basic type and new JPQL functions such as `CEILING`, `EXP`, `LN` and `EXTRACT`
- JAX-RS 3.1: SE bootstrap and better async support
- JSON-B 3.0: polymorphic type handling
- Security 3.0: OpenID Connect support
- Core Profile: a lighter deployment option

## How much work it is

Most of the migration is mechanical. You update imports and XML namespaces, and tools do most of that for you. The hard part is third-party libraries that haven't moved to `jakarta` yet, because there you depend on someone else's release schedule. In exchange you get a platform that is still actively developed, which is the reason to do it at all.

For a medium-sized application, plan for a few days of work, and test thoroughly before anything goes to production.
