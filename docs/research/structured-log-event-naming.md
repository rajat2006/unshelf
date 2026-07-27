# Structured-log event naming

Research date: 2026-07-27

## Question

Are names such as `api.request.completed`, `api.auth.failed`, and
`migration.completed` application-level event names? Is dot-separated naming
standard, or should the names use underscores?

## Conclusion

**They are application-defined event names, not names standardized by Pino,
Express, OpenTelemetry, or Elastic Common Schema. There is no universal
structured-logging delimiter standard.**

If Unshelf wants its event identifiers to follow OpenTelemetry's naming
conventions, lowercase dotted namespaces are the documented choice.
Underscores are used only to join words within one semantic component; dot and
underscore are not interchangeable. For example:

```text
unshelf.api.request.completed
unshelf.api.validation.failed
unshelf.migration.completed
```

The `unshelf.` prefix is preferable to a generic `api.` prefix unless the
project already has another reliable way to prevent application-name
collisions. This follows OpenTelemetry's application-developer guidance, but
the resulting catalog remains Unshelf's contract rather than an OpenTelemetry
standard catalog.

## What each source actually standardizes

### OpenTelemetry

OpenTelemetry's stable Logs Data Model defines `EventName` as the name that
identifies the class or type of an event. It should uniquely identify the
event's structure, including its attributes and body.[^otel-data-model] That is
the role the proposed names are intended to serve.

OpenTelemetry's stable general naming guidance explicitly applies to event
names as well as attribute and metric names. It says names should:

- be lowercase;
- use dots to delimit namespaces;
- use underscores between words inside a multi-word dot-delimited component;
  and
- use an underscore without a dot only when namespacing would be semantically
  wrong, such as `rate_limiting` rather than `rate.limiting`.[^otel-naming]

The event-specific semantic-convention guidance adds that event names must not
contain dynamic values and should be fully qualified and domain-specific when
tied to a particular operation or system; its example is
`http.client.request.exception`.[^otel-events]

For application-specific names, OpenTelemetry says to consult existing
semantic conventions first. If no suitable standard name exists, an internal
application name should be prefixed with a reasonably unique application name
unless an existing company process already prevents collisions. It also warns
applications not to appropriate an existing OpenTelemetry namespace.[^otel-app]

This distinguishes two things:

- `EventName` is a standardized OpenTelemetry log-record field; in formats
  that cannot represent it natively, `otel.event.name` is the standardized
  fallback attribute key.[^otel-event-attribute]
- A value such as `unshelf.api.request.completed` is application-defined unless
  an OpenTelemetry semantic convention defines that exact event.

OpenTelemetry therefore provides the strongest directly applicable answer:
use dots for semantic namespaces and underscores only within a multi-word
component. It does not turn Unshelf's event catalog into a standard catalog.

### Pino and Express

Pino does not define a structured-log event-name field or a delimiter
convention. Its `name` option names the logger, not the event. Pino accepts
arbitrary structured bindings and log objects.[^pino-api] `pino-http` allows
applications to replace or augment its structured request objects; its own
example adds custom `category` and `eventCode` fields with application-chosen
values.[^pino-http]

Express recommends Pino for production application-activity logging but does
not prescribe event identifiers or naming syntax.[^express]

Consequently, a Pino property named `event` and all values in it are an
Unshelf-owned schema unless the implementation deliberately maps them to
another standard such as OpenTelemetry.

### Elastic Common Schema

ECS standardizes field names and several normalized event classifications. It
uses dots to nest field sets and underscores for multiple words within one
field name.[^ecs-guidelines] For example, it defines `event.kind`,
`event.category`, `event.type`, and `event.outcome`, whose values come from
controlled lists.[^ecs-event]

ECS's more specific `event.action` value is normally implementer-defined, and
its official examples use hyphens: `group-add`, `process-started`, and
`file-created`.[^ecs-event] ECS therefore does not establish dotted names as a
universal convention for application-defined event identifier *values*. Its
dotted field keys and their standardized values should not be confused with an
OpenTelemetry-style `EventName`.

