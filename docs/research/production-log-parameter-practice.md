# Production logging of request and database values

Researched 2026-07-27 against current primary and official sources.

## Question

Is it an industry standard to put all HTTP query values, bodies, headers, SQL
parameters, and PostgreSQL error details into production server logs so an
operator can diagnose a user's failure from one record?

## Conclusion

No. There is **no universal logging standard** that either requires logging all
of those values or prohibits every one of them. The consistent industry
guidance is:

- production logs must contain enough context to investigate failures;
- raw request bodies, all headers, and SQL parameter values are not generally
  captured by default;
- fields that may contain secrets, authentication material, regulated data, or
  user content are selected deliberately and redacted or otherwise protected;
- identifiers, operation names, route templates, parameterized SQL text,
  error codes, error messages/stacks, and structured database-object fields
  provide the normal first-line diagnostic context;
- more invasive value capture, when justified, is an explicit, access-controlled
  diagnostic mode rather than an accidental consequence of serializing entire
  request or error objects.

It is therefore inaccurate to say that “industry standard” means hiding every
query parameter or database detail. It is equally inaccurate to say that
logging every raw value in production is the standard.

## What the primary sources actually say

### OWASP: sufficient context, not indiscriminate full-content capture

OWASP says each record needs enough information for its intended monitoring and
analysis and that this *could* be full content, but is more likely an extract or
summary. Its suggested event attributes include an interaction identifier,
authenticated user identity, action, object, result, reason, HTTP status, stack
trace, system error message, and debug information. HTTP bodies and response
headers/bodies appear as extended details to **consider**, not as universally
required fields.
([OWASP event attributes](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#event-attributes))

The same guidance says session identifiers, access tokens, passwords, database
connection strings, encryption keys, sensitive personal data, and data above
the logging system's classification should usually be removed, masked,
sanitized, hashed, or encrypted. It also permits adjustable logging detail,
provided the default remains sufficient for business needs and changes are
controlled.
([OWASP data to exclude and customizable logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude))

OWASP is a security best-practice guide, not a mandatory wire or JSON schema.
Its useful model for “how do I know for whom?” is a stable interaction/request
identifier plus an authenticated internal user identifier—not necessarily a
copy of every value that user submitted.

### OpenTelemetry HTTP: query scrubbing and explicit header selection

OpenTelemetry's HTTP semantic conventions require low-cardinality route
templates and say a raw URI path cannot substitute for `http.route`. They say
sensitive path and query content should be scrubbed when identifiable and
name common signed-URL query keys that should be redacted by default.
([HTTP span attribute rules](https://opentelemetry.io/docs/specs/semconv/http/http-spans/))

Request and response header capture is opt-in. Instrumentations should require
explicit configuration of which headers to capture because including all
headers can leak sensitive information. The conventions standardize request
body **size**, not general body-content capture.
([HTTP header capture](https://opentelemetry.io/docs/specs/semconv/http/http-spans/#http-server-span))

These are telemetry semantic conventions rather than a legal prohibition on
application debug logs. They nonetheless directly contradict the claim that
capturing all headers or request values is the default industry convention.

### OpenTelemetry databases: SQL template by default, values opt-in

For database operations, OpenTelemetry recommends collecting parameterized
query text, such as `SELECT ... WHERE id = $1`, because the static text is
diagnostically useful and parameter values are kept separate. Non-parameterized
query text should not be collected by default unless literal values are
sanitized.

`db.query.parameter.<key>` exists, so capturing values is supported, but it is a
**Development, Opt-In** attribute. Useful default structured fields include
database system, namespace/collection, operation, query summary/text, response
status code, and `error.type`.
([OpenTelemetry database client spans](https://opentelemetry.io/docs/specs/semconv/db/database-spans/))

Thus SQL parameters are not forbidden. The applicable current convention makes
them a conscious opt-in rather than default production telemetry.

### Pino and pino-http: useful errors, configurable redaction, body off by default

Pino's standard error serializer records error type, message, stack, and
additional enumerable error properties. That is evidence for keeping useful
raw error diagnostics rather than reducing every error to a class name.
([Pino standard error serializer](https://github.com/pinojs/pino-std-serializers#exportserror))

Pino also has first-class path-based redaction and removal. This permits, for
example, retaining a structured request or database error while censoring known
credential fields.
([Pino `redact` option](https://github.com/pinojs/pino/blob/main/docs/api.md#redact-array--object))

`pino-http`'s standard request serializer includes a URL and headers, and its
serializer hooks allow applications to select other fields. However,
**request-body logging is disabled by default specifically because persisted
bodies can contain passwords and privacy-regulated data**; its documentation
says that an application enabling bodies should use redaction.
([pino-http serializers and request-body logging](https://github.com/pinojs/pino-http#logging-request-body))

Pino describes library defaults and capabilities, not an industry-wide schema.
Its own choices show the distinction: messages and stacks are useful defaults;
full request bodies are not.

### PostgreSQL: rich structured diagnostic fields exist

PostgreSQL supplies stable five-character SQLSTATE codes and recommends that
applications use codes rather than parsing localized message text. It also
supplies table, column, datatype, constraint, and schema names as separate
fields for supported errors.
([PostgreSQL error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html))

PostgreSQL error reports can also contain primary message, detail, hint,
statement position, internal query/context, and source location. These are
genuinely valuable diagnostics; they are not all equivalent to SQL bind
parameters. Some `detail` or internal-query text can contain row/user values,
however, so copying the entire driver error object adopts whatever disclosure
behavior PostgreSQL or the driver happens to have now and later.
([PostgreSQL diagnostic fields](https://www.postgresql.org/docs/current/libpq-exec.html#LIBPQ-PQRESULTERRORFIELD))

PostgreSQL's own production knobs make the distinction especially clear.
Failing SQL statements are logged at `ERROR` severity by default, while
`log_parameter_max_length_on_error` defaults to `0`, which omits bind
parameters from error messages; operators may choose a byte limit or `-1` for
full values. PostgreSQL warns that logged statements can disclose sensitive
data and even plaintext passwords.
([PostgreSQL error-reporting and logging settings](https://www.postgresql.org/docs/current/runtime-config-logging.html))

This supports retaining error message, stack, SQLSTATE, detail/hint, object
names, position, and parameterized query text where useful. It also proves that
raw parameter capture is a supported operational choice—but an opt-in one, not
the database's default or an industry requirement.

### Major cloud guidance: logs are another sensitive data store

AWS says logs should be useful and actionable but not excessive. It recommends
removing, masking, sanitizing, hashing, or encrypting access tokens, passwords,
database connection strings, keys, sensitive PII, and data the log system is
not authorized to hold. It notes that logs often flow to third-party monitoring
systems whose viewers may not be authorized to see the application's source
data.
([AWS logging best practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/logging-monitoring-for-application-owners/logging-best-practices.html))

Google Cloud treats logs that contain user data as sensitive: its audit-log
guidance recommends IAM, log views, and field-level access controls and gives
external-user PII as an example of a field to hide from most log viewers.
([Google Cloud audit-log access controls](https://cloud.google.com/logging/docs/audit/best-practices#control-access))

These are provider recommendations, not universal mandates, but they reflect a
common operational fact: a production log is a retained, searchable copy of
whatever values it receives and needs its own access, retention, and disclosure
policy.

## Practical diagnostic boundary for Unshelf

The evidence supports a more diagnostic contract than “error type only,” while
stopping short of serializing everything:

1. Always record `requestId`, authenticated internal `userId` when known,
   registered route template, operation/event name, status, and duration.
2. For exceptions, retain type, message, stack, cause chain, and stable code.
3. For PostgreSQL failures, retain SQLSTATE, severity, message, detail, hint,
   schema, table, column, datatype, constraint, position, and the parameterized
   SQL template/query name when available.
4. Never record authentication headers/cookies, passwords, tokens, encryption
   keys, or database connection credentials.
5. Treat HTTP bodies/query values and SQL bind values as an explicit policy
   decision. Stable Unshelf resource IDs materially improve correlation and are
   strong candidates for normal production logs.
6. If a case truly requires raw values, enable a bounded diagnostic mode:
   target it by request/user/operation, limit its duration and retention,
   restrict log access, audit its use, and keep credential redaction active.

This retains the information normally needed to answer “which user, request,
operation, query, and database object failed, and why?” It also avoids making
every production request a permanent duplicate of all user content.

If Unshelf deliberately prefers maximum single-record diagnosis, a defensible
alternative is to include raw business query/body/SQL parameter values **on
error records**, while maintaining a narrow non-negotiable redaction list for
authorization/cookie/session values, passwords, API keys, connection-string
credentials, and any legally regulated data the product may hold. In that
model, the logs must be classified as containing user content and given
appropriately restricted access and short retention/rotation. That is a local
risk-managed diagnostic policy—not an “industry standard”—but the sources do
not forbid it.
