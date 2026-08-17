# Source inspection is a stateless service behind a guarded public-network boundary

Source inspection runs as a standalone, authenticated, stateless API feature
whose only job is to return ephemeral title and Type suggestions. It is isolated
from both the Item-create write path and recurring Discovery's Provider,
Candidate, projection, and maintenance machinery. We chose this boundary because
a User-controlled outbound request is a materially different trust domain from
an Item insert, while one-shot Capture assistance has none of recurring
Discovery's identity, persistence, refresh, or retention semantics.

## Application boundary

The web application calls authenticated `POST /api/source-inspections` with a
strict body containing only the exact `source` string. Authentication uses the
existing application-auth boundary; Express validation uses `validateRequest`
and the shared API-only Zod subpath. The route contains no business logic: it
calls the feature's service, and that service has its required colocated tests.

The public response is either a suggested result with independent optional title
and Type fields plus bounded evidence enums, or one generic unavailable result.
Full and partial success derive from which fields exist. Expected refusal,
unsupported, safety, capacity, origin, limit, and timeout outcomes all map to
unavailable rather than escaping through the unexpected-error boundary. Only
authentication and malformed request documents retain their ordinary 401 and
400 behavior. Responses use `Cache-Control: no-store`.

The service accepts an object containing the exact Source and caller
`AbortSignal`, and returns the repository-standard tagged service result. It
orchestrates injected URL classification, inspection adapters, guarded
transport, clock/deadline, and admission controls. Multi-string functions use
object parameters and no boundary uses `any`. The composition root supplies
production dependencies; API and service tests supply controlled substitutes.

Inspection never receives a database connection, creates no row, and calls no
Item repository or service. `POST /api/items` remains the only Capture write and
continues to validate and store the confirmed title, Type, and Source exactly as
before. Inspection evidence, redirects, fetched values, and failure details can
never enter that request contract.

`Provider` remains recurring-discovery language. Source inspection uses
inspection adapters and may reuse only generic infrastructure patterns such as
dependency injection, cancellation, logging contracts, and concurrency helpers.
It does not reuse the persistence-oriented Discover module, schemas, adapters,
quota leases, retries, or maintenance jobs. A low-level transport may be shared
later only if both callers genuinely adopt the same trust and limit contract.

## Acquisition routing

Classification operates on a parsed working copy and never rewrites the durable
Source. A supported YouTube hostname is routed before generic HTML; unsupported
or ambiguous YouTube routes never fall through to webpage extraction.
Supported first-slice hosts are `youtube.com`, `www.youtube.com`,
`m.youtube.com`, and `youtu.be`; other YouTube properties such as
`music.youtube.com` remain manual fallback. Resource IDs are parsed and checked
conservatively rather than accepted as arbitrary path or query text.

The first YouTube route matrix is deliberately narrow:

- an unambiguous `watch`, `youtu.be`, `shorts`, or video `embed` shape suggests
  Type _video_;
- an unambiguous `playlist` or playlist `embed` shape suggests Type _playlist_;
- a direct `/post/<id>` shape suggests Type _other_ without any network call;
- a Source carrying both video and playlist identity, a channel or Posts tab,
  and every other YouTube route remain manual fallback.

For a recognized video or playlist, the adapter reconstructs a canonical URL
from the validated resource ID and sends only that canonical value to YouTube's
fixed-origin oEmbed endpoint. Share parameters and the original Source are not
forwarded. The Type comes from the local route shape, never oEmbed's media type.
An oEmbed title is optional: failure or timeout leaves the URL-derived Type as a
successful partial result, with manual title and no Retry. There is no generic
YouTube page fallback or hidden retry.

