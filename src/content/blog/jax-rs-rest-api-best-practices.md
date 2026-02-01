---
title: "Building Production-Ready REST APIs with JAX-RS"
description: "Best practices and patterns for building robust, maintainable REST APIs using JAX-RS in enterprise Java applications."
date: 2024-10-05
tags: ["java", "jax-rs", "rest-api", "enterprise"]
---

After building REST APIs with JAX-RS for several years in enterprise environments, I've collected a set of patterns and practices that have consistently proven valuable. Here's what works in production.

## Project Structure

A well-organized project structure makes maintenance easier:

```
src/main/java/
├── com/company/api/
│   ├── resources/           # JAX-RS resource classes
│   │   ├── OrderResource.java
│   │   └── CustomerResource.java
│   ├── services/            # Business logic
│   │   ├── OrderService.java
│   │   └── CustomerService.java
│   ├── repositories/        # Data access
│   │   └── OrderRepository.java
│   ├── models/              # Domain models
│   │   ├── Order.java
│   │   └── Customer.java
│   ├── dto/                 # Data transfer objects
│   │   ├── OrderRequest.java
│   │   └── OrderResponse.java
│   ├── mappers/             # DTO <-> Entity mappers
│   │   └── OrderMapper.java
│   ├── filters/             # JAX-RS filters
│   │   ├── AuthenticationFilter.java
│   │   └── LoggingFilter.java
│   ├── exceptions/          # Custom exceptions
│   │   └── ApiException.java
│   └── config/              # Configuration
│       └── ApplicationConfig.java
```

## Resource Class Design

Keep resource classes thin - they should only handle HTTP concerns:

```java
@Path("/orders")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class OrderResource {

    @Inject
    private OrderService orderService;

    @Inject
    private OrderMapper orderMapper;

    @GET
    public Response getOrders(
            @QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("20") int size) {

        Page<Order> orders = orderService.findOrders(status, page, size);

        return Response.ok()
                .entity(orderMapper.toResponseList(orders.getContent()))
                .header("X-Total-Count", orders.getTotalElements())
                .header("X-Total-Pages", orders.getTotalPages())
                .build();
    }

    @GET
    @Path("/{id}")
    public Response getOrder(@PathParam("id") Long id) {
        Order order = orderService.findById(id)
                .orElseThrow(() -> new NotFoundException("Order not found: " + id));

        return Response.ok(orderMapper.toResponse(order)).build();
    }

    @POST
    public Response createOrder(@Valid OrderRequest request) {
        Order order = orderService.create(orderMapper.toEntity(request));

        URI location = UriBuilder.fromResource(OrderResource.class)
                .path("{id}")
                .build(order.getId());

        return Response.created(location)
                .entity(orderMapper.toResponse(order))
                .build();
    }

    @PUT
    @Path("/{id}")
    public Response updateOrder(
            @PathParam("id") Long id,
            @Valid OrderRequest request) {

        Order order = orderService.update(id, orderMapper.toEntity(request));
        return Response.ok(orderMapper.toResponse(order)).build();
    }

    @DELETE
    @Path("/{id}")
    public Response deleteOrder(@PathParam("id") Long id) {
        orderService.delete(id);
        return Response.noContent().build();
    }
}
```

## Exception Handling

Use a global exception mapper for consistent error responses:

```java
@Provider
public class GlobalExceptionMapper implements ExceptionMapper<Throwable> {

    private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionMapper.class);

    @Override
    public Response toResponse(Throwable exception) {
        if (exception instanceof NotFoundException) {
            return buildResponse(Response.Status.NOT_FOUND, exception.getMessage());
        }

        if (exception instanceof BadRequestException) {
            return buildResponse(Response.Status.BAD_REQUEST, exception.getMessage());
        }

        if (exception instanceof ConstraintViolationException) {
            return handleValidationException((ConstraintViolationException) exception);
        }

        if (exception instanceof WebApplicationException) {
            WebApplicationException wae = (WebApplicationException) exception;
            return buildResponse(
                    Response.Status.fromStatusCode(wae.getResponse().getStatus()),
                    exception.getMessage()
            );
        }

        // Log unexpected exceptions
        LOG.error("Unexpected error", exception);
        return buildResponse(
                Response.Status.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred"
        );
    }

    private Response handleValidationException(ConstraintViolationException e) {
        List<String> errors = e.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .collect(Collectors.toList());

        return Response.status(Response.Status.BAD_REQUEST)
                .entity(new ErrorResponse("Validation failed", errors))
                .build();
    }

    private Response buildResponse(Response.Status status, String message) {
        return Response.status(status)
                .entity(new ErrorResponse(message))
                .build();
    }
}
```

## Request Validation

Use Bean Validation for input validation:

```java
public class OrderRequest {

    @NotNull(message = "Customer ID is required")
    private Long customerId;

    @NotEmpty(message = "At least one item is required")
    @Valid
    private List<OrderItemRequest> items;

    @Size(max = 500, message = "Notes must not exceed 500 characters")
    private String notes;

    // getters and setters
}

public class OrderItemRequest {

    @NotNull(message = "Product ID is required")
    private Long productId;

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    // getters and setters
}
```

