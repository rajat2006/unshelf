# HTTP request terminal event model

Researched 2026-07-27 against current primary sources.

## Question

Is there an industry-standard structured-logging model for normal and prematurely
terminated HTTP requests: one shared terminal event with an outcome field, or
separate completed and aborted event names?

## Conclusion

There is **no industry standard that prescribes either**
`request.completed`/`request.aborted` or one `request.ended` event with
`outcome: completed | aborted`.

The stronger standards-aligned design is nevertheless **one terminal record for
one kind of operation**, with attributes describing how it ended:

- event name: `unshelf.api.request.ended`
- application lifecycle attribute: `termination: "completed" | "aborted"`
- `error.type`: a documented low-cardinality value such as
  `client_disconnect` when premature termination is considered an error
- response status only when a response status was actually sent

If Unshelf later adopts Elastic Common Schema, `event.outcome` must remain a
separate field with ECS's values `success`, `failure`, or `unknown`; it must not
contain `completed` or `aborted`. In other words, `completed`/`aborted` describes
**termination mode**, not necessarily business or HTTP success.

## Evidence

### OpenTelemetry: one operation, attributes distinguish its result

OpenTelemetry's HTTP conventions model an HTTP server request as one operation.
The stable `http.server.request.duration` metric represents all HTTP server
requests and conditionally adds `error.type` when a request ends with an error;
`http.response.status_code` is present only if a status was sent. It does not
define separate success and failure instruments.
([HTTP metrics](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/#metric-httpserverrequestduration))

The general error guidance makes the principle explicit for operation metrics:
report one metric containing successes and failures, rather than separate
metrics based on status, and distinguish errors with `error.type`.
([Recording errors](https://opentelemetry.io/docs/specs/semconv/general/recording-errors/#recording-errors-on-metrics))

The HTTP span convention similarly uses one server-request span shape. An
incomplete send/receive caused by an error should set error status and
`error.type`; successful requests omit `error.type`. The exception is an
intentional caller-side cancellation detected by **client** instrumentation,
which should not be treated as an error.
([HTTP span status](https://opentelemetry.io/docs/specs/semconv/http/http-spans/#status))

This is not a direct logging prescription. OpenTelemetry says operations with a
duration and meaningful boundary should primarily be spans, not events. If an
application also emits a terminal log event, the event rule says a shared name
is valid only when the same definition applies to every occurrence, and an
event covering success or failure should include `error.type`.
([Event modeling and names](https://opentelemetry.io/docs/specs/semconv/general/events/))

Therefore, a precisely defined "`request.ended` is emitted once whenever server
handling terminates" event can legitimately share one name across normal and
premature termination. OpenTelemetry does **not** standardize that event name
or an `outcome` value set for it.

### Node.js: detect distinct termination paths, then normalize them

For `http.ServerResponse`, Node.js emits:

- `finish` when the last response bytes have been handed to the operating
  system; this does not prove the client received them.
- `close` when the response completed **or** its connection terminated
  prematurely.

Node also exposes `response.writableFinished`, which becomes true immediately
before `finish`. These primitives let the application classify a `close` before
`writableFinished` as premature termination while still emitting exactly one
terminal record.
([Node.js `http.ServerResponse`](https://nodejs.org/api/http.html#class-httpserverresponse))

The labels `finish` and `close` are runtime lifecycle signals, not a structured
logging event-name standard.

### pino-http: no standardized event-name or abort outcome schema

`pino-http` documents automatic `"request completed"` and `"request errored"`
logs and exposes separate custom success/error message and object callbacks. It
does not define an OpenTelemetry-style event-name field or a standard
completed/aborted outcome attribute.
([pino-http API](https://github.com/pinojs/pino-http#pinohttpopts-stream))

Its current implementation attaches the same completion callback to response
`close`, `finish`, and `error`, removes all three listeners on the first signal,
then chooses its success/error log shape from an error object, `res.err`, or a
5xx status. Within the success-shaped path, its default human message is
`"request completed"` only when the request was not read-aborted and the
response ended; otherwise it is `"request aborted"`. This establishes the useful
invariant of one terminal log path with a classified message, but neither the
message nor a machine-readable abort field is a standard schema.
([pino-http 11.0.0 `logger.js`](https://github.com/pinojs/pino-http/blob/v11.0.0/logger.js))

### ECS: outcome is an attribute, but its vocabulary differs

Elastic Common Schema defines `event.outcome` as the producer's perspective on
success or failure, with exactly three allowed values: `success`, `failure`, and
`unknown`. ECS also says that a compound event should use the value best
capturing its overall result.
([ECS `event.outcome`](https://www.elastic.co/docs/reference/ecs/ecs-allowed-values-event-outcome))

ECS therefore supports the general pattern of a shared event classification
plus a result attribute, but it does not make `aborted` an outcome value and
does not prescribe a request terminal event name.

## Recommendation for Unshelf

Accept the **single terminal-event design**, but describe it accurately:

```json
{
  "event": "unshelf.api.request.ended",
  "termination": "completed",
  "http.response.status_code": 200
}
```

```json
{
  "event": "unshelf.api.request.ended",
  "termination": "aborted",
  "error.type": "client_disconnect"
}
```

This is an application convention aligned with OpenTelemetry's operation model,
not an industry-standard event name or value vocabulary. It gives consumers one
stable query for request terminal records, preserves exactly-once accounting,
and keeps the distinction between transport termination and semantic success.