This oEmbed path is an explicit product-policy risk. The
[Source-inspection research](https://github.com/rajat2006/unshelf/blob/84511a9b1c7d8b1f577574ae8bdf85444a13c0c5/docs/research/fast-source-inspection-youtube-public-web.md)
found fast title responses but no adequate current first-party YouTube retention
contract for copying an oEmbed title into an indefinitely retained Item. The
product accepts that uncertainty rather than claiming compliance. It does not
use the YouTube Data API because confirmed API-prefilled titles remain
conservatively subject to refresh or deletion, which conflicts with ADR-0020's
no-projection contract and the
[retention finding](https://github.com/rajat2006/unshelf/blob/29de2dd1a0bb4f6b337ce345505a947064d6cf10/docs/research/youtube-kept-item-metadata-retention.md).
It does not scrape YouTube pages; Community Posts therefore stay Type-only. A
runtime oEmbed kill switch can disable YouTube title acquisition while retaining
safe local classification and manual Capture.

Every other eligible Source uses one generic server-side `GET`: no preliminary
`HEAD`, automatic retry, browser execution, subresource loading, cookie, or
authenticated-page access. It sends a truthful Unshelf User-Agent with contact
information, a stable HTML `Accept`, and a fixed English `Accept-Language` until
Unshelf owns an explicit User language preference. It accepts only an HTTP 200
HTML or XHTML representation and treats access-control, throttling, anti-bot,
origin, and every other response as unavailable. A runtime exact-host deny list
provides an operational policy kill switch. A separate robots request is not
made: one User-directed fetch is not link traversal, and robots policy is not
access authorization.

## Guarded public-network transport

The generic adapter cannot call global `fetch` directly. All arbitrary-host
traffic passes through one injected transport which enforces the whole SSRF
boundary before a socket opens:

- accept only absolute `http:` and `https:` URLs with no embedded credentials;
- accept only public DNS hostnames on the default protocol port; reject IP
  literals, single-label names, alternate address forms, and malformed hosts;
- normalize a working hostname through the platform URL parser while preserving
  the exact original Source outside transport;
- omit fragments, preserve query strings, and treat the complete working URL as
  sensitive data;
- resolve and inspect every CNAME, A, and AAAA result; reject the hostname when
  any answer is loopback, private, link-local, shared, multicast,
  documentation, benchmark, or otherwise non-public, including IPv4-mapped
  IPv6;
- pin one validated public address to the actual connection while preserving the
  correct Host header and TLS SNI, so validation cannot be bypassed by DNS
  rebinding;
- follow redirects manually, repeat the entire validation for every target, and
  reject HTTPS-to-HTTP downgrades;
- send no User cookies, Clerk token, Authorization, Referer, browser headers, or
  internal headers, and use no proxy with private-network access.

Query strings are eligible because Unshelf cannot reliably distinguish ordinary
parameters from signed access tokens. That is why the complete Source is handled
as a secret for diagnostics even though the request uses no additional
credentials. This mechanical rule may inspect a bearer-like signed URL supplied
by the User; pages which still require cookies, headers, login, or browser state
remain unsupported.

## Resource and admission limits

One end-to-end server deadline of 2.5 seconds covers admission, DNS, connection,
TLS, redirects, headers, transfer, decompression, decoding, parsing, and result
serialization inside the browser's hard three-second attempt. Initial phase
ceilings are 300 ms for DNS, 500 ms for connection, and 1.5 seconds for response
headers; none resets or extends the total deadline. The browser also owns its
three-second abort, so a lost server response cannot keep the form inspecting.

One attempt follows at most five redirects and accepts at most 32 KiB of response
headers, 512 KiB transferred, and 256 KiB of decompressed generic HTML. The fixed
YouTube oEmbed response is capped at 64 KiB of JSON. Identity, gzip, deflate, and
Brotli are the only accepted content encodings; the decompressed ceiling, not
Content-Length, is authoritative. Generic parsing stops at complete `</head>`,
the decompressed ceiling, cancellation, or the deadline, whichever comes first.

JSON-LD is limited to 16 blocks, 64 KiB in aggregate, 16 levels of nesting, and
2,000 visited nodes. Each returned suggestion is at most 512 Unicode code points
after outer and repeated whitespace normalization. Type remains one of Unshelf's
existing enum values.

The initial single-process admission gate allows two active attempts per User,
two per destination hostname, and sixteen for the API process. A per-User token
bucket refills at twenty starts per minute with capacity five. Saturation returns
unavailable immediately; it does not queue work inside the three-second budget.
These are code-owned safe defaults and may be tuned against the release corpus
only while the same bounded behavior remains. They are replica-local in the
current one-process deployment; a future multi-replica or abuse profile must earn
a distributed gate rather than silently pretending these counters are global.

## Inert metadata extraction

Generic HTML is decoded with declared, BOM, and bounded HTML-encoding rules and
fed to an inert streaming parser. It executes no script, constructs no browsing
environment, loads no entity or subresource, and never dereferences JSON-LD
contexts, imports, link headers, or embedded URLs. JSON-LD parsing is bounded
local JSON parsing only. Extracted values are plain untrusted text; the web
renders them through React's normal text boundary rather than publisher markup.

The evidence and conflict rules remain ADR-0020's contract: title preference is
one primary recognized Schema.org entity, then Open Graph, then document title;
Type requires strong agreeing primary Schema.org, narrow Open Graph, or supported
YouTube route evidence. Missing or conflicting Type stays unresolved. Evidence
enums explain a winning field to tests and the web state machine but are never
persisted or shown as a durable provenance claim.

## Cancellation, privacy, and observability

The Capture composer owns an `AbortController` and a monotonically increasing
Source revision. Source change, Retry, Add to Library, Capture close, and unmount
abort the current transport and invalidate its revision. The API propagates
client disconnect to the service and origin request. Cancellation is an
optimization, not the correctness gate: only the latest revision may apply a
result, so a late response can never overwrite current or User-owned fields.

Source inspection is a sensitive request class. Existing failure snapshots must
omit its body and query for every 4xx, 5xx, and aborted termination. Logs, metrics,
and traces never contain the Source, hostname, query parameters, redirect
locations, fetched headers or markup, extracted values, resolved addresses, or a
reversible host fingerprint. Public responses likewise reveal no safety or
origin detail.

One bounded completion event may contain request ID, User ID under the existing
restricted logging policy, strategy (`youtube` or `generic`), suggested-field
presence, internal terminal code, duration, redirect-count bucket, and byte-count
bucket. Stable internal codes distinguish unsupported, unsafe, refused, timeout,
limit, overload, origin, no-metadata, and cancellation behavior without recording
the inspected value. This route-specific privacy rule narrows ADR-0016's general
failure-snapshot exception because a Source may itself carry a credential.

## Controlled, repeatable verification

Production uses real DNS and internet responses, but automated tests never do.
The resolver, connection transport, clock/deadline, admission gate, and
inspection adapters are injectable so tests can supply fixed answers and streams.
Pure fixture tests own YouTube route classification, metadata precedence and
conflict, encodings, malformed and oversized JSON-LD, and hostile markup. Network
boundary tests own mixed public/private DNS results, CNAMEs, IPv4-mapped IPv6,
pinned connection addresses, DNS rebinding, redirects to private addresses,
HTTPS downgrade, unexpected content type or encoding, compressed overflow,
timeout, cancellation, and limiter release.

API integration tests use the existing authenticated harness with a fake service
to prove strict validation, tenancy, public response mapping, no-store headers,
sensitive-request logging, and zero Item or metadata writes. Web tests use fake
timers and deferred promises to prove debounce, Add-during-inspection, retry,
User-owned fields, cancellation, close/reopen, and stale-result rejection. Live
third-party URLs never run in CI; the private versioned real-capture corpus is a
separate release evaluation owned by the implementation handoff.

## Consequences

Source inspection adds outbound-network and parsing infrastructure but no schema,
migration, projection, maintenance job, or durable Provider relationship. Manual
and offline Capture remain the fallback for every safety, policy, extraction, and
capacity refusal. The independent service and guarded transport make the risky
surface reviewable and testable without weakening the simple Item write path.

No `CONTEXT.md` change is required. The existing Source inspection definition
already captures the domain boundary; services, adapters, oEmbed, SSRF controls,
limits, logging, and test seams are implementation decisions.
