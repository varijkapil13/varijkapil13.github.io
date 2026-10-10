---
title: "Building Production-Ready REST APIs with JAX-RS"
description: "Getting a JAX-RS endpoint to return JSON takes minutes; keeping an API maintainable for years takes some structure. These are the patterns I use for that in enterprise Java applications, and the reasons behind them."
date: 2021-11-08
image: "/images/blog/jax-rs-rest-api-best-practices.jpg"
tags: ["java", "jax-rs", "rest-api", "enterprise"]
---

JAX-RS, the Java standard for REST APIs (now part of Jakarta EE as Jakarta REST), makes the first endpoint almost too easy. You put `@Path` on a class, `@GET` on a method, return an object, and the runtime turns it into JSON. The hard part comes later, when the API has dozens of resources, several developers working on it and clients that depend on it not changing under them. That's when you find out whether errors look the same everywhere, whether bad input gets rejected before it reaches the database, and whether you can tell from the logs what a request did.

I've built REST APIs with JAX-RS for several years in enterprise environments, and a handful of patterns keep showing up in every project that holds up in production. They are the answers I've settled on for questions that every API eventually has to answer, and this post goes through them in the order I'd set them up in a new project.

## Where the code lives

The first question is the least exciting and has the longest-lasting effect: how to organize the code. The layout I use separates the HTTP layer, the business logic and the data access into their own packages, and keeps the objects that go over the wire apart from the objects that go into the database:

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

The split between `models` and `dto` is the one people most often question, because it means writing mapper classes. The reason for it is that a database entity and an API response change for different reasons. If you return entities directly, renaming a column changes your public API, a lazily loaded relationship can trigger extra queries or fail during JSON serialization, and fields you never meant to expose end up in responses. Data transfer objects (DTOs) are plain classes shaped for the client, and the mapper is the one place where the two shapes meet. With a clear layout, anyone opening the project knows where to look, and maintenance gets easier.

## Keeping resource classes thin

That layout only helps if each layer sticks to its job, and the layer most tempted to do too much is the resource class, because it's where the request arrives. My rule is that a resource class handles HTTP concerns and nothing else: reading parameters, calling a service, choosing a status code and setting headers. Here is a complete resource for orders:

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

Every method follows the same shape, and the HTTP details are where the care goes. Creating an order returns `201 Created` with a `Location` header pointing at the new resource, which is what the HTTP specification expects and lets clients find the new order without guessing its URL. Deleting returns `204 No Content`, because there is nothing left to send. The list endpoint puts the total count and number of pages into headers, so the body stays a plain list. And a missing order is signalled by throwing `NotFoundException` instead of building a 404 response by hand, which is the first hint of how errors are handled in the next section.

## One place where errors become responses

Errors are where APIs most often fall apart. One endpoint returns a JSON error object, another returns an HTML error page from the application server, a third returns a stack trace, and the client has to handle all of them. JAX-RS has a mechanism for avoiding this. An `ExceptionMapper` is a class that the runtime calls whenever an exception escapes a resource method, and its job is to turn that exception into a response. If you register one for `Throwable`, every error in the application goes through the same code:

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

The order of the checks matters. Known cases come first: not found, bad request, validation failures, and any other `WebApplicationException`, which already carries the status code it wants. Everything that falls through is a bug or an outage, so it is logged with its full stack trace and the client gets a generic 500 with a neutral message. The client never sees internal details like class names or SQL errors, while we still have everything we need in the logs. And because every branch ends in the same `ErrorResponse`, clients only have to parse one error format.

## Rejecting bad input at the door

The validation branch in that mapper is fed by the next pattern. Every API receives bad input sooner or later: a missing field, a negative quantity, a note the length of a novel. You can check each of these by hand at the start of every method, but those checks get forgotten and end up phrased differently everywhere. Bean Validation lets you declare the rules on the request DTO itself:

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

Remember the `@Valid` on the `OrderRequest` parameters in the resource class. That annotation tells the JAX-RS runtime to validate the body before the method runs. If a rule is broken, the method is never called, a `ConstraintViolationException` is thrown, and the exception mapper turns it into a 400 response listing each field and what was wrong with it. The `@Valid` on the `items` list does the same one level down, so each item is validated as well. The resource method can then assume it's working with sensible data, and the service layer never sees a request without a customer.

