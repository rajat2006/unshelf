# Source inspection release qualification

Source inspection ships through a private corpus qualification, not live-Internet
CI. The evaluator runs the production inspection service and guarded transport
from the intended deployment region, makes three paced observations per case,
and writes one aggregate report. It never writes an Item or opens a database.

Keep the manifest outside the checkout, image, build context, CI artifacts, and
logs. It contains real Sources and accepted titles. The report is safe to retain
or commit because it contains only corpus version, qualification commit, region,
class aggregates, numeric gates, and a rollout recommendation.

## Deterministic corpus

The committed Vitest corpus uses minimal synthetic markup, headers, addresses,
streams, and controlled promises. It is the release prerequisite for every
private run:

| Required class | Committed coverage |
| --- | --- |
| Metadata precedence, attribute case/order, entities, arrays/graphs, primary entities, agreement and conflict | `apps/api/src/source-inspections/generic-inspector.test.ts` |
| Declared, BOM, and HTML encodings; gzip; malformed and oversized JSON-LD; metadata and decompression limits | `apps/api/src/source-inspections/generic-inspector.test.ts` |
| YouTube route, mixed identity, malformed identifier, supported-host, and Community Post behavior | `apps/api/src/source-inspections/classifier.test.ts`, `service.test.ts` |
| Fixed-origin oEmbed response, compression, terminal, limit, timeout, and cancellation behavior | `apps/api/src/source-inspections/youtube-title-inspector.test.ts` |
| Public-address validation, pinning, CNAME/address mixtures, redirects, terminal classes, transfer limits, deadline, and cancellation | `apps/api/src/source-inspections/guarded-transport.test.ts`, `node-network.test.ts` |
| Admission saturation, refill, redirect lease, and idempotent release | `apps/api/src/source-inspections/admission-gate.test.ts`, `service.test.ts` |
| Stale response, replacement, Add, close, Retry, ownership, and three-second browser settlement | `apps/web/src/shell/CaptureOverlay.test.tsx` |
| Authentication, strict validation, no-write behavior, redaction, completion allowlist, and abort | `apps/api/test/source-inspections.test.ts` |

Run `turbo run typecheck` and `turbo run test` at the exact commit being
qualified. Do not set the evaluator's three qualification flags unless those
commands pass and the listed client-lifecycle and invariant cases were not
skipped. Live third-party Sources do not belong in these suites.

## Private manifest contract

The input is strict JSON with `schemaVersion: 1`, a stable `corpusVersion`, and a
`cases` array. Each case has a unique opaque `id`, one `sourceClass`, the exact
public `source`, and an explicit `expected` object:

```json
{
  "schemaVersion": 1,
  "corpusVersion": "2026.08.1",
  "cases": [
    {
      "id": "case-001",
      "sourceClass": "generic_title_type",
      "source": "https://public.example/material",
      "expected": {
        "outcome": "suggested",
        "acceptedTitles": ["Publisher title"],
        "type": "article"
      }
    }
  ]
}
```

`acceptedTitles` may contain up to eight nonblank alternatives of at most 512
Unicode code points when a publisher legitimately varies the title. Expectations
use the existing Unshelf Types. The supported classes and minimum distribution
are:

| `sourceClass` | Expected shape | Minimum |
| --- | --- | ---: |
| `generic_title_type` | title alternatives and strong expected Type | 8 |
| `generic_title_only` | title alternatives, no expected Type | 10 |
| `generic_manual_fallback` | `unavailable`, no title or Type | 10 |
| `youtube_video` | title alternatives and Type `video` | 8 |
| `youtube_playlist` | title alternatives and Type `playlist` | 6 |
| `youtube_community_post` | Type `other`, no title | 3 |
| `youtube_unresolved` | `unavailable`, no title or Type | 3 |

The corpus must contain at least 60 cases, including at least 20 title-capable
generic cases. At least ten of those must be title-only. Cases should be sampled
from real Capture behavior and cover blocked origins, missing metadata,
redirect/timeout behavior, and unsupported content within the generic fallback
class.

The validator refuses unknown fields, missing expected classes, duplicate or
unstable identities, non-HTTP(S) and non-host Sources, IP literals, local/private
hostname forms, alternate ports, embedded credentials, bearer/JWT-like values,
and query parameter names associated with credentials or signatures. Do not use
authenticated/private Sources, expiring share links, signed media links, or any
Source whose public status is uncertain. Validation is an outer safety check;
the release owner remains responsible for reviewing every case before a run.

