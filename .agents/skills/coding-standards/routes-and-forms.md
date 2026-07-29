# Routes and forms

## Middleware placement

Create application-wide Express middleware and middleware factories inside
`apps/api/src/middleware/`. Keep feature routers inside their feature folders.

## Service boundary

Do not put business logic directly in Express router handlers; call into the feature's service module.

## Request-validation boundary

Use `validateRequest` for Express request validation.

Validate route parameters with `validateRequest`.

Validate JSON request bodies with `validateRequest`.

## Authentication boundary

Access authentication through Unshelf's application-auth helpers on the web and `req.user` on the API; import Clerk only in the auth adapters.

Redirect signed-out web navigation to `/sign-in`; return HTTP 401 for unauthenticated API requests.
