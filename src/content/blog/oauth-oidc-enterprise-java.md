---
title: "Implementing OAuth 2.0 and OpenID Connect in Enterprise Java Applications"
description: "How we secured an enterprise application with OAuth 2.0 and OIDC, and what I learned implementing it."
date: 2024-07-22
tags: ["java", "security", "oauth", "enterprise"]
---

I recently implemented OAuth 2.0 and OpenID Connect (OIDC) for a large-scale automotive industry platform. This post covers the decisions we made and what I'd do the same way again.

## Why OAuth 2.0 and OpenID Connect?

Traditional session-based authentication doesn't scale well in distributed systems. OAuth 2.0 is a standard framework for authorization, and OpenID Connect adds an identity layer on top. Together they gave us:

- Single sign-on (SSO) across multiple applications
- Standardized token-based authentication
- Identity management decoupled from the applications
- Better security through short-lived tokens and refresh tokens

## Architecture overview

In our implementation, we used a three-tier approach:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Authorization  │────▶│   Resource      │
│   (React SPA)   │     │     Server      │     │    Server       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

The authorization server handles:
- User authentication
- Token issuance (access tokens, refresh tokens, ID tokens)
- Token validation and introspection

## Implementation decisions

### 1. Token storage

For our React frontend, we kept access tokens in memory and stored refresh tokens in HTTP-only cookies:

```javascript
// Token service - simplified example
class TokenService {
  private accessToken: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async refreshToken(): Promise<string> {
    // Refresh token is sent automatically via HTTP-only cookie
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    });
    const data = await response.json();
    this.setAccessToken(data.access_token);
    return data.access_token;
  }
}
```

### 2. Backend token validation

On the Jakarta EE backend, we implemented a JAX-RS filter for token validation:

```java
@Provider
@Priority(Priorities.AUTHENTICATION)
public class OAuthFilter implements ContainerRequestFilter {

    @Inject
    private TokenValidationService tokenService;

    @Override
    public void filter(ContainerRequestContext requestContext) {
        String authHeader = requestContext.getHeaderString(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            abortWithUnauthorized(requestContext);
            return;
        }

        String token = authHeader.substring("Bearer ".length());

        try {
            TokenInfo tokenInfo = tokenService.validateToken(token);
            SecurityContext securityContext = new OAuthSecurityContext(tokenInfo);
            requestContext.setSecurityContext(securityContext);
        } catch (TokenValidationException e) {
            abortWithUnauthorized(requestContext);
        }
    }
}
```

### 3. Scope-based authorization

We defined granular scopes for different operations:

- `read:reports`: view reports
- `write:reports`: create or modify reports
- `admin:users`: user management
- `manage:tasks`: task management operations

## Lessons learned

### Handle token expiration before it happens

One of the hardest parts was handling token expiration in the frontend without interrupting the user. We refresh proactively, before each API call:

```javascript
// Check token expiration before each API call
async function apiCall(endpoint, options) {
  const token = tokenService.getAccessToken();

  if (isTokenExpiringSoon(token)) {
    await tokenService.refreshToken();
  }

  return fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${tokenService.getAccessToken()}`
    }
  });
}
```

### Implement proper logout

OIDC logout requires coordination between the frontend, your application, and the identity provider:

1. Clear local tokens
2. Invalidate refresh token on the server
3. Redirect to identity provider's logout endpoint
4. Handle the post-logout redirect

### Test the whole flow

We tested at several levels:
- Unit tests for token validation logic
- Integration tests for the full authentication flow
- Security penetration testing
- Load testing for token validation endpoints

## Final thoughts

Getting OAuth 2.0 and OIDC right takes planning, but we ended up with authentication that is more secure and scales better than sessions did, and users get SSO across applications.

Most of the work is understanding the OAuth flows well enough to pick the right one for your use case. We used the Authorization Code Flow with PKCE.
