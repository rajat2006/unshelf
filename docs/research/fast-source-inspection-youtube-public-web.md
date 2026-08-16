# Fast Source inspection for YouTube and the public web

Research memo for [Research fast, compliant Source inspection for YouTube and
public web](https://github.com/rajat2006/unshelf/issues/400), within
[Wayfinder: make Capture Source-first and metadata-assisted](https://github.com/rajat2006/unshelf/issues/398).

Researched: 2026-08-16

## Executive answer

The generic public-web happy path can fit comfortably inside the product's
three-second ceiling. Use one bounded, server-side `GET`; stream only a limited
decompressed prefix; stop at the end of `<head>` or **256 KiB**, whichever comes
first; and extract inert metadata without executing scripts. In the seed corpus,
all 10 pages that produced usable titles did so within 2.31 seconds, and 26 of
their 30 observations completed within 0.74 seconds. This is directional evidence,
not a production latency percentile or release threshold.

Use this deterministic acquisition order:

1. recognize a supported Provider URL before generic fetching;
2. validate the URL and every redirect as an untrusted server-side request;
3. accept only a successful HTML/XHTML response;
4. decode it using the declared/BOM/HTML encoding rules and stream-parse a bounded
   `<head>`;
5. collect a primary Schema.org JSON-LD entity, Open Graph, and the HTML document
   title;
6. choose a title by fixed provenance priority and choose Type only when all
   strong signals agree; otherwise return a partial result.

**YouTube is the exception.** Do not scrape YouTube watch or playlist pages:
YouTube's current Terms prohibit automated access except for public search engines
following `robots.txt` or with prior written permission. The documented YouTube
Data API is technically clean and cheap—`videos.list` and `playlists.list` each
cost one quota unit—but its returned title is Non-Authorized API Data. The existing
YouTube retention research found that merely accepting an API-prefilled value does
not safely turn it into an indefinitely retained User-owned Item field. A separate
refreshable, purgeable projection would solve that, but the current map explicitly
excludes one. ([YouTube automated-access restriction](https://www.youtube.com/static?template=terms),
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list),
[playlists.list](https://developers.google.com/youtube/v3/docs/playlists/list),
[retention finding](https://github.com/rajat2006/unshelf/blob/29de2dd1a0bb4f6b337ce345505a947064d6cf10/docs/research/youtube-kept-item-metadata-retention.md))

Therefore the compliant first-slice YouTube behavior under the settled scope is:

- infer **video** or **playlist** locally from an unambiguous User-pasted YouTube
  URL and suggest that editable Type;
- leave title manual;
- do not fall through to the generic HTML fetcher;
- keep mixed or unsupported YouTube URL shapes unresolved;
- release-gate YouTube title prefill on either field-specific written approval or
  a later decision to add the refreshable provenance projection.

This is a narrower YouTube contract than the map's hoped-for title-and-Type happy
path. It is evidence the existing [Define the Source inspection suggestion and
field-ownership contract](https://github.com/rajat2006/unshelf/issues/399) must
resolve, not a reason to block generic public-web title suggestions.

## Relationship to the earlier research

[Research reliable Candidate metadata acquisition and agent-assisted
extraction](https://github.com/rajat2006/unshelf/issues/384) established a
Provider-specific acquisition ladder and rejected a universal scraper or
autonomous agent fetcher. This memo keeps that principle but applies it to a
single User-requested Source, where stable Provider identity and recurring drift
detection are not prerequisites: inspection may legitimately return only a title,
only a Type, or neither.

[Research YouTube retention for metadata copied into kept
Items](https://github.com/rajat2006/unshelf/issues/397) established that YouTube
API-origin title, identity, publisher, publication time, thumbnail, Source, and
API-derived Type cannot silently become immutable Item fields after Keep. Capture
changes the local action, not the origin of the value. This memo therefore does
not repeat the field-by-field retention analysis; it applies its conservative
rule to one-shot prefill.

Generic page metadata has no equivalent web-wide 30-day rule. It still comes from
the fetched origin, and individual sites can impose terms or removal duties that
no generic parser can prove automatically. Confirmation should store only the
final Item title and Type, but calling that confirmation “User-owned” is a product
ownership rule rather than a claim that the page never supplied the text.

## Recommended acquisition hierarchy

### 1. Route supported Provider Sources first

Parse with the platform URL parser, not regular expressions. Match the normalized
hostname against an exact supported set while retaining the original Source
string unchanged for Capture. Provider recognition is an inspection decision; it
must not rewrite or deduplicate Source.

For YouTube, the first slice can recognize these unambiguous shapes:

| User-pasted shape | Suggested Type | Treatment |
| --- | --- | --- |
| `youtube.com/watch?v=<video-id>`, `youtu.be/<video-id>`, `youtube.com/shorts/<video-id>`, or `youtube.com/embed/<video-id>` with no playlist identity | _video_ | Infer locally from the User-supplied URL; do not fetch YouTube metadata. |
| `youtube.com/playlist?list=<playlist-id>` or `youtube.com/embed?listType=playlist&list=<playlist-id>` | _playlist_ | Infer locally from the User-supplied URL; do not fetch YouTube metadata. YouTube documents the `listType=playlist` embed form. ([YouTube player parameters](https://developers.google.com/youtube/player_parameters#select_content_to_play)) |
| A watch/short URL carrying both video and playlist identity | unresolved | It names a selected video in playlist context; do not guess the User's intended Item. |
| Channel, handle, search, home, malformed ID, or another YouTube route | unresolved | The first slice supports Items, not arbitrary YouTube surfaces. |

The mapping is an Unshelf inference over the Source the User supplied; no YouTube
API Data is retrieved. That distinction is an inference from YouTube's definition
of API Data, not legal advice. ([YouTube API Data and Non-Authorized Data
definitions](https://developers.google.com/youtube/terms/developer-policies#definition-api-data))

Never let a recognized YouTube hostname fall through to generic HTML parsing.
Besides the policy problem, the measured YouTube documents exceeded the 256 KiB
prefix without exposing a usable `<head>` title, so this would be brittle even if
it were permitted.

### 2. Fetch a generic public page once

Issue a `GET` directly. A preliminary `HEAD` adds a round trip, can differ from
the `GET` representation, and contains none of the metadata being requested.
Use a truthful product User-Agent with a contact URL, a stable `Accept` value, and
a deliberately selected `Accept-Language`. The corpus showed the same web.dev
Source redirecting to different localized titles when no language was declared;
the production contract should use the User's language if Unshelf has one and a
stable fallback otherwise.

Treat one deadline as covering DNS, connection, redirects, response headers,
streaming, decoding, parsing, and serialization. A server-side budget below the
visible three-second ceiling is needed to leave time for the API response to reach
the browser; the architecture ticket should set the exact reserve.

Follow at most five ordinary HTTP redirects manually. Reparse, resolve, and
network-validate every target before connecting. Keep the original Source for the
Item; the final response URL is inspection evidence only. RFC 9110 permits redirect
following but requires care, while OWASP specifically warns that redirects can
bypass URL validation. ([HTTP redirection](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4),
[OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html))

Do not retry within one inspection. A retry can turn the three-second ceiling into
an accidental longer wait and amplify load on an origin. Honor `401`, `403`,
`404`, `410`, `429`, and 5xx as failures; never suggest the title of an error,
login, anti-bot, or rate-limit page merely because its response contains `<title>`.

### 3. Gate on representation type

Accept only a successful `text/html` or `application/xhtml+xml` response for the
generic first slice. Return no suggestion for PDF, JSON, images, media, missing or
ambiguous `Content-Type`, and other representations. RFC 9110 says Content-Type
defines both the representation's format and processing model and warns that MIME
sniffing can create security problems. ([HTTP Content-Type](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3))

This deliberately leaves public PDFs manual. A future PDF title extractor should
be a distinct content-type adapter with its own byte, parser, and safety contract;
PDF is not HTML with another title tag.

### 4. Stream, decode, and stop

Bound the **decompressed** response, because a small compressed transfer can expand
into a large parser input. Stop when one of these happens:

- a complete `</head>` has been parsed;
- 256 KiB of decompressed bytes has been consumed;
- the end-to-end deadline expires;
- the client cancels or replaces the Source;
- a parse, network, redirect, or safety failure occurs.

Optionally abort earlier when both a usable title and an agreed strong Type are
already known. Do not rely on `Range`: RFC 9110 allows a server to ignore it, and
the measured YouTube playlist response did so, transferring about 2.08 MB despite
a 256 KiB range request. The client must stop its own stream. ([HTTP Range
semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.2))

Use an encoding-aware HTML stream, not `Buffer.toString("utf8")`. The HTML Standard
prioritizes BOM and transport metadata and encourages a prescan of the first 1024
bytes for an HTML encoding declaration. ([HTML encoding sniffing](https://html.spec.whatwg.org/multipage/parsing.html#determining-the-character-encoding))

Never execute JavaScript, load subresources, evaluate HTML, or resolve XML entities.
Treat every extracted value as untrusted text. Normalize outer and repeated
whitespace, decode character references through the HTML parser, apply explicit
field length limits, and return text—not publisher HTML—to the web application.

### 5. Extract inert metadata

Collect candidates rather than letting the first parser callback mutate final
fields:

- Schema.org JSON-LD from inert `script[type="application/ld+json"]` blocks;
- Open Graph `og:title` and `og:type` meta elements;
- the HTML `<title>` element as the universal title fallback.

For JSON-LD, parse bounded local JSON only. Walk top-level arrays and `@graph`,
recognize literal `@type`, `headline`, and `name` properties, and identify the
primary content entity using `mainEntity`/`mainEntityOfPage` where available.
Do **not** dereference a remote `@context`, `@import`, link header, or any URL from
the JSON-LD. The JSON-LD specification permits remote context loading and notes
its security and privacy effects; in this request-on-untrusted-URL path it would
be an unbounded second fetch and another SSRF surface. ([JSON-LD document
loading](https://www.w3.org/TR/json-ld11/#loading-documents), [JSON-LD remote
retrieval](https://www.w3.org/TR/json-ld11-api/#remote-document-and-context-retrieval))

Open Graph defines `og:title` as the object's title and `og:type` as its graph
type. When a property appears more than once, the protocol gives the first tag in
document order precedence. ([Open Graph basic metadata and arrays](https://ogp.me/))

The HTML Standard defines `<title>` as the document's title or name and explicitly
frames it for out-of-context uses such as history, bookmarks, and search results.
That makes it a sound title fallback but says nothing about Unshelf Type.
([HTML title](https://html.spec.whatwg.org/multipage/semantics.html#the-title-element))

Do not add generic oEmbed discovery in this slice. It normally requires a second
request, title is optional, its `type` describes the embedding representation
(`video`, `photo`, `link`, or `rich`) rather than Unshelf's domain Types, and a
discovered endpoint requires the same redirect and SSRF controls. It is useful as
a later Provider-specific mechanism, not as an automatic escalation for every
page. ([oEmbed response contract](https://oembed.com/#section2.3))

### 6. Resolve title deterministically

Use the first nonblank value in this order:

1. `headline`, then `name`, on the single primary recognized Schema.org content
   entity;
2. the first `og:title` in document order;
3. `<title>` text.

If no single primary JSON-LD content entity can be identified, skip its title
rather than taking `Organization.name`, `WebSite.name`, breadcrumb text, or an
arbitrary graph node. This prevents structurally valid page furniture from
becoming the Item title. The result may still use Open Graph or `<title>`.

The priority is deterministic, not a truth guarantee. Preserve the winning
evidence kind in the ephemeral result so tests and diagnostics can explain the
choice; do not persist that provenance with the Item under this map.

### 7. Resolve Type only from strong, agreeing evidence

| Signal | Suggested Unshelf Type | Strength and limits |
| --- | --- | --- |
| Unambiguous supported YouTube URL shape | _video_ or _playlist_ | Strong without a network call; ambiguous watch-plus-list forms remain unresolved. |
| Primary Schema.org `Article`, `NewsArticle`, `BlogPosting`, or another explicit `Article` subtype | _article_ | Strong. Schema.org defines Article as an article or investigative report. ([Schema.org Article](https://schema.org/Article)) |
| Primary Schema.org `VideoObject` | _video_ | Strong only when it is the page's primary entity, not an embedded video attached to an Article. ([Schema.org VideoObject](https://schema.org/VideoObject)) |
| Primary Schema.org `Course` | _course_ | Strong. Schema.org defines it as an educational course made of learning events or works. ([Schema.org Course](https://schema.org/Course)) |
| Primary Schema.org `Book` | _book_ | Strong. ([Schema.org Book](https://schema.org/Book)) |
| Open Graph `article` | _article_ | Strong. It is a globally defined Open Graph object type. ([Open Graph object types](https://ogp.me/#types)) |
| Open Graph `book` | _book_ | Strong. |
| Open Graph `video.movie`, `video.episode`, `video.tv_show`, or `video.other` | _video_ | Strong for a video object, even though the subtype is more specific than Unshelf. |
| Open Graph `website`, a bare `og:video`, Schema.org `WebPage`, `WebSite`, `CreativeWork`, `LearningResource`, `ItemList`, or HTML `<article>`/`<video>` | unresolved | These are generic containers or embedded features. Schema.org says ItemList is a list of anything, so it is not evidence for Unshelf _playlist_. ([Schema.org ItemList](https://schema.org/ItemList)) |
| Title text, hostname/path keywords, MIME `text/html`, or a model guess | unresolved | Never classify from wording such as “course”, “book”, or “video” alone. |

Treat equivalent signals as agreement—for example, `BlogPosting` plus Open Graph
`article`. Ignore non-specific signals such as Open Graph `website` when a strong
primary `Course` exists. If two strong signals map to different Unshelf Types,
return Type unresolved; do not choose by priority or majority. If there are
multiple primary recognized JSON-LD entities with different Types, the result is
also unresolved.

Missing Type is a successful partial inspection when title exists. Missing title
with a strong Provider-local Type, such as an unambiguous YouTube URL, is also a
successful partial inspection. Missing both is failure/manual fallback.

## YouTube mechanism comparison

| Mechanism | Speed and metadata | Type quality | Policy/retention | Verdict |
| --- | --- | --- | --- | --- |
| **YouTube webpage HTML** | The two measured public pages returned quickly, but neither exposed a usable title within the first 256 KiB. Full playlist HTML was about 2.08 MB in one observation. | URL shape is clearer than page `og:type`; the measured playlist page advertised Open Graph `website`. | YouTube Terms prohibit this automated access absent the named exceptions. | **Reject.** No generic HTML fallback for YouTube. |
| **YouTube oEmbed endpoint** | Three video responses took 102–119 ms and three playlist responses 110–115 ms. Both returned a title without a key. | Not suitable: both the video and playlist response returned oEmbed `type: "video"`, because oEmbed describes an embeddable player rather than Unshelf semantics. | The oEmbed specification lists YouTube as an example, but no current first-party YouTube developer contract or field-retention guidance was found. It should not be used to evade the clearer API and Terms obligations. | **Do not ship for title or Type without written policy clarification.** URL shape already gives better Type. |
| **YouTube Data API** | `videos.list(part=snippet,id=…)` and `playlists.list(part=snippet,id=…)` return structured resource identity and title; each costs one quota unit. Public API reads use an application key and do not require end-user OAuth. ([Data API overview](https://developers.google.com/youtube/v3/getting-started), [public playlist request](https://developers.google.com/youtube/v3/sample_requests#playlists)) | Strong: the called resource kind is explicitly video or playlist. No search call is needed. | Title is Non-Authorized API Data and must be refreshed or deleted within 30 days; current presentation duties also apply. The existing memo conservatively release-blocks copying a prefill into immutable Item fields. ([Developer Policies III.E.4](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content)) | **Technically preferred, product-incompatible with the current no-projection scope.** Use later with a purgeable projection or written approval. |

The current Data API is the only documented, production-grade route among these
for a YouTube title. Because the map rejects a refreshable projection and wants
the final title stored on the Item, technical speed does not make that route
eligible.

## Server-side safety boundary

Source inspection turns a User-controlled string into an outbound server request,
which is the canonical SSRF shape. The architecture must enforce all of these as
one inseparable boundary:

- accept only absolute `http:` and `https:` URLs for inspection;
- reject embedded credentials, malformed hosts, and unsupported ports according
  to an explicit policy; omit a fragment from the outbound request while retaining
  the original Source unchanged;
- resolve DNS and reject every non-public, loopback, link-local, private, shared,
  multicast, documentation, benchmark, and other special-purpose IPv4/IPv6 result;
- connect to the validated address so DNS cannot change between validation and
  use; handle IPv4-mapped IPv6 and CNAME chains;
- repeat the entire validation for every redirect and cap redirect count;
- send no User cookies, auth headers, Clerk tokens, referer, or internal headers;
- use no proxy that can reach private control-plane addresses;
- bound DNS/connect/header/total time, decompressed bytes, parser nodes/depth,
  JSON-LD blocks/bytes, extracted string length, redirects, concurrency, and
  per-User request rate;
- cancel origin work when the browser request is aborted or superseded;
- never return raw response bodies, headers, redirect locations, IPs, or internal
  errors to the User.

OWASP recommends allowlisting where targets are known and, for arbitrary external
targets, explicitly calls out unsafe redirects, DNS pinning/rebinding, alternate IP
forms, and scheme validation. IANA's special-purpose registries are the maintained
source for address classification. ([OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html),
[IANA IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml),
[IANA IPv6 special-purpose registry](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml))

The network layer should allowlist YouTube's documented API host when that adapter
is eventually enabled and use the guarded arbitrary-public-host path only for
generic pages.

### Access controls and site policy

The generic fetch is one User-triggered read of one supplied URL; it does not
traverse links or index a site. RFC 9309 defines robots.txt for crawlers that
automatically traverse URIs and says its rules are not access authorization.
That standard therefore does not prove either permission or prohibition for this
one-shot product behavior. ([Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html))

Unshelf should still identify itself, avoid retries and subresources, honor access
control and throttling responses, never use cookies/browser execution to bypass a
wall, and maintain a Provider/host kill switch. A generic system cannot promise
compliance with every site's changing terms; operators need a process to disable
an origin when its terms or owner require it. This memo is technical and policy
research, not legal advice.

### Privacy-safe diagnostics

Do not log fetched HTML, JSON-LD, titles, redirect query strings, or full Source
values. A public-looking Source can still contain a signed query token. Emit only
bounded operational codes and timings such as strategy, terminal result,
redirect-count bucket, byte-count bucket, and duration. If host-level metrics are
needed, use a separately reviewed bounded representation; do not inherit the API's
failure-body snapshot for this route without explicitly redacting Source.

Inspection remains ephemeral: no database write, shared HTTP metadata cache,
background retry, or raw-corpus retention. Normal transport caches outside
Unshelf's control and a future robots policy cache are separate operational
questions, not Item metadata.

## Representative seed corpus and measurements

### Method

On 2026-08-16, a Node 24-compatible probe issued three requests per generic
Source from one development location. It used a named research User-Agent, manual
redirects capped at five, a three-second end-to-end abort, accepted HTML/XHTML,
streamed decompressed bytes, and stopped at `</head>` or 256 KiB. The probe did
not execute scripts, load subresources, or store response bodies in the repo.

The oEmbed timings used three direct `GET`s for each YouTube example. The probe
did not call the Data API because no project credential was provisioned; its field,
quota, and policy contracts come from current first-party documentation instead.

These observations include DNS/CDN locality, connection reuse, origin variance,
and one machine's network. They demonstrate feasibility and failure variety; they
do not establish a production SLO, a population success rate, or permission to
depend on a third-party page shape.

### Observations

| Corpus role and Source | Three-run elapsed range | Title result | Strong Type result / notable behavior |
| --- | ---: | --- | --- |
| [YouTube video page](https://www.youtube.com/watch?v=M7lc1UVf-VE) | 156–254 ms | None inside 256 KiB | Type inferable as _video_ from URL; HTML strategy rejected by policy. |
| [YouTube public uploads playlist](https://www.youtube.com/playlist?list=UU_x5XG1OV2P6uZZ5FSM9Ttw) | 148–258 ms | None inside 256 KiB | Type inferable as _playlist_ from URL; a separate Range probe was ignored and downloaded about 2.08 MB. |
| YouTube video oEmbed for the video above | 102–119 ms | Yes | Returned oEmbed `type: video`; policy/retention contract insufficient. |
| YouTube playlist oEmbed for the playlist above | 110–115 ms | Yes | Also returned `type: video`, proving that value does not distinguish Unshelf _playlist_. |
| [MDN Promise reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) | 16–105 ms | Open Graph / HTML title | Type unresolved. |
| [React Quick Start](https://react.dev/learn) | 50–141 ms | Open Graph / HTML title | `og:type=website`; Type correctly unresolved. |
| [Wikipedia HTTP article](https://en.wikipedia.org/wiki/HTTP) | 48–159 ms | Open Graph / HTML title | `og:type=website`; Type unresolved despite human-visible article content. |
| [web.dev Fetch Metadata article](https://web.dev/articles/fetch-metadata) | 473–1,092 ms | JSON-LD / Open Graph / HTML title | JSON-LD `Article` → _article_. Without `Accept-Language`, different runs redirected to different languages. |
| [Cloudflare AI Platform article](https://blog.cloudflare.com/ai-platform/) | 29–73 ms | JSON-LD / Open Graph / HTML title | `BlogPosting` plus `og:type=article` → _article_. |
| [arXiv Attention Is All You Need](https://arxiv.org/abs/1706.03762) | 13–50 ms | Open Graph / HTML title | `og:type=website`; Type unresolved. This is safer than guessing article from context. |
| [Coursera Machine Learning course](https://www.coursera.org/learn/machine-learning) | 739–2,305 ms | JSON-LD / Open Graph / HTML title inside 256 KiB | Primary `Course` → _course_; slowest successful title observation but inside ceiling. |
| [Udemy Web Developer Bootcamp](https://www.udemy.com/course/the-web-developer-bootcamp/) | 48–62 ms | Rejected | HTTP 403 anti-bot page titled “Just a moment”; manual fallback. |
| [edX CS50 course](https://www.edx.org/learn/computer-science/harvard-university-cs50-s-introduction-to-computer-science) | 65–129 ms | Open Graph / HTML title | `Course` appeared in two of three responses; Type may resolve when present, otherwise title-only. |
| [Schema.org Course definition](https://schema.org/Course) | 12–367 ms | HTML title | Type unresolved; a page *about* Course is not itself an Unshelf course. |
| [Example Domain](https://example.com/) | 17–58 ms | HTML title | Type unresolved. |
| [httpbin HTML without title](https://httpbin.org/html) | 2,052 ms once; two 3,000 ms aborts | None | Valid HTML can legitimately have no title; manual fallback. |
| [httpbin two-hop redirect](https://httpbin.org/redirect/2) | Three 3,000 ms aborts | None | Redirect chain can consume the entire ceiling; manual fallback. |
| [RFC 9110 PDF](https://www.rfc-editor.org/rfc/rfc9110.pdf) | 346–411 ms | Not attempted | `application/pdf` rejected by the first-slice content-type gate. |

Among the 14 generic-web rows, 10 produced a usable title in every run, two
failed by status or deadline, one valid HTML page had no title, and one was an
unsupported PDF. Four showed strong Type evidence in at least some responses;
the rest correctly stayed unresolved. These counts describe only this deliberately
varied seed corpus.

### Corpus needed for release decisions

The implementation handoff should turn this seed into two separate suites:

1. **Deterministic fixtures** committed as minimal synthetic HTML/headers, not
   copied third-party pages. Cover metadata order, attribute order/casing,
   entities and encodings, JSON-LD arrays/graphs, multiple primary entities,
   agreeing and conflicting Types, malformed/oversized JSON-LD, metadata after
   the byte limit, redirects, every terminal status, compressed overflow, and
   cancellation.
2. **A private, versioned dogfood URL corpus** sampled from the User's real
   captures and classified by expected outcome: full suggestion, title-only,
   Type-only, or manual fallback. Keep credentials/private URLs out. Run it as a
   release evaluation, not a network-dependent CI test, and report success and
   latency by source class rather than one flattering aggregate.

The PRD should set thresholds only after that real corpus exists. At minimum,
measure end-to-end browser-visible latency, server strategy duration, full/partial
suggestion rate, incorrect-title rate, incorrect-Type rate, timeout rate, blocked
origin rate, and disagreement rate. Because wrong Type silently harms the Library,
the Type acceptance target should emphasize precision over coverage; unresolved
is the intended safe result.

## Failure and conflict contract supplied to later tickets

The acquisition layer should return one of these semantic outcomes, independent
of the later UI wording:

- **complete** — usable title plus one agreed strong Type;
- **partial** — usable title or strong Type, but not both;
- **unsupported** — valid Source whose Provider route or content type is outside
  the first slice;
- **unavailable** — access control, throttling, origin failure, timeout, redirect
  failure, response limit, or no usable metadata;
- **unsafe** — URL or any redirect failed the network safety boundary;
- **cancelled/superseded** — the User replaced Source, closed Capture, or aborted
  the request.

Do not expose whether a hostname resolved to an internal address or which safety
rule fired; public UX can fold unsafe into the same quiet manual fallback. Keep
the finer internal code for tests and privacy-safe operations.

The ephemeral result should identify the winning evidence kind for each field and
whether Type evidence disagreed. That makes provider policy and field-ownership
behavior testable without persisting metadata. It must never overwrite a field
after the User edits it; that ownership transition belongs to the existing product
contract ticket, not to acquisition.

## Decisions this evidence enables

- **Generic Source inspection is feasible within three seconds** with one bounded
  streaming fetch and partial-result semantics. Most measured successes were much
  faster, but a course page reached 2.31 seconds and redirect/no-title examples
  exhausted the deadline, so manual fallback is a normal state rather than an
  edge-case error.
- **A 256 KiB decompressed prefix is a reasonable first evaluation limit.** It
  captured the generic successes including the large Coursera head while bounding
  YouTube and hostile responses. The implementation evaluation may lower it only
  if the real corpus preserves its acceptance threshold.
- **Type must remain conservative.** Explicit primary Schema.org and narrow Open
  Graph object types are useful; ordinary documentation, Wikipedia, and arXiv
  pages often expose only `website`, so title-only results will be common.
- **YouTube title prefill does not fit the current scope.** Page parsing is both
  prohibited and brittle; oEmbed is fast but semantically lossy and lacks adequate
  first-party policy guidance; the Data API is the documented answer but requires
  retention/provenance behavior the map excludes.
- **No additional ticket is required.** The YouTube narrowing is already named in
  [Define the Source inspection suggestion and field-ownership
  contract](https://github.com/rajat2006/unshelf/issues/399); SSRF, budgets,
  observability, and parser seams already belong to [Choose the production Source
  inspection architecture and safety boundary](https://github.com/rajat2006/unshelf/issues/403);
  and real-corpus thresholds already belong to [Write the Source-first Capture
  implementation handoff](https://github.com/rajat2006/unshelf/issues/401).

## Evidence limits

- YouTube can give the authoritative application-specific policy answer only in
  writing or through its compliance audit process. This memo applies the existing
  conservative release gate; it is not legal advice.
- No Unshelf YouTube Data API key or compliance response was available, so API
  latency was not measured. API field/quotas and storage duties are documented;
  production latency still needs instrumentation if that adapter is later enabled.
- No current first-party YouTube developer page documenting oEmbed retention or
  an Item-metadata use case was found. The live endpoint and oEmbed specification
  prove behavior, not a durable platform contract.
- The corpus is intentionally small and varied. CDN warmth, geography, rate
  limiting, bot policy, page templates, localization, and network conditions can
  all change. Do not convert its observed counts into a promised population rate.
- A generic fetcher cannot determine every origin's contractual terms from HTML.
  Host disablement and policy review remain operational controls.

## Primary-source inventory

- YouTube: [Terms of Service](https://www.youtube.com/static?template=terms)
- YouTube: [API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- YouTube: [Complying with the Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide)
- YouTube Data API: [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- YouTube Data API: [playlists.list](https://developers.google.com/youtube/v3/docs/playlists/list)
- YouTube: [embedded player URL forms](https://developers.google.com/youtube/player_parameters#select_content_to_play)
- oEmbed: [protocol and response contract](https://oembed.com/)
- WHATWG: [HTML title](https://html.spec.whatwg.org/multipage/semantics.html#the-title-element)
- WHATWG: [HTML encoding determination](https://html.spec.whatwg.org/multipage/parsing.html#determining-the-character-encoding)
- Open Graph: [protocol](https://ogp.me/)
- Schema.org: [Article](https://schema.org/Article), [VideoObject](https://schema.org/VideoObject), [Course](https://schema.org/Course), [Book](https://schema.org/Book), and [ItemList](https://schema.org/ItemList)
- W3C: [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/) and [processing API](https://www.w3.org/TR/json-ld11-api/)
- IETF: [HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) and [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html)
- OWASP: [Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- IANA: [IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml) special-purpose address registries
