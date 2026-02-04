---
title: "Migrating from Java EE to Jakarta EE: What You Need to Know"
description: "A practical guide to migrating enterprise applications from Java EE 8 to Jakarta EE 10, including namespace changes and common pitfalls."
date: 2024-05-10
tags: ["java", "jakarta-ee", "enterprise", "migration"]
---

When Oracle transferred Java EE to the Eclipse Foundation, it became Jakarta EE with significant namespace changes. Here's how we migrated our enterprise applications and what we learned.

## Understanding the Changes

The most significant change is the namespace migration from `javax.*` to `jakarta.*`:

| Java EE 8 | Jakarta EE 9+ |
|-----------|---------------|
| `javax.servlet` | `jakarta.servlet` |
| `javax.persistence` | `jakarta.persistence` |
| `javax.ws.rs` | `jakarta.ws.rs` |
| `javax.inject` | `jakarta.inject` |
| `javax.enterprise.context` | `jakarta.enterprise.context` |
| `javax.validation` | `jakarta.validation` |
| `javax.json` | `jakarta.json` |

## Migration Strategy

We used a phased approach:

### Phase 1: Dependency Updates

Update your `pom.xml` from Java EE to Jakarta EE:

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

Or individual dependencies:

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

### Phase 2: Namespace Migration

Replace all `javax` imports with `jakarta`:

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

### Automated Migration

Use the Eclipse Transformer for bulk migration:

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

For a simpler approach with sed (Linux/Mac):

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

### Phase 3: XML Configuration Files

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

Update `beans.xml`:

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

## Application Server Migration

### Payara Server

Payara 6+ supports Jakarta EE 10:

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

WildFly 27+ supports Jakarta EE 10:

```xml
<dependency>
    <groupId>org.wildfly.bom</groupId>
    <artifactId>wildfly-ee</artifactId>
    <version>30.0.0.Final</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>
```

## Common Pitfalls

### 1. Third-Party Libraries

Some libraries may still use `javax` namespace. Check compatibility:

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

### 3. Security Annotations

```java
// Before
import javax.annotation.security.RolesAllowed;
import javax.annotation.security.PermitAll;

// After
import jakarta.annotation.security.RolesAllowed;
import jakarta.annotation.security.PermitAll;
```

### 4. JSON-B

```java
// Before
import javax.json.bind.Jsonb;
import javax.json.bind.JsonbBuilder;

// After
import jakarta.json.bind.Jsonb;
import jakarta.json.bind.JsonbBuilder;
```

## Testing After Migration

Create a test suite to verify everything works:

```java
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
        Response response = target.path("/api/health").request().get();
        assertEquals(200, response.getStatus());
    }
}
```

## Migration Checklist

- [ ] Update `pom.xml` dependencies to Jakarta EE
- [ ] Run find/replace for `javax` → `jakarta` imports
- [ ] Update `persistence.xml` namespace
- [ ] Update `web.xml` namespace
- [ ] Update `beans.xml` namespace
- [ ] Update third-party library versions
- [ ] Upgrade application server
- [ ] Run full test suite
- [ ] Test deployment to staging
- [ ] Monitor for runtime issues

## Benefits of Jakarta EE 10

After migration, you get access to:

- **CDI 4.0** - Better event handling, improved interceptors
- **JPA 3.1** - Java records support, UUID keys
- **JAX-RS 3.1** - SE bootstrap, better async support
- **JSON-B 3.0** - Polymorphic type handling
- **Security 3.0** - OpenID Connect support
- **Core Profile** - Lighter deployment option

## Conclusion

While the namespace migration requires effort, Jakarta EE 10 brings modern features and active development. The migration is mostly mechanical—update imports and namespaces—with the main challenge being third-party library compatibility.

Plan for a few days of migration work for a medium-sized application, and always test thoroughly before deploying to production.