## Logging and Monitoring

Implement a logging filter for request/response tracking:

```java
@Provider
@Priority(Priorities.USER)
public class LoggingFilter implements ContainerRequestFilter, ContainerResponseFilter {

    private static final Logger LOG = LoggerFactory.getLogger(LoggingFilter.class);
    private static final String START_TIME = "request-start-time";

    @Override
    public void filter(ContainerRequestContext requestContext) {
        requestContext.setProperty(START_TIME, System.currentTimeMillis());

        String requestId = UUID.randomUUID().toString().substring(0, 8);
        MDC.put("requestId", requestId);

        LOG.info("Request: {} {} from {}",
                requestContext.getMethod(),
                requestContext.getUriInfo().getPath(),
                requestContext.getHeaderString("X-Forwarded-For"));
    }

    @Override
    public void filter(ContainerRequestContext requestContext,
                       ContainerResponseContext responseContext) {

        long startTime = (long) requestContext.getProperty(START_TIME);
        long duration = System.currentTimeMillis() - startTime;

        LOG.info("Response: {} {} - {} in {}ms",
                requestContext.getMethod(),
                requestContext.getUriInfo().getPath(),
                responseContext.getStatus(),
                duration);

        MDC.clear();
    }
}
```

## Pagination Pattern

Implement consistent pagination across all list endpoints:

```java
public class PageRequest {
    private int page;
    private int size;
    private String sortBy;
    private String sortDir;

    public static PageRequest of(int page, int size) {
        PageRequest pr = new PageRequest();
        pr.page = Math.max(0, page);
        pr.size = Math.min(Math.max(1, size), 100); // Max 100 items
        return pr;
    }
}

public class Page<T> {
    private List<T> content;
    private int pageNumber;
    private int pageSize;
    private long totalElements;
    private int totalPages;
    private boolean first;
    private boolean last;

    // constructors and getters
}
```

## API Versioning

Use URI versioning for clarity:

```java
@ApplicationPath("/api/v1")
public class ApplicationConfig extends Application {
    // JAX-RS application configuration
}

// Or use a base path in resources
@Path("/v1/orders")
public class OrderResource {
    // ...
}
```

## Rate Limiting

Implement rate limiting to protect your API:

```java
@Provider
@Priority(Priorities.AUTHORIZATION + 1)
public class RateLimitFilter implements ContainerRequestFilter {

    private final LoadingCache<String, RateLimiter> limiters = CacheBuilder.newBuilder()
            .expireAfterAccess(1, TimeUnit.HOURS)
            .build(new CacheLoader<String, RateLimiter>() {
                @Override
                public RateLimiter load(String key) {
                    return RateLimiter.create(100.0); // 100 requests per second
                }
            });

    @Override
    public void filter(ContainerRequestContext requestContext) throws IOException {
        String clientId = getClientIdentifier(requestContext);
        RateLimiter limiter = limiters.getUnchecked(clientId);

        if (!limiter.tryAcquire()) {
            throw new WebApplicationException(
                    Response.status(429)
                            .header("Retry-After", "1")
                            .entity(new ErrorResponse("Rate limit exceeded"))
                            .build()
            );
        }
    }

    private String getClientIdentifier(ContainerRequestContext context) {
        // Use API key, user ID, or IP address
        String apiKey = context.getHeaderString("X-API-Key");
        if (apiKey != null) return apiKey;

        return context.getHeaderString("X-Forwarded-For");
    }
}
```

## Testing

Test your resources with Arquillian or REST-assured:

```java
@ExtendWith(ArquillianExtension.class)
public class OrderResourceTest {

    @ArquillianResource
    private URL baseURL;

    @Test
    public void shouldCreateOrder() {
        OrderRequest request = new OrderRequest();
        request.setCustomerId(1L);
        request.setItems(List.of(new OrderItemRequest(100L, 2)));

        given()
            .contentType(ContentType.JSON)
            .body(request)
        .when()
            .post(baseURL + "api/v1/orders")
        .then()
            .statusCode(201)
            .header("Location", containsString("/orders/"))
            .body("id", notNullValue())
            .body("status", equalTo("PENDING"));
    }

    @Test
    public void shouldReturn404ForUnknownOrder() {
        given()
        .when()
            .get(baseURL + "api/v1/orders/99999")
        .then()
            .statusCode(404)
            .body("message", containsString("not found"));
    }
}
```

## Key Takeaways

1. **Keep resources thin** - Move business logic to services
2. **Use DTOs** - Don't expose your entities directly
3. **Validate everything** - Use Bean Validation consistently
4. **Handle errors gracefully** - Global exception mapper for consistency
5. **Log and monitor** - Track all requests for debugging
6. **Version your API** - Plan for future changes
7. **Test thoroughly** - Integration tests catch real issues

These patterns have served me well across multiple enterprise projects. Start simple and add complexity only when needed.
