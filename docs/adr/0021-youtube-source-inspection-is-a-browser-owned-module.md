# YouTube Source inspection is a browser-owned deep module

YouTube-only Source inspection lives in one web-owned deep module beside Capture
and acquires optional titles directly from YouTube's fixed-origin oEmbed endpoint.
We chose this architecture because conservative local classification plus one
bounded credentialless request needs neither an authenticated Unshelf route nor
the risk and machinery of arbitrary-host inspection.

## Module and seam

The module presents one caller-facing interface:

```ts
prepareYouTubeSourceInspection(source: string):
  | null
  | {
      type: Type.Video | Type.Playlist;
      acquireTitle(signal: AbortSignal): Promise<string | null>;
    };
```

`null` means manual-only and guarantees zero inspection network requests. Behind
this seam, the module hides exact-host and route classification, identifier
validation, canonical video or playlist reconstruction, endpoint construction,
title acquisition, limits, and fail-soft error mapping. It is fixed to the
eligible video and playlist contract and exposes no generic provider or transport
extension interface.

Capture owns the single 300 ms Source debounce, per-field User ownership, one
active controller and monotonically increasing Source revision, cancellation and
invalidation on Source change, Add, close, and unmount, the three-second visible
ceiling, accessibility announcements, and exact-Source submission through the
unchanged Item-create path. At debounce expiry it applies local Type only while
Type remains unowned and starts title acquisition only while Title can benefit.

## Fixed-origin acquisition

For an eligible resource, the module reconstructs a canonical HTTPS YouTube watch
or playlist URL from only the validated identifier. It constructs the constant
`https://www.youtube.com/oembed` request with `URL` and `URLSearchParams`,
`format=json`, and the canonical URL. It makes at most one CORS `GET` using
`credentials: "omit"`, `referrerPolicy: "no-referrer"`, `cache: "no-store"`, and
`redirect: "error"`.

The request sends no API key, Clerk token, cookie, authorization, original Source,
share parameter, or fragment. YouTube necessarily sees the client network context
and Unshelf Origin; that privacy trade-off is accepted.

Caller cancellation is composed with one 2.5-second acquisition deadline inside
the three-second visible ceiling. The module counts decoded `ReadableStream`
bytes and refuses bodies above 16 KiB. It accepts only HTTP 200 with a JSON
content type, decodes strictly as UTF-8, parses one JSON object, requires oEmbed
version 1.0 and a nonblank string title, normalizes outer and repeated whitespace,
and rejects titles above 512 Unicode code points. Every other response field is
ignored, especially embed HTML, thumbnails, author or provider values, and
representation type. An accepted title is rendered only through React's text
boundary.

Every status, CORS, redirect, network, deadline, abort, limit, encoding, JSON, or
title-shape failure resolves to `null`. Local Type survives and Capture quietly
asks for a manual title.

`VITE_YOUTUBE_OEMBED_ENABLED === "true"` is the fail-closed deploy-time switch for
title acquisition only. When false or absent, `acquireTitle` performs no request
while local Type classification and manual Capture continue. Changing this public
build-time configuration requires rebuilding and deploying the web image.

Source inspection adds no production telemetry, observer callback, or diagnostic
event and retains no Source, identifier, canonical URL, title, response, or
reversible fingerprint. Browser debounce plus one active cancellable attempt is
the complete admission control.

## Verification and consequences

Automated verification uses two surfaces without live YouTube calls:

1. Tests cross the module's public interface with controlled `fetch`,
   `ReadableStream`, aborts, and fake timers. They cover the complete route matrix,
   zero requests for manual-only or disabled cases, canonical construction,
   deadline and cancellation, response and limit failures, and successful video
   and playlist titles.
2. Rendered Capture tests replace the module with controlled results. They cover
   the 300 ms rule, local Type and optional Title, field ownership, Source
   replacement, cancellation, stale responses, quiet fallback, accessible status,
   Add while checking, and exact Source submission.

There is no Source-inspection server route, shared request or evidence contract,
generic metadata parser, arbitrary-host transport, DNS or redirect machinery,
server admission gate, production diagnostics, committed live-Source evaluator,
corpus runner, release runbook, or speculative provider seam. Live YouTube never
runs in CI. Future generic-page inspection must earn its own design.
