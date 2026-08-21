# Minimum acquisition seam for YouTube oEmbed titles

Research memo for [Verify the minimum viable YouTube oEmbed acquisition
seam](https://github.com/rajat2006/unshelf/issues/508), within
[Wayfinder: reduce Source inspection to YouTube-only
assistance](https://github.com/rajat2006/unshelf/issues/507).

Researched: 2026-08-21

## Executive answer

**A browser can currently read YouTube's fixed-origin oEmbed response directly.**
An authenticated Unshelf server route is not mechanically required for CORS,
URL safety, response decoding, cancellation, or a bounded title lookup. A
redacted Chromium observation from a non-YouTube HTTPS origin completed as a
readable CORS response, and the endpoint echoed the request origin in
`Access-Control-Allow-Origin`. A controlled request using `credentials: "omit"`,
`redirect: "error"`, `referrerPolicy: "no-referrer"`, and `cache: "no-store"`
made one `GET` with no preflight and returned parseable JSON.

The smallest technical seam is therefore:

1. classify an eligible YouTube Source locally and derive _video_ or _playlist_;
2. reconstruct a canonical YouTube resource URL from the validated identifier;
3. issue one credentialless browser `GET` to the constant HTTPS oEmbed endpoint;
4. refuse redirects, abort on replacement or one deadline, stream no more than a
   small decoded-byte ceiling, require a successful JSON representation, and
   accept only a bounded nonblank title string;
5. treat every failure as title unavailable while retaining the locally derived
   Type and ordinary manual Capture.

This removes the authenticated Source-inspection route, arbitrary-host transport,
DNS resolver and pinning, redirect validation, decompression implementation,
admission gate, server-sensitive-request handling, and generic metadata parser.
It does **not** make oEmbed a documented YouTube platform contract.

Two qualifications remain:

- CORS support is observed behavior, not a published YouTube compatibility
  promise. A server adapter would insulate Unshelf from a future CORS-header
  change and some browser blockers, but not from endpoint removal or policy
  changes. Because title is optional and manual fallback is settled behavior,
  CORS loss need not break Capture.
- Browser-direct acquisition exposes the User's network address and Unshelf
  origin to YouTube. A fixed-origin server adapter would hide that client network
  context and centralize a runtime kill switch. That is a product/privacy tradeoff,
  not an SSRF or authentication requirement.

Under this map's deliberate simplicity and fail-soft contract, **browser-direct
is the recommended minimum**. If the architecture decision rejects client-side
third-party contact, retain a small fixed-origin server adapter instead; do not
restore the arbitrary-public-network machinery.

The current policy caveat is stronger than a mere retention ambiguity. The
[YouTube Developer Policies prohibit undocumented APIs without express
permission](https://developers.google.com/youtube/terms/developer-policies#d.-accessing-youtube-api-services),
while the oEmbed protocol and provider registry advertise YouTube's endpoint but
no current first-party YouTube documentation, permission, or title-retention rule
was found. Browser versus server does not change that. Retaining title suggestions
must remain an explicitly accepted, kill-switch-controlled product-policy risk,
not a claim of compliance; Type-only remains the clean fallback.

## Scope and prior decisions

This memo narrows, rather than repeats, the pinned
[general Source-inspection research](https://github.com/rajat2006/unshelf/blob/84511a9b1c7d8b1f577574ae8bdf85444a13c0c5/docs/research/fast-source-inspection-youtube-public-web.md).
The current map has already excluded generic pages, mixed video-and-playlist
Sources, channels, handles, search, embeds, Community Posts, and unsupported
YouTube routes. It has also settled that:

- Type is a conservative local inference from the User's Source;
- title is optional and comes only from fixed-origin oEmbed;
- Source is stored exactly as supplied, while the oEmbed request receives a
  reconstructed canonical resource URL;
- title failure retains Type, shows quiet manual fallback, and creates no Retry;
- the User may edit every suggestion and explicitly chooses Add to Library; and
- live YouTube calls never run in CI.

The question here is only what acquisition boundary and controls that reduced
behavior actually needs.

## Documented protocol facts

The [oEmbed protocol](https://oembed.com/#section2) defines a consumer-to-provider
`GET` whose required `url` and optional `format` values are URL-encoded query
parameters. Asking for JSON requires well-formed UTF-8 JSON with
`application/json`; `version` and representation `type` are required, while
`title` is optional. The protocol defines `404` when the provider has no response
for the resource, `501` for an unsupported format, and `401` for a private
resource. It also warns that returned embed HTML is an XSS surface. Unshelf needs
none of that HTML and must never parse or render it.

The protocol's [provider
registry](https://oembed.com/providers.json) currently lists YouTube's HTTPS
oEmbed endpoint and schemes for watch pages, short links, playlists, Shorts,
embeds, and live pages. The protocol also includes a YouTube watch-resource
example. This is primary oEmbed protocol material, but the registry is maintained
through community contributions; it is not a substitute for first-party YouTube
policy documentation.

YouTube's first-party [embedded-player
documentation](https://developers.google.com/youtube/player_parameters#select_content_to_play)
documents a video identifier in the embed path and a playlist identifier in the
`list` parameter. It does not document the oEmbed endpoint or promise an
identifier grammar. The Source classifier should therefore keep its separately
settled conservative route and identifier rules rather than expanding support
from the broader provider-registry wildcards.

For acquisition, reconstruct only these working URLs after classification:

| Local classification | Canonical oEmbed `url` input | Why |
| --- | --- | --- |
| supported video, short link, or Shorts Source | HTTPS YouTube watch URL containing only the validated video identifier | The oEmbed protocol's YouTube example and registry cover the watch shape. Original host aliases, paths, fragments, and share parameters are not forwarded. |
| supported playlist Source | HTTPS YouTube playlist URL containing only the validated playlist identifier | The provider registry covers the playlist shape, and the live endpoint accepted it. Other query parameters are not forwarded. |

Use the platform [`URL` and `URLSearchParams`
algorithms](https://url.spec.whatwg.org/#urlsearchparams) to construct both URLs.
Do not concatenate an original Source into the endpoint query.

The oEmbed response `type` is not an Unshelf Type signal. The protocol defines it
as the kind of embeddable representation. Direct observations returned the same
representation type for the tested video and playlist, while the Source route
unambiguously supplied the distinct Unshelf Types.

## Direct observations

These observations were made from one development network on 2026-08-21. The
test used one public video and one public playlist already used by the prior
research. Their Sources, identifiers, returned titles, and raw bodies were not
recorded in this artifact.

### HTTP and CORS

- Direct `GET`s for both resource classes returned HTTP 200 without a redirect.
- Both successful responses declared `application/json` and gzip content
  encoding. The browser supplied decoded response bytes to JavaScript.
- With a synthetic HTTPS `Origin`, both successful responses echoed that origin
  through `Access-Control-Allow-Origin` and included `Origin` in `Vary`. A redacted
  invalid resource returned a CORS-readable 404.
- An OPTIONS probe returned an ok response permitting `GET`, but the proposed
  browser request does not require it. In Chromium, the complete controlled
  request produced exactly one `GET` and no preflight.
- A real page-origin check in headless Chromium 149 returned a script-readable
  response whose Fetch response type was `cors`. It succeeded with omitted
  credentials, no referrer, disabled cache use, redirect refusal, and streamed
  decoding.

This matches the [Fetch Standard's CORS
model](https://fetch.spec.whatwg.org/#http-responses): a matching
`Access-Control-Allow-Origin` makes a credentialless response shareable with the
calling origin. The standard also defines `Accept` as CORS-safelisted, so this
ordinary `GET` needs no custom request header or preflight.

### Size, encoding, and timing

Three controlled browser observations per resource class all completed with a
title under a 2.5-second abort and a 16 KiB decoded-body guard:

| Class | Successful observations | Elapsed range | Decoded-body size |
| --- | ---: | ---: | ---: |
| video | 3/3 | 66–123 ms | 862 bytes |
| playlist | 3/3 | 52–95 ms | 753 bytes |

These measurements show feasibility, not a service-level objective. They do not
sample geography, rate limiting, uncommon title sizes, blockers, or service
changes.

The successful browser response exposed a compressed `Content-Length` smaller
than the decoded body. The [Fetch Standard processes content codings before
placing decoded bytes in the response body
stream](https://fetch.spec.whatwg.org/#concept-http-network-or-cache-fetch) and
notes that this makes `Content-Length` unreliable for the decoded size. The
guard must therefore count chunks from `response.body`; it must not trust
`Content-Length` or call `response.json()` before applying the ceiling. Fetch
bodies are specified as
[`ReadableStream`s](https://fetch.spec.whatwg.org/#concept-body), so this needs no
custom gzip, deflate, or Brotli implementation in browser code.

## Minimum browser acquisition contract

The browser adapter can be one small function behind the Capture state machine.
Its behavior should be fixed rather than extensible:

### Request

- Receive only the already classified resource kind and validated identifier.
- Construct the canonical YouTube resource URL, then the constant
  `https://www.youtube.com/oembed` endpoint with `format=json`.
- Make exactly one `GET`; no discovery, preliminary `HEAD`, retry, page fetch,
  Data API call, or fallback adapter.
- Use CORS mode, `credentials: "omit"`, `referrerPolicy: "no-referrer"`,
  `cache: "no-store"`, and `redirect: "error"`.
- Combine Source replacement, Capture close/unmount/Add, and one 2.5-second timer
  into the request's `AbortSignal`. The [Fetch API accepts an
  `AbortSignal`](https://fetch.spec.whatwg.org/#dom-request-signal), and the
  [DOM Standard](https://dom.spec.whatwg.org/#aborting-ongoing-activities)
  defines the cancellation mechanism. The 2.5-second network/parse budget leaves
  margin inside the existing three-second visible settlement ceiling; it does
  not need DNS, connect, and header sub-deadlines that browsers do not expose.

### Response

- Refuse every redirect through Fetch's `error` redirect mode. The [Fetch
  Standard](https://fetch.spec.whatwg.org/#concept-request-redirect-mode) defines
  this as a network error, so no target-specific redirect validation is needed.
- Accept only status 200 and the `application/json` media type. Treat every 4xx,
  5xx, opaque/CORS failure, and network error as title unavailable.
- Count decoded streamed bytes and cancel above **16 KiB**. The observed bodies
  were below 1 KiB; 16 KiB is a deliberately generous product limit, not a
  provider guarantee. An oversized future response safely becomes Type-only.
- Decode strictly as UTF-8, matching the oEmbed JSON contract, and parse one JSON
  object only after the body completes within the limit.
- Require oEmbed version 1.0 and a nonblank string `title`. Normalize only outer
  and repeated whitespace, cap the accepted suggestion at 512 Unicode code
  points, and reject rather than truncate an over-limit value.
- Ignore every other property, especially `html`, thumbnail URLs, author values,
  provider values, and oEmbed `type`. Render the accepted title through React's
  ordinary text boundary.

### Failure and diagnostics

- Return a title or a single unavailable outcome. The local Type is independent
  and survives every title failure.
- Do not expose transport reasons to the User and do not add Retry.
- Do not log or report the original Source, canonical URL, identifier, endpoint
  query, title, response body, or reversible resource fingerprint. If telemetry
  is retained, it needs only a bounded terminal category and duration.
- Do not cache a response or persist oEmbed data. Only the User-confirmed ordinary
  Item title is written when the User later chooses Add to Library, under the
  separately accepted policy risk.

## Threats removed and controls retained

| Concern | Arbitrary public-web design | Fixed-origin browser design |
| --- | --- | --- |
| User-selected destination | Any public hostname, protocol target, port, and redirect | Impossible: code owns one HTTPS endpoint and reconstructs one YouTube resource URL |
| SSRF and DNS rebinding | Required address classification, CNAME traversal, pinning, SNI handling, and validation at every redirect | Removed from the application threat model; the User controls neither connection host nor redirect because redirects are refused |
| Redirect policy | Up to five revalidated public targets and downgrade handling | Zero redirects accepted |
| Representation parsing | HTML/XHTML gates, four content encodings, charset sniffing, inert HTML, Open Graph, Schema.org, JSON-LD bounds | Browser-decoded UTF-8 JSON only; accept one bounded title string and ignore embed HTML |
| Server resource abuse | Process/user/host concurrency limits and a token bucket protect an internet-facing proxy | No Unshelf proxy or server work; one active UI attempt plus debounce/cancellation is sufficient for ordinary behavior |
| Authentication and sensitive API request handling | Required because Unshelf exposes a server fetch capability | Not part of acquisition; the existing authenticated Item-create request remains unchanged |
| Third-party failure | Server maps many internal failures to unavailable | Browser maps CORS, status, redirect, deadline, limit, decoding, and JSON failure to Type-only/manual fallback |

Controls that remain necessary are the exact-host route classifier, conservative
identifier validation, canonical reconstruction, fixed endpoint constant, HTTPS,
credential/referrer omission, redirect refusal, one deadline, cancellation and
stale-response protection, a decoded-byte ceiling, content-type and JSON-shape
validation, title normalization/length bounds, plain-text rendering, privacy-safe
diagnostics, and the oEmbed kill switch.

A fixed-origin **server** implementation, if selected for User network privacy or
CORS insulation, keeps the same endpoint, canonical input, redirect refusal,
deadline, decoded-byte cap, JSON/title validation, and fail-soft behavior. It
still does not need the guarded arbitrary-host transport, resolver, address
classification, DNS pinning, generic parser, host limiter, or release evaluator.

## Policy and retention caveat

The current oEmbed materials prove a protocol and live behavior, not YouTube's
permission or retention contract:

- YouTube's [Developer Policies define YouTube API Services and API
  Data](https://developers.google.com/youtube/terms/developer-policies#definitions),
  prohibit undocumented APIs without express permission, and require API-service
  data to be accessed only through the means stipulated in authorized
  documentation.
- The same policies require Non-Authorized API Data to be refreshed or deleted
  within 30 days and current data to be reflected in user-facing presentations.
  ([Developer Policies,
  III.E.4](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content))
- No current first-party YouTube page was found that documents oEmbed, states
  whether its response is YouTube API Data, grants a title-copy use, or explains
  whether explicit confirmation changes the provenance of a title stored in an
  ordinary Item.

If oEmbed is a YouTube API Service, its credentialless title is plausibly
Non-Authorized API Data and the existing 30-day concern applies. If it is not,
the published API policy still does not supply a durable title-copy permission.
That is an inference from missing first-party coverage, not a legal conclusion.
The prior [YouTube retention
memo](https://github.com/rajat2006/unshelf/blob/29de2dd1a0bb4f6b337ce345505a947064d6cf10/docs/research/youtube-kept-item-metadata-retention.md)
already established that merely confirming a Data-API-prefilled value cannot be
assumed to change provenance; no new source changes that conservative principle
for oEmbed.

Accordingly:

- do not describe the title path as documented, approved, or compliant;
- keep title acquisition independently disableable while local Type and manual
  Capture continue;
- use neither the Data API nor YouTube page scraping as a fallback; and
- obtain field-specific written YouTube permission if the product wants to
  remove this accepted risk rather than disable titles.

## Browser versus server decision input

| Dimension | Browser-direct | Fixed-origin authenticated server |
| --- | --- | --- |
| Code and infrastructure | Smallest; no new API route or server network module | Adds route, validation, request lifecycle, server fetch adapter, and tests |
| CORS changes and browser blockers | Can remove titles; Capture still falls back manually | Insulated from CORS and some client blockers |
| User network privacy | YouTube sees client network context and Unshelf origin | YouTube sees Unshelf server context; Unshelf handles the canonical request |
| Credentials | Explicitly omitted; no Clerk or YouTube cookies | Clerk authenticates Unshelf request; no credential is sent to YouTube |
| Kill switch and aggregate operations | Needs existing client-visible configuration or deploy-time disablement | Easy to enforce centrally at request time |
| SSRF/arbitrary-host risk | None in this fixed construction | None if the endpoint is constant and redirects are refused |
| YouTube policy uncertainty | Unchanged | Unchanged |

The research does not create another decision ticket. [Choose the minimum
YouTube-only inspection
architecture](https://github.com/rajat2006/unshelf/issues/510) already owns this
tradeoff, and [Define the reduced YouTube-only Source inspection
contract](https://github.com/rajat2006/unshelf/issues/509) already owns the
explicit title-risk statement.

## Evidence limits

- CORS and response behavior were observed on one date, from one network, in one
  Chromium version. No Safari, Firefox, regional, throttling, blocking, or outage
  matrix was run. The fail-soft contract makes that breadth unnecessary for this
  decision, but the observation is not a compatibility promise.
- The two redacted resources demonstrate video and playlist feasibility only.
  They do not establish population latency, title coverage, or a response-size
  maximum.
- No current first-party YouTube oEmbed documentation, written approval, or
  Unshelf compliance response was available. Only YouTube can resolve the policy
  question authoritatively.
- This is technical and product-policy research, not legal advice.

## Primary-source inventory

- [oEmbed protocol, response contract, errors, security notes, and YouTube
  example](https://oembed.com/)
- [oEmbed provider registry](https://oembed.com/providers.json)
- YouTube: [embedded-player video and playlist identifier
  forms](https://developers.google.com/youtube/player_parameters#select_content_to_play)
- YouTube: [API Services Developer
  Policies](https://developers.google.com/youtube/terms/developer-policies)
- YouTube: [Complying with the Developer
  Policies](https://developers.google.com/youtube/terms/developer-policies-guide)
- WHATWG: [Fetch Standard](https://fetch.spec.whatwg.org/), [DOM abort
  primitives](https://dom.spec.whatwg.org/#aborting-ongoing-activities), and
  [URL Standard](https://url.spec.whatwg.org/)