## Knowing what each request did

Once the API is running, the first question in any incident is what happened to a particular request. A logging filter answers it. JAX-RS filters run around every request: a `ContainerRequestFilter` before the resource method and a `ContainerResponseFilter` after it. This one implements both, so it can log the request when it arrives and the response with its status and duration when it leaves:

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

Two parts of it are worth explaining. The start time is stored as a property on the request context, which is how the two halves of the filter share data for the same request. The request ID goes into the MDC (Mapped Diagnostic Context), a per-thread map that the logging framework adds to every log line written while the request is handled. That means log lines from the services and repositories carry the same ID as the request and response lines, and you can pull out everything one request did with a single search. The client address comes from `X-Forwarded-For` because in production the API usually sits behind a proxy or load balancer, and that header is where the proxy records the original caller. Clearing the MDC at the end matters because servers reuse threads, and the next request on this thread shouldn't inherit the old ID.

## Pagination that looks the same everywhere

List endpoints are where APIs tend to drift apart. One endpoint uses `page` and `size`, another `offset` and `limit`, a third returns everything at once until the table grows and it falls over. I use the same pagination model on every list endpoint, with a request object that sanitizes its own input and a page object that tells the client where it is:

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

The cap of 100 items in `PageRequest.of` is the important line. Without it, a client can ask for a page size of a million and turn a list endpoint into a full table export. Negative pages and zero-sized pages are corrected too, so the service layer never has to check for them. The `Page` object is what produced the `X-Total-Count` and `X-Total-Pages` headers in the resource earlier.

## Versioning before you need it

At some point an API needs a change that would break existing clients, and by then it's too late to add versioning without breaking them anyway. So I version the API from day one. I prefer putting the version in the URI, because it's obvious from the URL which version a client is calling, whether you're reading logs, looking at a proxy configuration or debugging with a colleague. In JAX-RS that can be set once for the whole application or per resource:

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

The `@ApplicationPath` approach is the simpler one when everything moves to a new version together. Putting the version into each resource's path makes more sense when individual resources move to a new version at different times.

## Protecting the API from a single client

An API that is open to many clients has to make sure that one of them can't use up all of its capacity, whether through a bug in a retry loop or on purpose. Rate limiting does this by capping how many requests each client can make in a given time. This filter gives every client its own limiter from Guava, allowing 100 requests per second, and answers with `429 Too Many Requests` once a client goes over:

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

A few choices in here are deliberate. The priority places the filter right after authorization, so requests that would be rejected anyway don't count against anyone's limit. Limiters live in a cache that forgets clients after an hour without requests, so memory doesn't grow with every client that ever called. `tryAcquire()` returns immediately instead of waiting, so an over-limit request is rejected at once and a `Retry-After` header tells the client when to try again. And the rejection is thrown as a `WebApplicationException`, which means it passes through the same exception mapper as every other error. One caveat: a limiter like this lives in the memory of a single instance, so when the API runs on several instances, each one counts on its own.

## Testing through HTTP

The last pattern ties the others together. Most of what I've described so far, the status codes, validation, the exception mapper and the filters, lives in the JAX-RS runtime and not in your own methods, so a unit test that calls a resource method directly won't exercise any of it. That's why I test resources through real HTTP calls, with Arquillian to run the application in a container and REST-assured to send requests and check the responses:

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

The first test checks that creating an order returns 201 with a `Location` header, which only works if the resource, the JSON mapping and the service fit together. The second checks that an unknown ID returns 404 with the message from `NotFoundException`, which only works if the exception mapper is registered and doing its job. These integration tests catch the issues unit tests miss.

## Looking back

Taken together, these patterns describe the path a request takes through the API. It enters through filters that log it and limit it, gets validated before the resource method sees it, is handled by a thin resource that hands the real work to a service, travels as DTOs rather than entities, and if anything goes wrong, leaves through the one exception mapper that every error shares. Versioning and pagination keep the outside of that path stable for clients, and HTTP-level tests check that the whole path works.

These patterns have served me well across multiple enterprise projects. The structure, the exception mapper, validation and versioning cost little at the start and are painful to add later. Rate limiting and the rest can wait until the API actually needs them: start simple and add complexity only when you need it.
