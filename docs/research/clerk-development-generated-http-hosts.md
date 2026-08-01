# Clerk Development on generated HTTP hosts

Researched 2026-08-01 against current primary sources.

## Question

Can a Clerk Development instance provide Unshelf's complete authentication flow
on Dokploy-generated, changing `http://*.traefik.me` development and pull-request
preview hosts? What origin, redirect, cookie, Google OAuth, and security constraints
must a later topology prototype prove?

## Conclusion

**Changing generated preview hostnames are an intended Clerk Development use case;
plain HTTP on a non-localhost hostname is not an acceptable hosted-auth topology.**

Clerk explicitly recommends Development keys for independent previews on a hosting
provider's generated domain. A Development instance dynamically detects the browser's
development host, and its Google connection uses Clerk's already-configured shared
OAuth credentials and redirect URIs. Unshelf uses Clerk's modal sign-in and sends the
resulting session token to its same-origin API as a bearer token, so no separate web/API
cookie-sharing design or per-preview Google callback registration is inherent in the
current application. ([Clerk preview environments](https://clerk.com/docs/guides/development/managing-environments#preview-environments),
[dynamic development host detection](https://clerk.com/docs/guides/account-portal/getting-started#dynamic-development-host-detection),
[Google in Development](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google#configure-for-your-development-instance),
[Unshelf auth adapter](../../apps/web/src/auth.tsx),
[Unshelf API client](../../apps/web/src/api.ts))

That establishes a strong expectation that the flow can work on a newly generated
hostname, but the Clerk documentation does **not** promise arbitrary cleartext HTTP
hosts. Its HTTP examples are `localhost`; provider-generated previews are documented
without relaxing normal web transport security. A name such as
`http://app.<ip>.traefik.me` is not `localhost` and is not a loopback-IP URL, so it is
not a potentially trustworthy origin under the Secure Contexts algorithm merely
because DNS eventually resolves it to a private or loopback address. `traefik.me`
itself describes this pattern as public wildcard DNS for reaching a LAN server.
([Secure Contexts, section 3.1](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy),
[`traefik.me`](https://traefik.me/))

The later prototype should therefore distinguish two outcomes:

- **Functional:** the current Google modal, redirect back, token refresh, protected API
  call, reload, and sign-out all work in target browsers on each generated host.
- **Acceptable:** the hosted environment uses HTTPS. A successful HTTP experiment does
  not meet this bar and must not become a shared development or preview topology.

This distinction is not cosmetic. Clerk says Development instances have a relaxed
security posture and are unsuitable for production. Their long-lived development
browser credential is propagated in the `__clerk_db_jwt` query parameter, which Clerk
warns can leak through browser history, server and ISP logs, extensions, or network
interception. Plain HTTP removes transport protection from that redirect and from
Unshelf's bearer-authenticated API requests. ([Clerk environment and session
architecture](https://clerk.com/docs/guides/development/managing-environments#session-architecture-differences),
[Clerk authentication model](https://clerk.com/docs/guides/how-clerk-works/overview#the-handshake))

## Generated hosts and configuration

### Development keys and host changes

Each development or preview deployment should use the same matching Development
publishable/secret key pair (`pk_test_…` and `sk_test_…`), never Production keys.
Clerk documents generated preview domains with Development keys as the easiest
independent-preview arrangement and says Production keys cannot be used on a host's
provided preview domain. Development instances are limited to 100 users, have a
separate user store, and cannot transfer their users to Production. ([preview
environment choices](https://clerk.com/docs/guides/development/managing-environments#using-independent-settings-and-user-data),
[Development-instance limits](https://clerk.com/docs/guides/development/managing-environments#development-instance),
[key formats](https://clerk.com/docs/guides/development/deployment/production#api-keys-and-environment-variables))

Clerk stores the dynamically detected Development host as the browser's “home origin.”
This avoids a fixed production-domain registration, but the docs do not specify the
exact behavior when one browser visits several changing preview origins. Session
re-establishment and redirect isolation across two simultaneous preview hosts must be
tested rather than assumed. ([dynamic development host
detection](https://clerk.com/docs/guides/account-portal/getting-started#dynamic-development-host-detection))

### Frontend API allowed origins

No source found requires adding every ordinary web preview hostname to the Clerk
instance's `allowedOrigins`. Clerk documents that property for browser-like stacks
with nonstandard origins such as Chrome extensions, Electron, and Capacitor, while its
preview guide separately tells normal web previews to use Development keys. Do not
automate Dashboard `allowedOrigins` churn unless the prototype returns a concrete FAPI
origin error that requires it. ([Backend `Instance.allowedOrigins`](https://clerk.com/docs/reference/backend/types/backend-instance#properties),
[preview environments](https://clerk.com/docs/guides/development/managing-environments#preview-environments))

This is distinct from API token authorization. Clerk session tokens carry an `azp`
claim containing the browser `Origin`. Clerk strongly recommends configuring
`clerkMiddleware({ authorizedParties: [...] })` so the backend accepts tokens minted
only for known exact origins; omitting it can expose the application to CSRF or
subdomain-cookie-leak attacks. Unshelf currently calls `clerkMiddleware()` without
this option. Each deployment should eventually receive its own canonical public origin
and pass that exact origin as an authorized party; do not treat the entire shared
`traefik.me` suffix as trusted. ([session-token `azp`](https://clerk.com/docs/guides/sessions/session-tokens#default-claims),
[`authorizedParties` verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification#validate-the-token-signature),
[`clerkMiddleware` option](https://clerk.com/docs/reference/express/clerk-middleware#clerkmiddleware-options),
[current Unshelf middleware](../../apps/api/src/middleware/auth.ts))

### Redirect URLs

Unshelf's `<SignInButton mode="modal">` does not supply a custom OAuth redirect. By
default, Clerk persists the initiating page as `redirect_url` and returns there after
sign-in. Relative fallback/force redirect paths would remain portable across generated
hosts if Unshelf later needs them. ([Clerk redirect behavior](https://clerk.com/docs/guides/development/customize-redirect-urls),
[current Unshelf modal](../../apps/web/src/auth.tsx))

This must not be confused with Clerk's custom `startSSOFlow()`: when an application
passes a custom `redirectUrl` to that API, Clerk requires it to be registered in the
Dashboard or OAuth can complete without creating a session. Unshelf does not currently
use that flow. If it adopts one, generated absolute preview URLs would create explicit
registration lifecycle work; a relative/current-origin flow should be preferred where
the SDK contract permits it. ([custom OAuth flow](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections))

## Session and cookie behavior

In Development, the app origin and Clerk's HTTPS `*.accounts.dev` Frontend API are
cross-site. Clerk avoids unreliable third-party cookies by using a long-lived “dev
browser” object linked to the client token and transporting it through
`__clerk_db_jwt`. That is what makes independent generated preview domains plausible;
it is also explicitly less secure than Production. ([Development session
architecture](https://clerk.com/docs/guides/development/managing-environments#session-architecture-differences))

The application session token is different: Clerk writes the short-lived JWT into a
host-scoped `__session` cookie on the application's own domain. It is JavaScript-readable,
has `SameSite=Lax`, normally lives for 60 seconds, and the frontend SDK refreshes it
approximately every 50 seconds. Because it is scoped to the exact application host,
one preview's `__session` cookie is not a shared cookie for sibling preview hosts.
([session token details](https://clerk.com/docs/guides/how-clerk-works/overview#session-token),
[refresh mechanism](https://clerk.com/docs/guides/how-clerk-works/overview#token-refresh-mechanism))

Unshelf does not depend on the browser automatically sending that cookie to a distinct
API origin: `getToken()` supplies a bearer token on requests to relative `/api/*`
paths, and Traefik is expected to keep web and API under one public origin. Clerk's
Express middleware can read that authorization token. ([Unshelf API client](../../apps/web/src/api.ts),
[Unshelf Vite/Traefik origin shape](../../apps/web/vite.config.ts),
[Clerk token locations](https://clerk.com/docs/guides/sessions/verifying#manually-verify-a-session-token))

On plain HTTP, neither the URL-carried development credential nor the session bearer
token has TLS confidentiality. Cookies marked `Secure` are sent only over secure
channels, while cookies left non-Secure can traverse cleartext; either outcome is the
wrong basis for hosted authentication. ([RFC 6265, Secure
attribute](https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.2.5),
[Clerk's HTTPS guidance for session identifiers](https://clerk.com/docs/guides/how-clerk-works/overview#stateful-authentication))

## Google OAuth constraints

For a Development instance, enabling Google is sufficient: Clerk supplies shared
credentials and preconfigured redirect URIs. The Google-facing callback is therefore
Clerk's HTTPS infrastructure, not every changing Unshelf preview host, so generated
preview names do not need to be added to a Google Cloud OAuth client for the current
flow. The consent screen displays Clerk's `accounts.dev` development domain. Google
sign-in must run in a normal browser, not a WebView or embedded user-agent. ([Clerk
Google Development setup](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/google#configure-for-your-development-instance),
[Development consent-domain behavior](https://clerk.com/docs/guides/development/managing-environments#development-instance),
[Google secure-browser policy](https://developers.google.com/identity/protocols/oauth2/policies#secure-browsers))

The answer changes with custom Google credentials. Google's web-client rules require
HTTPS for authorized JavaScript origins and redirect URIs, exempting localhost but not
arbitrary HTTP domain names; they also disallow wildcard origins. Google requires
domains in a production OAuth configuration to be owned, authorized, or licensed by
the app operator. A generated `http://*.traefik.me` origin therefore cannot be the
production/custom-credential escape hatch. ([Google web-client URI
rules](https://support.google.com/cloud/answer/15549257#web-applications),
[Google domain-ownership and HTTPS policy](https://developers.google.com/identity/protocols/oauth2/policies#only-use-domains-you-own))

## Security boundary

Use a Development instance only for developers and disposable preview data. It is
explicitly capped and deliberately less secure, and its users are not transferable to
Production. Do not expose real user data, treat a successful Development login as
evidence for Production cookie behavior, or share Production keys/data with these
independent previews. ([Clerk instance comparison](https://clerk.com/docs/guides/development/managing-environments))

`http://*.traefik.me` has a second boundary beyond Clerk: it is not a browser-secure
context. The W3C exception covers literal loopback addresses and `localhost` names,
not arbitrary DNS names that happen to resolve to a loopback/private IP. Features that
require a secure context can therefore differ from local `http://localhost` behavior,
and all credentials sent to Unshelf over HTTP are open to network observation or
modification. ([Secure Contexts algorithm](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy))

## Acceptance checks for the topology prototype

Run these checks with non-sensitive test accounts and a Development key pair. Test at
least Chromium, Firefox, and Safari because Clerk's Development architecture exists in
part to avoid differing third-party-cookie policies. ([Clerk on cross-site cookie
restrictions](https://clerk.com/docs/guides/development/managing-environments#session-architecture-differences))

1. **Cold initialization:** In a fresh browser profile, load generated host A and
   confirm Clerk initializes without FAPI CORS/origin errors and Unshelf shows its
   signed-out screen.
2. **Google round trip:** Open the modal, choose Google in a normal top-level browser,
   complete both first-time sign-up and returning sign-in, and verify the final URL is
   the exact initiating host and path—not another preview, localhost, or only the
   `accounts.dev` portal.
3. **Application round trip:** Confirm `getToken()` returns a session token and a
   protected `/api/me` (or equivalent harmless read) returns `200` for that Clerk user;
   repeat after at least one automatic token-refresh interval.
4. **Session recovery:** Reload, open a second tab, close all tabs for longer than the
   60-second session-token lifetime, then reopen host A. Verify Clerk restores the
   session through the Development handshake and the API remains authenticated.
5. **Sign-out:** Sign out, reload, and verify Clerk stays signed out and protected API
   calls return `401`.
6. **Changing previews:** While A exists, deploy generated host B with the same
   Development keys. Exercise B in the same browser and a clean browser. Verify every
   redirect returns to its initiating host, A and B do not overwrite each other's
   host-scoped `__session` cookie, and deleting A does not make B redirect to A.
7. **Authorized-party positive and negative controls:** Configure the API with B's
   exact public origin and verify B's token succeeds. Present a valid token whose `azp`
   names A or another sibling origin and verify the B deployment rejects it. Record the
   exact scheme, host, and port used in `azp`.
8. **Cookie and URL inspection:** Verify `__session` is scoped to the current generated
   host, observe token refresh, and identify every appearance of `__clerk_db_jwt` during
   sign-in/recovery. Inspect browser history, Traefik access logs, Dokploy logs, and app
   logs for leaked query values; record presence only and redact all values.
9. **Network/security gate:** Confirm the HTTP host is reported as not a secure context
   (`window.isSecureContext === false`). Treat that as a failed acceptance gate for a
   shared hosted topology even if checks 1–8 function. Repeat the flow on the proposed
   HTTPS hostname; only HTTPS can pass the topology gate.
10. **Admission policy:** Verify Google is the only displayed method and an unused
    Google test account can create an account when Clerk sign-up mode is Public, matching
    Unshelf's documented dashboard contract. ([Unshelf Clerk setup](../clerk-setup.md),
    [Clerk Public sign-up mode](https://clerk.com/docs/authentication/allowlist#public))

## Decision input

Proceed with a short prototype if the remaining question is mechanical compatibility,
but do not choose generated cleartext `traefik.me` hosts as the destination topology.
The viable route is generated **HTTPS** preview origins with Development keys, an exact
per-deployment `authorizedParties` value, relative/current-origin redirects, and no
custom Google credentials. Production remains a separate Clerk Production instance on
an owned HTTPS domain with its own keys, DNS, and Google credentials. ([Clerk
Production requirements](https://clerk.com/docs/guides/development/deployment/production))
