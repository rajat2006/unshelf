# Reliable Candidate metadata acquisition and agent-assisted extraction

Research memo for [Research reliable Candidate metadata acquisition and
agent-assisted extraction](https://github.com/rajat2006/unshelf/issues/384),
within [Wayfinder: design the provider-extensible Discover
room](https://github.com/rajat2006/unshelf/issues/379).

Researched: 2026-08-15

## Executive answer

Unshelf should use a **capability ladder**, not one universal scraper:

1. a Provider's official structured API or an authorized mailbox protocol;
2. a standards-based Atom/RSS feed, optionally woken by a verified webhook;
3. deterministic HTTP retrieval and structured page metadata extraction;
4. deterministic browser rendering, followed by the same structured extraction;
5. a bounded model call that interprets a frozen page snapshot only when the
   preceding deterministic strategies cannot map it.

This ordering is an engineering recommendation derived from the contracts below.
Each step gives up some upstream structure and adds more code, compute, attack
surface, or semantic ambiguity. Moving down the ladder is justified per Provider,
not as a global fallback that silently tries increasingly powerful machinery.

The decisive gate is **stable Provider identity**. Atom requires a permanent,
universally unique `atom:id`; RSS makes `guid` optional and leaves its uniqueness
to the feed producer; IMAP defines the tuple of server, mailbox, `UIDVALIDITY`, and
`UID` as a durable mailbox-message reference. These are materially different
contracts, so one generic URL/title deduplicator would erase real uncertainty.
([Atom identity](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.6),
[RSS `guid`](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt),
[IMAP UID identity](https://www.rfc-editor.org/rfc/rfc9051.html#section-2.3.1.1))

An autonomous web agent should **not** be the production fetcher. Browser-rendered
pages and email are untrusted input and can contain indirect prompt injections;
OpenAI describes prompt injection from third-party internet content as an evolving
security challenge, and Anthropic explicitly names fetched pages and inbound
email as indirect-injection sources. Constraining output to JSON Schema fixes
shape, not truth: OpenAI documents that Structured Outputs can still put wrong
values inside valid JSON. ([OpenAI prompt-injection
overview](https://openai.com/safety/prompt-injections/), [Anthropic indirect
prompt-injection guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks#indirect-prompt-injection),
[Structured Outputs limitations](https://openai.com/index/introducing-structured-outputs-in-the-api/#limitations-and-restrictions))

A model-assisted connector is conditionally viable only as a **read-only
extractor**: deterministic code fetches or renders an allowlisted URL, removes
active capabilities, bounds the snapshot, and gives the model no network, tools,
credentials, or cross-User context. The model returns a strict schema plus literal
evidence locations; deterministic validators decide whether to accept it. Stable
identity is still supplied by the Provider adapter, never invented by the model.

If Unshelf cannot establish a permitted access route, a durable Provider
identity, required Candidate fields, and detectable failure, it should mark that
Provider or target unsupported. An agent's apparent ability to read one example
page is not a production contract.

## Constraints inherited from Unshelf

The recurring-discovery model already makes Candidate identity exact and
Provider-namespaced; matching titles or raw Source strings are explicitly not
Provider identity. Keep snapshots Candidate metadata into an Item rather than
silently applying later Provider edits. ([Unshelf recurring-discovery
language](../../CONTEXT.md#recurring-discovery), [settled lifecycle
decision](https://github.com/rajat2006/unshelf/issues/266#issuecomment-5226169495))

The current map permits transient retrieval of full content but stores only
Candidate metadata: Provider identity, title, Source, publisher, publication
time, likely Type, thumbnail, and a Provider-supplied excerpt. It excludes
full-content storage, AI filtering/ranking, and production implementation, and
refreshes only on app open or manual request. ([map
contract](https://github.com/rajat2006/unshelf/issues/379))

Those constraints make this an **acquisition and validation** problem, not a
general browsing or reading problem. The fetched representation may be larger
than the stored Candidate, but the production record and logs must not retain the
page, email body, screenshot, or model prompt merely because extraction needed
them.

## What each acquisition mechanism actually guarantees

### Comparison

| Mechanism | Detecting change or new material | Identity and metadata ceiling | Failure and drift | Cost/latency shape | Verdict for Unshelf |
| --- | --- | --- | --- | --- | --- |
| **Official structured API** | Provider cursors, timestamps, page tokens, change streams, or resource-list calls can be used exactly as that API defines. A webhook is normally a wake-up signal for a subsequent authoritative read, not Candidate identity by itself; Gmail notifications contain a mailbox `historyId`, after which clients call `history.list`. ([Gmail notification flow](https://developers.google.com/workspace/gmail/api/guides/push#receiving_notifications)) | Use the API's resource ID inside the Provider namespace. Accept only documented response fields. Gmail's message resource, for example, separates its message `id`, `internalDate`, headers, and snippet. ([Gmail Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages#Message)) | HTTP/auth/quota errors and response-schema violations are explicit. Provider semantic changes still require contract tests and monitoring. | Usually the fewest bytes and no browser/model compute, but subject to credentials, scopes, quota, pricing, and Provider-specific terms. | **Preferred.** This is the reference quality bar for identity, incremental retrieval, and validation. |
| **Verified webhook or WebSub** | WebSub hubs push full topic content or a permitted diff, retry failed delivery only within hub-chosen limits, and use expiring leases. Gmail requires watch renewal and documents that notifications can be delayed or dropped, with reconciliation through `history.list`. ([WebSub delivery and retry](https://www.w3.org/TR/websub/#content-distribution), [Gmail renewal and reliability](https://developers.google.com/workspace/gmail/api/guides/push#renewing_mailbox_watch)) | The notification authenticates or locates a changed stream; Candidate identity still comes from entries or a subsequent API read. WebSub can sign payloads with a shared secret, and invalid signatures must be ignored when validation is used. ([WebSub authenticated distribution](https://www.w3.org/TR/websub/#authenticated-content-distribution)) | Delivery acknowledgment is not proof of successful processing, retries can stop, and Gmail documents drops; therefore a persisted cursor plus reconciliation read is required for correctness. ([WebSub acknowledgment semantics](https://www.w3.org/TR/websub/#content-distribution), [Gmail notification limitations](https://developers.google.com/workspace/gmail/api/guides/push#limitations)) | Low latency but adds a public callback, secret/lease rotation, replay-safe processing, and reconciliation. | **Trigger, not source of truth.** It is unnecessary for the map's app-open/manual refresh slice and can be added later without changing Candidate extraction. |
| **Atom feed** | Poll the feed; use HTTP validators to avoid transferring an unchanged representation. `ETag` is an opaque representation validator, while `Last-Modified` reflects when the origin believes that representation changed. ([HTTP validators](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8)) | Every entry must have exactly one `id`, `title`, and `updated`; `published` and `summary` are optional, and author may be inherited from the feed. An entry ID is permanent and universally unique but need not be dereferenceable. ([Atom entry requirements](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.1.2), [Atom `id`](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.6), [Atom `summary`](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.13)) | XML/schema errors are detectable. A valid feed can still change semantics or omit optional Candidate fields, so per-feed fixtures and field-presence monitoring remain necessary. | One bounded XML request; cheaper and simpler than page rendering. | **Preferred over HTML.** Atom's required identity/title/time contract is stronger than RSS, though `updated` must not be mislabeled as publication time. |
| **RSS 2.0 feed** | Poll and compare the set of accepted entry references, again using HTTP validators where supplied. | At item level only `title` or `description` is required; `link`, `author`, `pubDate`, `enclosure`, and `guid` are optional. When `guid` exists, uniqueness is the feed producer's responsibility and it is not necessarily a URL. ([RSS item contract](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt), [RSS `guid`](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt)) | Syntax validation can prove the document is RSS, not that its optional identity or publication facts are stable. Namespaced extensions also require Provider-specific mapping. ([RSS extensions](https://www.rssboard.org/rss-specification#extendingRss)) | Similar to Atom. | **Conditional.** Accept only when the adapter documents a stable entry reference (`guid`, or a feed-specific permalink contract) and can obtain the required Candidate fields. Never treat arbitrary raw Source equality as the fallback identity. |
| **Authorized email API or IMAP** | Gmail can reconcile from a persisted `historyId`; IMAP uses `UIDNEXT` as a signal that messages may have arrived and persistent UIDs for resynchronization. ([Gmail sync flow](https://developers.google.com/workspace/gmail/api/guides/sync), [IMAP UIDs and `UIDNEXT`](https://www.rfc-editor.org/rfc/rfc9051.html#section-2.3.1.1)) | For IMAP, server + mailbox name + `UIDVALIDITY` + `UID` identifies one immutable or expunged message. RFC 5322 requires Date and From, makes Subject optional, and says Message-ID should be present and globally unique when generated. ([IMAP identity tuple](https://www.rfc-editor.org/rfc/rfc9051.html#section-2.3.1.1), [email field requirements](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6), [Message-ID semantics](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6.4)) | Authentication expiry and protocol errors are explicit. Newsletter-to-article mapping is not: an email may contain multiple links, no Subject, no public web URL, and MIME/HTML bodies that require a Provider-specific rule. RFC 5322 defines header semantics but treats the body as uninterpreted lines; MIME separately defines body parts. ([RFC 5322 message structure](https://www.rfc-editor.org/rfc/rfc5322.html#section-2.3), [MIME media types](https://www.rfc-editor.org/rfc/rfc2046.html)) | Structured metadata fetch can be small, but mailbox authorization, secret handling, and per-User cursor state add operational cost. | **Strong for “one newsletter message = one Candidate.”** Treat a web article inside a newsletter as a second, explicit mapping problem rather than assuming every link is the Candidate. |
| **Deterministic HTTP + static HTML** | Conditional GET can show that one page representation changed, but page change is not equivalent to a new Candidate. An index/listing connector must deterministically enumerate entries and assign each a Provider reference. ([HTTP `ETag` and `Last-Modified`](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8)) | Prefer machine-readable metadata in a fixed order: JSON-LD/Schema.org, Open Graph, oEmbed, canonical/title HTML, then Provider-specific semantic selectors. Schema.org Article defines `headline`, `author`, `image`, and `datePublished`; Open Graph's basic properties include title, type, image, and URL; oEmbed may provide title, author, Provider, and thumbnail. ([Schema.org Article](https://schema.org/Article), [Open Graph](https://ogp.me/), [oEmbed response](https://oembed.com/#section2.3)) | Missing/duplicate structured fields, an unexpected page template, ambiguous entry count, or selector miss must be a failed extraction, not an empty successful refresh. A canonical link denotes the preferred URL for a document; it is not by itself a Provider-issued identity. ([HTML canonical link](https://html.spec.whatwg.org/multipage/links.html#link-type-canonical)) | More bytes and Provider-specific parsing than feeds, but still no browser or model. | **Acceptable for a named Provider/site adapter with fixtures.** Not a universal “paste any site and watch it” contract. |
| **Rendered-page extraction** | Deterministic browser code navigates, waits for an explicit Provider-owned readiness condition, then applies the same structured metadata/semantic parser to the rendered DOM. Playwright discourages treating generic `networkidle` as readiness and recommends explicit web assertions; service workers can also hide network events from ordinary routing. ([Playwright navigation readiness](https://playwright.dev/docs/api/class-page#page-goto-option-wait-until), [service-worker network caveat](https://playwright.dev/docs/network#missing-network-events-and-service-workers)) | Rendering exposes JavaScript-produced DOM; it does not create a stable identity or authoritative publication date that the page never supplied. CSS/XPath chains are tied to implementation structure and are documented by Playwright as fragile when the DOM changes. ([Playwright locator guidance](https://playwright.dev/docs/locators#locate-by-css-or-xpath)) | Explicit selector cardinality, readiness timeout, HTTP response, navigation target, and DOM schema checks can fail closed. Visual or accessibility snapshots can help tests, but production must still validate semantic fields. | Launch/runtime/memory and subresource traffic are higher than one HTTP parse; each run needs hard time, request, byte, redirect, and concurrency budgets. | **Last deterministic resort.** Use only when a permitted target genuinely requires JavaScript; do not render merely because static extraction needs better rules. |
| **Model-assisted interpretation** | The model does not detect change. It interprets a snapshot already acquired by one of the preceding mechanisms. | Strict Structured Outputs can enforce the JSON shape, but the model can still put incorrect values in that shape. Therefore every accepted value needs deterministic type/range/URL checks and literal evidence in the snapshot. ([Structured Outputs contract and limitations](https://openai.com/index/introducing-structured-outputs-in-the-api/#limitations-and-restrictions)) | Prompt injection, refusal, truncation, semantic mistakes, and model/prompt drift are distinct failure modes. Web pages and email are explicitly untrusted content in current agent-security guidance. ([OpenAI prompt injection](https://openai.com/safety/prompt-injections/), [Anthropic indirect prompt injection](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks#indirect-prompt-injection)) | Adds token/model latency and variable spend after the fetch/render cost; retries multiply both. | **Conditional and narrow.** Never use it for identity, access decisions, or open-ended navigation. Require an evaluated corpus, evidence-backed output, a pinned model/prompt version, and a deterministic failure path. |

### Feeds and APIs are not automatically complete

Atom's mandatory `updated` value means “modified in a way the publisher considers
significant,” not first publication; `published` is the optional first-created
time. RSS makes `pubDate` optional. Unshelf therefore needs separate nullable
`publishedAt` and owned `firstSeenAt` facts rather than putting a polling time into
the publication field. ([Atom `updated`](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.15),
[Atom `published`](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.9),
[RSS `pubDate`](https://www.rssboard.org/rss-specification#ltpubdategtSubelementOfLtitemgt))

Likewise, a webhook is not an exactly-once ledger. WebSub retries failed delivery
only within implementation-defined limits, and Gmail explicitly documents both
retries and rare delayed/dropped notifications. This makes idempotent processing
by Provider identity and a later cursor/feed reconciliation mandatory even when
push is eventually added. ([WebSub retry
contract](https://www.w3.org/TR/websub/#content-distribution), [Gmail push
limitations](https://developers.google.com/workspace/gmail/api/guides/push#limitations))

For the currently selected app-open/manual refresh behavior, polling an API/feed
cursor is the smaller mechanism. A webhook adds no Candidate facts and would
introduce an always-available callback, subscription renewal, and reconciliation
despite the map excluding background refresh.

## Candidate projection contract

The adapter should produce a typed **Candidate projection** and a separate
extraction result. The projection contains user-facing domain metadata; the
result contains enough provenance to validate and operate the connector without
persisting source content.

| Candidate fact | Acceptance rule | Safe degradation |
| --- | --- | --- |
| **Provider identity** | Required. It is `(Provider, providerReference)` where `providerReference` comes from an API resource ID, Atom ID, accepted RSS/feed reference, mailbox message identity, or an equally explicit Provider contract. The model cannot supply or normalize it. Atom warns that IDs need not be dereferenceable, reinforcing the separation from Source. ([Atom ID contract](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.6)) | None. Without identity, do not create a Candidate. |
| **Title** | Required for an intake card and eventual Keep snapshot. Take an API/feed title, email Subject, structured page headline/title, or—only on the last rung—a literal model-selected text span. Atom requires title, RSS requires title or description, and email Subject is optional, so adapters must reject or define a Provider-specific fallback rather than assume it exists. ([Atom entry requirements](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.1.2), [RSS item requirements](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt), [email field cardinality](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6)) | No silent empty title. Record an extraction failure for that result. |
| **Source** | Require an absolute permitted `https` URL for web/video Candidates. Obtain it from a documented API link, Atom alternate link, accepted RSS link, oEmbed/structured metadata, or Provider-owned permalink rule. Resolve relative URLs only against the fetched origin and reapply network-policy checks after every redirect. ([Atom link semantics](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.7), [HTML canonical relation](https://html.spec.whatwg.org/multipage/links.html#link-type-canonical), [OWASP redirect warning](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)) | Email may use an authorized Provider message URL if the product explicitly accepts a mailbox-only Candidate. Never copy an arbitrary newsletter link merely to fill the field. |
| **Publisher** | Optional. Accept a documented API publisher/owner, Atom author (including feed inheritance), RSS author/source extension under an adapter contract, email From, or explicit structured page author/publisher. RFC 5322 defines From as the message author, which may be a sending system rather than the publication brand. ([Atom author rules](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.1.2), [email From semantics](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6.2), [Schema.org Article](https://schema.org/Article)) | Store null and display no publisher. Do not infer a brand from hostname or logo. |
| **Publication time** | Nullable and semantically strict. Accept only a Provider publication field, Atom `published`, RSS `pubDate`, email Date/internal receive time with the adapter's declared meaning, or unambiguous structured page `datePublished`. ([Atom `published`](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.9), [RSS `pubDate`](https://www.rssboard.org/rss-specification#ltpubdategtSubelementOfLtitemgt), [RFC 5322 Date](https://www.rfc-editor.org/rfc/rfc5322.html#section-3.6.1), [Schema.org `datePublished`](https://schema.org/datePublished)) | Keep `publishedAt = null` and preserve `firstSeenAt`. If the one-month initial lookback cannot be enforced without publication time, that Follow target is unsupported for that initial-backfill contract. |
| **Likely Type** | Derive from Provider target/resource kind, documented API type, MIME/enclosure, or strong structured metadata. oEmbed has `photo`, `video`, `link`, and `rich` response types; these are extraction evidence, not necessarily a one-to-one Unshelf Type mapping. ([oEmbed response types](https://oembed.com/#section2.3)) | Use Unshelf `other` when the adapter cannot make a deterministic mapping. Do not invoke a model merely to avoid `other`. |
| **Thumbnail** | Optional. Accept a Provider/API thumbnail, RSS/Atom media extension under an adapter contract, oEmbed thumbnail, Open Graph image, or Schema.org image. Validate scheme, resolved host, and size before proxying or downloading. Open Graph and oEmbed define image/thumbnail fields but do not make them universal page requirements. ([Open Graph basic metadata](https://ogp.me/#metadata), [oEmbed thumbnail](https://oembed.com/#section2.3.4), [Schema.org Article image](https://schema.org/Article)) | Store null; a missing image is not extraction failure. |
| **Excerpt** | Optional and Provider-supplied. Accept an API snippet, Atom summary, RSS description/summary convention, oEmbed/structured description, or a literal excerpt field. Atom defines summary as a short summary/abstract/excerpt but permits absence. ([Atom summary](https://www.rfc-editor.org/rfc/rfc4287.html#section-4.2.13), [RSS description](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt)) | Store null. Do not ask the model to summarize; that would create new content rather than extract Provider metadata. |

The operational extraction result should additionally record: adapter and
extractor version; acquisition rung; requested and final URL/Provider endpoint;
HTTP status and validators or API cursor; fetch/render time; accepted record
count; missing optional-field counts; required-field failures; a bounded content
hash; and, for model output, model/prompt/schema version and evidence selectors or
spans. These are proposed operational facts, not new Candidate domain fields.

## Deterministic validation and drift detection

Every acquisition run should pass the following gates before it mutates Candidate
or Discovery state:

1. **Eligibility.** The adapter and target have a documented permitted method,
   required credentials/scopes, and rate/quota policy. A `401`, `403`, login wall,
   paywall, consent wall, CAPTCHA, or robots disallow is not an invitation to move
   down the ladder.
2. **Network.** Allow only declared schemes and hosts; resolve and reject loopback,
   link-local, private, metadata-service, and other internal addresses; repeat the
   check after redirects; cap redirects, bytes, decompressed bytes, time,
   subrequests, and concurrency. OWASP identifies user-influenced server fetches as
   SSRF and recommends allowlists where possible plus explicit redirect/DNS
   defenses. ([OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html))
3. **Parse.** Verify status and media type, use hardened parsers, and bound input.
   RSS/Atom are untrusted XML; OWASP recommends disabling DTDs, external entities,
   external DTD loading, and XInclude and limiting entity expansion. ([OWASP XXE
   prevention](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html))
4. **Shape.** Validate the upstream response and the adapter result against
   explicit schemas. Reject duplicate or missing required fields and ambiguous
   selector cardinality.
5. **Semantics.** Enforce Provider identity, allowed URL origins, timestamp
   parsing/ranges, enum mapping, field length, and the distinction between
   publication and observation time. Model schema validity is not semantic
   validity. ([Structured Outputs limitations](https://openai.com/index/introducing-structured-outputs-in-the-api/#limitations-and-restrictions))
6. **Reconcile.** Upsert Candidates by exact Provider identity and record a new
   Discovery only under the settled Follow lifecycle. Advance a cursor/validator
   only after the accepted batch is durable.

An authoritative structured response with zero results may be success. A scraper
that unexpectedly finds zero entry containers, loses a required selector, lands
on a different origin, or sees a page-template fingerprint it does not recognize
is a failed run. Treating those cases as an empty feed would silently hide drift.

Each HTML/browser adapter should have permitted, minimized fixtures for at least:
normal results, zero results, pagination/lookback boundary, optional metadata
missing, malformed entry, template change, login/challenge page, redirect, and a
duplicate Provider identity. Production monitoring should distinguish retrieval,
auth/quota, parse, schema, semantic, drift, and model failures and expose the last
successful refresh separately from the last attempted refresh.

Full pages need not be retained to achieve this. Production can discard the body
after projection while keeping hashes, bounded diagnostics, and field-level
provenance. Test fixtures may use minimized or synthetic fragments that preserve
the extraction contract without becoming a shadow content archive.

## The browser boundary

Browser rendering is deterministic acquisition infrastructure, not AI. It earns a
Provider-specific rung only when static HTTP lacks the metadata because the site
materializes it with JavaScript.

Use a fresh browser context per User/Provider run. Playwright browser contexts are
incognito-like profiles with separate cookies, local storage, and session storage,
but that isolation is a browser-state primitive rather than the entire process and
network security boundary. Chromium's own sandbox design assumes rendered input
may be malicious and relies on OS-level restrictions. ([Playwright browser-context
isolation](https://playwright.dev/docs/browser-contexts), [Chromium sandbox design](https://chromium.googlesource.com/chromium/src/+/main/docs/design/sandbox.md))

Consequently, production rendering should also run in a disposable, least-
privileged process/container with no filesystem secrets, no cloud metadata access,
no arbitrary outbound network, no shared authenticated profile, and hard resource
limits. These are design requirements inferred from the browser threat model and
the SSRF controls above, not guarantees supplied by Playwright.

Readiness must be an explicit adapter contract such as “the results region is
present and its loading state ended,” with a timeout and an expected cardinality.
Playwright labels `networkidle` discouraged for readiness and notes that service
workers can make network events invisible to ordinary routing, so “the network
went quiet” is not a reliable generic extraction contract. ([Playwright `goto`](https://playwright.dev/docs/api/class-page#page-goto-option-wait-until),
[Playwright network caveat](https://playwright.dev/docs/network#missing-network-events-and-service-workers))

## When model assistance is viable

### Acceptable shape

A model-assisted adapter may be piloted when all of these are true:

- access and rendering are already permitted and deterministic;
- a deterministic Provider reference exists before the model call;
- the page exposes Candidate metadata to a human but lacks stable machine-readable
  structure;
- the input is a bounded, inert snapshot or selected DOM/text subtree—not a live
  authenticated browser—and is explicitly marked untrusted;
- the model has no tools, credentials, memory, cross-User context, or authority to
  follow links;
- the output uses a strict schema with nullable optional facts and includes a
  literal evidence span/selector for every non-null value;
- deterministic code verifies identity, URLs, timestamps, field bounds, evidence
  containment, and consistency with any structured metadata;
- a versioned evaluation corpus measures required-field accuracy, false acceptance,
  and drift across real page variants before production use;
- model, prompt, schema, budgets, timeout, and retry count are pinned and observable;
  and
- validation failure leaves the prior cursor/results intact and surfaces a
  Provider refresh failure.

Structured Outputs is useful here because it constrains output to a supplied JSON
Schema and provides explicit refusal handling, but OpenAI also documents refusal,
truncation, and incorrect values as remaining failure cases. It is therefore one
validation layer, not the acceptance oracle. ([Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/#how-to-use-structured-outputs),
[limitations](https://openai.com/index/introducing-structured-outputs-in-the-api/#limitations-and-restrictions))

### Rejected shape

Declare the target unsupported rather than use an agent when any of these holds:

- the agent must decide what URL/account to access, bypass a challenge, or operate
  an authenticated session;
- Provider identity would be a title, generic normalized URL, content hash, or
  model-generated key;
- the agent must infer an absent publication date or publisher rather than select
  literal Provider evidence;
- no deterministic check can distinguish “no new material” from “the page changed”;
- prompts or page content can cause tools/actions, data disclosure, or cross-User
  access;
- correctness is assessed only through the model's self-reported confidence;
- retries or page size make worst-case cost/latency unbounded; or
- the Provider's terms, robots policy, or access controls do not permit automation.

RFC 9309 is precise that robots rules are not access authorization, while also
standardizing crawler instructions that automated clients should honor. A missing
or permissive `robots.txt` therefore does not grant contractual permission, and a
disallow is not a barrier an agent should work around. ([Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html#section-1),
[security considerations](https://www.rfc-editor.org/rfc/rfc9309.html#section-3))

Prompt injection is an additional reason to keep model assistance non-agentic.
OpenAI recommends limiting an agent to only the data it needs, and Anthropic
recommends treating fetched pages/email as untrusted, separating them from
instructions, and applying least privilege. A metadata extractor needs no write
tools at all, so granting them would add risk without adding capability.
([OpenAI least-privilege guidance](https://openai.com/safety/prompt-injections/#tips-to-stay-safer),
[Anthropic indirect-injection guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks#indirect-prompt-injection))

## Recommended production decision

Adopt the following Provider-adapter contract in the later architecture ticket:

```text
refresh(Follow, priorCursor)
  -> AcquisitionResult {
       status: success | partial | failed
       cursor: nextCursor only after durable acceptance
       candidates: CandidateProjection[]
       failures: ResultFailure[]
       runProvenance: bounded operational metadata
     }

CandidateProjection {
  providerReference  // required, deterministic, Provider-scoped
  title              // required
  source             // required except an explicitly accepted mailbox-only case
  publisher?         // nullable; never inferred from hostname
  publishedAt?       // nullable; never replaced by firstSeenAt
  likelyType         // deterministic mapping; `other` is valid
  thumbnail?         // nullable
  excerpt?           // nullable and Provider-supplied
  fieldEvidence      // adapter path or literal source span; operational, bounded
}
```

The exact TypeScript/API shape remains for the production architecture decision;
the important seam is that acquisition mechanics and evidence remain behind the
Provider adapter while Candidate semantics stay shared.

Provider support should be an explicit capability declaration, for example:

```text
identity: api-id | atom-id | rss-guid | mailbox-uid | provider-permalink
transport: api | imap | atom | rss | http | browser
interpretation: structured | semantic-selector | model-assisted
supportsPublishedAt: yes | no
supportsOneMonthLookback: yes | no
authentication: public | oauth | delegated-mailbox
```

That declaration prevents a Follow setup UI from promising a one-month lookback,
thumbnail, or publication ordering that the selected target cannot actually
support.

## Implications for the remaining map

- **Choose the first-slice Provider and Follow contract:** require an official API
  or feed identity for YouTube; do not introduce the browser/model rungs merely to
  save API integration work.
- **Define Discover refresh, authorization, and failure behavior:** distinguish
  last attempted from last successful refresh, partial record failures from run
  failure, authoritative empty from extraction drift, and credential/quota/access
  errors from parse/model errors.
- **Choose the production Discover architecture:** make cursor advancement,
  Candidate projection validation, adapter capability declarations, network/
  browser isolation, bounded provenance, and extraction versioning explicit.
- **Write the Discover implementation handoff:** state that full source content,
  prompts, screenshots, and rendered DOM are transient and are not Candidate data
  or routine logs.

No new generic decision ticket is required: the newly sharp contracts fit the
existing Follow-contract, refresh/failure, and production-architecture tickets.
If feasibility research later proposes model assistance for one concrete
Provider, create a Provider-specific research/prototype ticket with a representative
evaluation corpus and acceptance thresholds; do not approve “agent extraction” as
a capability in the abstract.

## Primary sources

- IETF: [Atom Syndication Format, RFC 4287](https://www.rfc-editor.org/rfc/rfc4287.html)
- RSS Advisory Board: [RSS 2.0 specification](https://www.rssboard.org/rss-specification)
- IETF: [HTTP Semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- W3C: [WebSub Recommendation](https://www.w3.org/TR/websub/)
- IETF: [IMAP4rev2, RFC 9051](https://www.rfc-editor.org/rfc/rfc9051.html)
- IETF: [Internet Message Format, RFC 5322](https://www.rfc-editor.org/rfc/rfc5322.html)
- Google: [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push), [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync), and [Message resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages#Message)
- WHATWG: [HTML Living Standard: links](https://html.spec.whatwg.org/multipage/links.html)
- Schema.org: [Article](https://schema.org/Article)
- Open Graph: [protocol](https://ogp.me/)
- oEmbed: [specification](https://oembed.com/)
- Playwright: [browser contexts](https://playwright.dev/docs/browser-contexts), [network](https://playwright.dev/docs/network), [locators](https://playwright.dev/docs/locators), and [`page.goto`](https://playwright.dev/docs/api/class-page#page-goto)
- Chromium: [sandbox design](https://chromium.googlesource.com/chromium/src/+/main/docs/design/sandbox.md)
- IETF: [Robots Exclusion Protocol, RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)
- OWASP: [SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) and [XXE prevention](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
- OpenAI: [prompt injections](https://openai.com/safety/prompt-injections/) and [Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- Anthropic: [mitigating indirect prompt injection](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks#indirect-prompt-injection)
