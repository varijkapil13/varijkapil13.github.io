---
title: "Implementing OAuth 2.0 and OpenID Connect in Enterprise Java Applications"
description: "How we moved a large enterprise platform with a React frontend and a Jakarta EE backend onto OAuth 2.0 and OpenID Connect, and what I learned about tokens, refresh and logout along the way."
date: 2024-07-22
image: "/images/blog/oauth-oidc-enterprise-java.jpg"
tags: ["java", "security", "oauth", "enterprise"]
---

I recently implemented OAuth 2.0 and OpenID Connect (OIDC) for a large-scale platform in the automotive industry. The platform has a React single-page application in front and a Jakarta EE backend behind it, and users work across several applications. These are the decisions we made and the ones I would make the same way again. If you have only worked with a login form and a server session, I'll explain each OAuth piece as it comes up, because the decisions only make sense once you know what the pieces are for.

## Why we moved away from sessions

The traditional way to keep a user logged in is a server-side session. The user submits a username and password, the server checks them, stores a session object in its memory and hands the browser a cookie with the session ID. Every later request carries that cookie, and the server looks the session up. That works for one application on one server. In a distributed system the session lives in one server's memory, so several instances need sticky routing or a shared session store, and several applications each end up with their own login.

OAuth 2.0 is a standard framework for authorization: it defines how an application obtains a token that lets it call an API on a user's behalf. It says nothing about who the user is, which is why OpenID Connect exists. OIDC adds an identity layer on top of OAuth, mainly in the form of an ID token that tells the application who logged in. Together they gave us single sign-on across our applications, a standardized, token-based way of authenticating requests, and identity management that lives in one place instead of inside each application. They also improved security, because access tokens are short-lived and are renewed with refresh tokens instead of staying valid for as long as a session would.

## The three parties involved

Our setup has three tiers:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Authorization  │────▶│   Resource      │
│   (React SPA)   │     │     Server      │     │    Server       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

The arrows follow the life of a user session more than the path of a single request. The frontend is the React application running in the browser. It never sees the user's password; it sends the user to the authorization server to log in. That server authenticates the user, issues the tokens (an access token for calling APIs, a refresh token for getting new access tokens, and the ID token that OIDC adds) and can also validate and introspect tokens, meaning it can answer the question "is this token still valid, and what is it allowed to do?". The resource server is our Jakarta EE backend, the thing that holds the data. Once the frontend has a token, it calls the resource server directly and attaches the token to each request.

How the frontend gets its tokens is decided by the OAuth flow you pick, and we used the Authorization Code Flow with PKCE. In the authorization code flow the browser is redirected to the authorization server's login page, and after a successful login it comes back to the application with a short-lived one-time code, which is then exchanged for tokens. A single-page application can't keep a client secret, because anything shipped to the browser can be read by anyone. PKCE (Proof Key for Code Exchange) solves that: before the redirect, the client generates a random secret called the code verifier and sends only a hash of it along with the login request. When it later exchanges the code for tokens, it sends the original verifier, and the authorization server checks that it matches. Someone who intercepts the code can't use it without the verifier.

## Where the tokens live in the browser

Once the tokens arrive, the frontend has to keep them somewhere. Anything stored in `localStorage` or `sessionStorage` can be read by any JavaScript running on the page, so a single cross-site scripting (XSS) bug would let an attacker copy a token and use it from their own machine. We treated the two kinds of token differently. Access tokens are kept only in memory, in a JavaScript variable, and refresh tokens are stored in HTTP-only cookies. An HTTP-only cookie is one the browser sends with matching requests but never exposes to JavaScript, so page scripts can't read it at all. Here is a simplified version of the token service:

```typescript
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

The thing to notice is that `refreshToken()` never touches the refresh token itself. It calls the refresh endpoint with `credentials: 'include'`, which tells the browser to attach cookies, and the cookie travels along without the frontend code ever seeing it. The response carries a fresh access token, which goes straight back into memory. A side effect of keeping the access token in memory is that it disappears when the user reloads the page, but that is fine: the same refresh call gets a new one, as long as the refresh cookie is still valid.

## Checking tokens on the backend

On the Jakarta EE backend, every API request has to carry a valid token before any business code runs, and we checked that in a JAX-RS filter. A `ContainerRequestFilter` sees each incoming request before it reaches a resource method, and the `@Priority(Priorities.AUTHENTICATION)` annotation places it among the first filters to run, which is where authentication belongs.

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

    private void abortWithUnauthorized(ContainerRequestContext requestContext) {
        requestContext.abortWith(Response.status(Response.Status.UNAUTHORIZED).build());
    }
}
```

The filter reads the `Authorization` header and expects it to start with `Bearer `, the standard way to send an OAuth access token. If the header is missing or the token fails validation, the request is stopped with a 401 Unauthorized and never reaches the resource. If the token is valid, the filter wraps what it learned about the token in a custom `SecurityContext` and attaches it to the request. That last step is what makes the rest of the backend simple: resource classes can ask the standard JAX-RS `SecurityContext` who the user is and what they may do, without knowing anything about OAuth or tokens. 

## Deciding what a token is allowed to do

Knowing who the caller is doesn't say what they may do. OAuth handles that with scopes, named permissions written into the token, and we defined granular ones for the different operations:

- `read:reports`: view reports
- `write:reports`: create or modify reports
- `admin:users`: user management
- `manage:tasks`: task management operations

Splitting read and write for reports means a token that only needs to view reports can't change them, so a leaked token or a bug does less damage.

## Refreshing before the token expires

One of the hardest parts of the whole project was handling token expiration in the frontend without interrupting the user. If the frontend only notices an expired token when an API call fails, the user sees an error, or the code has to catch the failure, refresh and retry. We refresh proactively instead, checking before each API call:

```javascript
// Check token expiration before each API call
async function apiCall(endpoint, options) {
  const token = tokenService.getAccessToken();

  if (isTokenExpiringSoon(token)) { // helper omitted for brevity
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

The header reads `tokenService.getAccessToken()` again after the check, so a request that triggered a refresh goes out with the new token, and since every call goes through this function, the rest of the frontend never thinks about expiry.

## Logging out properly

With single sign-on, several places remember the user. If you only clear the tokens in the browser, the refresh token is still valid on the server, and the authorization server still has its own login session, so the next login goes straight through without a password. A proper OIDC logout needs the frontend, your application and the identity provider to work together:

1. Clear local tokens
2. Invalidate refresh token on the server
3. Redirect to identity provider's logout endpoint
4. Handle the post-logout redirect

In the last step the identity provider sends the browser back to the application, which has to show a logged-out page rather than start a new login straight away.

## Testing it end to end

Authentication is one of those areas where every piece can work on its own and the whole still fails, so we tested at several levels. Unit tests covered the token validation logic, and integration tests ran the full authentication flow from login to API call. We also ran security penetration tests, and we load-tested the token validation endpoints, since every single API request depends on them and they must not become the bottleneck.

## Looking back

Getting OAuth 2.0 and OIDC right took planning, but we ended up with authentication that is more secure and scales better than sessions did, and users get single sign-on across the applications instead of logging in again in each one. Most of the effort went into understanding the OAuth flows well enough to pick the right one for our case. Once we had settled on the Authorization Code Flow with PKCE, most of the other decisions, from where tokens live to how the backend checks them, followed from it.
