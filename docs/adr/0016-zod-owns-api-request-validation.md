# Zod owns API request validation behind an API-only shared boundary

Unshelf uses Zod 4 as the canonical runtime contract for untrusted API request
input. Every Express route declares its body and path-parameter schemas at one
reusable validation boundary before its handler runs; that boundary also accepts
query schemas for future routes. Handlers receive parsed values, including the
existing branded identifier types earned by UUID validation, rather than reading
raw Express input or applying unchecked casts.

The canonical schemas live at `@unshelf/shared/validation`, not the shared
package's main entry point. The API deliberately imports that runtime subpath.
The web application continues to import `@unshelf/shared`, whose entry point
remains type-and-constant-only and does not load Zod into the browser bundle.

Zod was chosen over Joi because the inferred schema output is also the static
request type. Joi would leave runtime schemas and TypeScript request interfaces
as two hand-synchronized contract artifacts, recreating the drift this decision
is intended to remove.

## Public error contract

Schema failures are client-correctable HTTP 400 responses owned by the API:

```json
{
  "error": "invalid_request",
  "issues": [{ "path": "body.title", "message": "Must not be blank" }]
}
```

Paths identify only the public input surface and field. Messages are curated by
the API; raw Zod issues, rejected values, request bodies, and other diagnostics
are never serialized. Malformed JSON uses a separate safe HTTP 400 response
without field issues because no request document could be parsed. Unexpected
errors pass through final application middleware and receive one generic JSON
500 response.

The boundary does not log errors or rejected values. Logging remains a separate
decision; a future logging seam may consume internal errors, but it must preserve
the public redaction and must not log whole request bodies.

## Revision — failure-only production diagnostics (#163)

The production logging decision makes one narrow exception to the final
constraint above: a 4xx, 5xx, or aborted request has one server-side request
snapshot that may include the whole rejected body after recursive
credential-focused redaction. Successful requests still never log request
bodies, and validation events themselves carry only a stable validation code.

This does not change the public error contract: rejected values and diagnostics
remain absent from HTTP responses. The failure snapshot is restricted,
byte-bounded operational evidence that deliberately retains non-secret
User-authored values; access to container logs and exported evidence must
therefore remain restricted as documented in `docs/deploy.md`.

## Contract behavior retained

- Request objects are strict, so undeclared fields are rejected.
- Item titles and Stop, Trail, and Label names are trimmed only at their outer
  boundaries; blank-after-trim values are rejected and internal whitespace is
  preserved.
- Item Source remains optional string-or-null input and strings are stored
  verbatim, including blank strings, non-URL text, and surrounding whitespace.
- Existing Type, Status, real calendar-date, authentication, User-scoping,
  resource-existence, and Trail-DAG behavior remains unchanged.

## Browser reuse is deferred

The explicit validation subpath leaves browser-side schema reuse available, but
the current web application does not import it. Client validation is a separate
UX and bundle-size decision, not a prerequisite for authoritative server
validation. Response validation, OpenAPI generation, and converting response or
domain models into Zod schemas are also outside this decision.

## Consequences

- A new route must declare every request input surface at the common boundary;
  route-local parsers and unchecked request-identifier casts are not acceptable.
- Request types are inferred from the canonical Zod schemas, while response and
  domain types keep the existing shared TypeScript model.
- Replacing or upgrading Zod cannot change the public error shape without an
  explicit API-contract decision.
- No `CONTEXT.md` change is required: Zod and the package boundary are
  implementation choices, while the existing domain vocabulary and behavior
  remain intact.
