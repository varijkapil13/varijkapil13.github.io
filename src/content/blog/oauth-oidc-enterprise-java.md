---
title: "Implementing OAuth 2.0 and OpenID Connect in Enterprise Java Applications"
description: "A practical guide to securing enterprise applications with OAuth 2.0 and OIDC, based on real-world implementation experience."
date: 2024-11-15
tags: ["java", "security", "oauth", "enterprise"]
---

Authentication and authorization are critical components of any enterprise application. After implementing OAuth 2.0 and OpenID Connect (OIDC) for a large-scale automotive industry platform, I want to share some insights and lessons learned.

## Why OAuth 2.0 and OpenID Connect?

Traditional session-based authentication doesn't scale well in modern distributed systems. OAuth 2.0 provides a robust framework for authorization, while OpenID Connect adds an identity layer on top, giving us:

- **Single Sign-On (SSO)** across multiple applications
- **Standardized token-based authentication**
- **Decoupled identity management**
- **Better security** through short-lived tokens and refresh mechanisms

## Architecture Overview

In our implementation, we used a three-tier approach:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Authorization  │────▶│   Resource      │
│   (React SPA)   │     │     Server      │     │    Server       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

The Authorization Server handles:
- User authentication
- Token issuance (access tokens, refresh tokens, ID tokens)
- Token validation and introspection

## Key Implementation Decisions

### 1. Token Storage Strategy

For our React frontend, we opted for **in-memory token storage** combined with refresh tokens stored in HTTP-only cookies:

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

### 2. Backend Token Validation

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

### 3. Scope-Based Authorization

We defined granular scopes for different operations:

- `read:reports` - View reports
- `write:reports` - Create/modify reports
- `admin:users` - User management
- `manage:tasks` - Task management operations

## Lessons Learned

### Handle Token Expiration Gracefully

One of the biggest challenges was handling token expiration in the frontend without disrupting user experience. We implemented a **proactive refresh strategy**:

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

### Implement Proper Logout

OIDC logout requires coordination between the frontend, your application, and the identity provider:

1. Clear local tokens
2. Invalidate refresh token on the server
3. Redirect to identity provider's logout endpoint
4. Handle the post-logout redirect

### Test Thoroughly

Security implementations need comprehensive testing:
- Unit tests for token validation logic
- Integration tests for the full authentication flow
- Security penetration testing
- Load testing for token validation endpoints

## Conclusion

Implementing OAuth 2.0 and OIDC correctly requires careful planning and attention to security details. The investment pays off with a more secure, scalable, and user-friendly authentication system.

The key is to understand the OAuth flows deeply, choose the right flow for your use case (we used Authorization Code Flow with PKCE), and always follow security best practices.