### CloudEvents

CloudEvents is relevant only if these records are also modeled as CloudEvents,
not merely because both concepts use the word “event.” CloudEvents
standardizes a `type` attribute, but explicitly leaves its value's format to
the producer. It requires a non-empty string, recommends a reverse-DNS prefix,
and gives dotted examples such as `com.github.pull_request.opened` and
`com.example.object.deleted.v2`.[^cloudevents]

If Unshelf were emitting actual CloudEvents, an appropriate form would be
something like:

```text
io.github.rajat2006.unshelf.api.request.completed
```

CloudEvents does not otherwise mandate dot versus underscore inside the
producer-defined remainder. Its restrictive naming rules for context
attribute *keys* are separate from the producer-defined `type` value.

### Node.js diagnostics channels

Node's diagnostics-channel API is a different mechanism from structured log
event names. It recommends including the module name in channel names to avoid
collisions, but does not prescribe dot or underscore syntax for ordinary
channels.[^node-diagnostics]

## Recommendation for Unshelf

1. Treat this as an application-owned, stable event catalog.
2. Use a dedicated low-cardinality event-name field and never put request IDs,
   routes, user IDs, or other dynamic values into the name.
3. Follow OpenTelemetry syntax: lowercase, dots for namespace boundaries, and
   underscores only inside a genuinely multi-word component.
4. Prefix the catalog with `unshelf.` unless the logging system itself already
   supplies an unambiguous application namespace and the team deliberately
   chooses not to repeat it.
5. Document separately whether the emitted Pino key is a local `event` field,
   an OpenTelemetry `EventName`, or an ECS mapping. The same string can be
   mapped between systems, but the surrounding fields have different
   standards and semantics.

Thus the earlier names have the right general shape but should be described as
**OpenTelemetry-conformant application event names**, not “standard event
names.” The safer catalog shape is `unshelf.api.*` and
`unshelf.migration.*`.

## Sources

[^otel-data-model]: OpenTelemetry, [Logs Data Model — `EventName`](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-eventname).
[^otel-naming]: OpenTelemetry Semantic Conventions, [General naming considerations](https://opentelemetry.io/docs/specs/semconv/general/naming/#general-naming-considerations).
[^otel-events]: OpenTelemetry Semantic Conventions, [Events — Event name](https://opentelemetry.io/docs/specs/semconv/general/events/#event-name). The event-specific page is currently marked Development; the general naming rules it references are Stable.
[^otel-app]: OpenTelemetry Semantic Conventions, [Recommendations for application developers](https://opentelemetry.io/docs/specs/semconv/general/naming/#recommendations-for-application-developers).
[^otel-event-attribute]: OpenTelemetry Semantic Conventions, [`otel.event.name`](https://opentelemetry.io/docs/specs/semconv/registry/attributes/otel/#otel-event-attributes).
[^pino-api]: Pino project, [Pino API](https://github.com/pinojs/pino/blob/main/docs/api.md), especially the `name`, `bindings`, `formatters.log`, and child-logger documentation.
[^pino-http]: Pino project, [`pino-http` structured object hooks](https://github.com/pinojs/pino-http#structured-object-hooks).
[^express]: Express, [Production best practices — Do logging correctly](https://expressjs.com/en/advanced/best-practice-performance/#do-logging-correctly).
[^ecs-guidelines]: Elastic, [ECS guidelines for field names](https://www.elastic.co/guide/en/ecs/current/ecs-guidelines.html#_guidelines_for_field_names).
[^ecs-event]: Elastic, [ECS event fields](https://www.elastic.co/docs/reference/ecs/ecs-event).
[^cloudevents]: CNCF CloudEvents, [CloudEvents specification — `type`](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#type) and [attribute naming conventions](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md#naming-conventions).
[^node-diagnostics]: Node.js, [Diagnostics Channel](https://nodejs.org/api/diagnostics_channel.html), especially the recommendation to include the module name in channel names.