## Run from the deployment region

Mount or otherwise provide the private manifest outside the repository and run
the evaluator from the same region and network topology as the target API. The
production API may remain disabled while this separate evaluator process
exercises the real strategies. The runtime exact-host deny list still applies.

```sh
pnpm source-inspection:evaluate -- \
  --manifest /secure/unshelf/source-inspection-corpus.json \
  --report /secure/unshelf/source-inspection-release-report.json \
  --region production-primary \
  --commit 0123456789abcdef0123456789abcdef01234567 \
  --deterministic-corpus-passed \
  --client-lifecycle-passed \
  --invariants-passed
```

The manifest and report paths must be absolute, and the evaluator refuses a
manifest path inside the checkout. It uses one synthetic evaluation User,
starts attempts sequentially at least three seconds apart, performs exactly
three observations per case, and applies the same process/User/hostname admission
boundary. A lost cancellation race is recorded as timeout after three seconds.
Expect a minimum 9-minute run for 60 cases.

The command exits nonzero for invalid input or a blocking gate. It exits zero for
`release` and for `release_without_oembed_titles`; the latter is approval only
with `SOURCE_INSPECTION_YOUTUBE_OEMBED_DISABLED=true`.

## Report and fixed gates

The report contains no case identity, Source, host, title, redirect, fetched
value, suggestion, address, or reversible host fingerprint. Each source class
reports only case/observation counts, correct and incorrect totals, timeout and
terminal-code totals, and caller-visible p50/p95/p99 timing. The evaluator checks
the PRD's fixed gates without rewriting the manifest or thresholds:

- all client observations settle by 3,000 ms and server completions by 2,500 ms;
- suggestion p50 is at most 1,000 ms and p95 at most 2,500 ms;
- incorrect title and Type counts are zero;
- generic expected-title and strong-Type extraction are at least 90%;
- generic manual fallback, supported YouTube Type, Community Post network-free
  behavior, and unresolved YouTube behavior are 100%;
- enabled oEmbed title extraction is at least 90%;
- timeout rate is at most 10% in each suggestion-capable generic and YouTube
  class; and
- deterministic, client-lifecycle, safety, privacy, cancellation, limit, and
  no-write qualification evidence is 100% passing.

An oEmbed title correctness, extraction, or timeout failure produces
`release_without_oembed_titles` only when every other gate passes. Any generic
failure, privacy or safety failure, deadline escape, incorrect Type, Community
Post network acquisition, or failed deterministic invariant blocks release.
Classify a mismatch as product-corpus drift, expected safe fallback, extraction
defect, safety refusal, origin refusal, or infrastructure defect before changing
code or corpus. Threshold changes require a follow-up decision.

## Rollout and first 48 hours

1. Deploy with `SOURCE_INSPECTION_DISABLED=true` and
   `SOURCE_INSPECTION_YOUTUBE_OEMBED_DISABLED=true`. Confirm ordinary manual and
   offline Capture still creates only the current title, Type, and exact Source;
   there is no schema migration or inspection persistence.
2. Run the deterministic suites and private corpus from the intended region.
   Retain only the aggregate report. A `blocked` recommendation stops rollout.
3. For `release` or `release_without_oembed_titles`, set
   `SOURCE_INSPECTION_DISABLED=false` while keeping oEmbed disabled. Redeploy,
   verify generic suggestions and local YouTube Type remain advisory, and verify
   manual Capture remains available on every fallback.
4. Enable oEmbed separately only after a `release` report and explicit owner
   acceptance of the recorded title-retention policy risk. Redeploy with
   `SOURCE_INSPECTION_YOUTUBE_OEMBED_DISABLED=false`.
5. For 48 hours, review only strategy-separated duration percentiles,
   suggested-field rates, and terminal-code rates. Do not join completion events
   to request payloads or create a Source-derived dimension.
6. Disable oEmbed for its isolated title-policy, correctness, timeout, or origin
   regression. Disable Source inspection globally for any privacy leak,
   safety-boundary failure, deadline escape, incorrect Type, or uncertain scope.
   Use the exact-host deny list only when one origin is conclusively the complete
   scope. Follow the incident procedure in
   [Source inspection operations](source-inspection-operations.md).

No Playwright, browser-suite, screenshot, visual-comparison, or live-Source CI
step is part of this qualification.
