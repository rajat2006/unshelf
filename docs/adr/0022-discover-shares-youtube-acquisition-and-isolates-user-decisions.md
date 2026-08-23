# Discover shares YouTube acquisition and isolates User decisions

Recurring Discover for public YouTube channels shares Provider-owned channel and
video data while keeping each Follow, Candidate decision, and Item User-owned.
This split, chosen in [#536](https://github.com/rajat2006/unshelf/issues/536)
and implemented by [#546](https://github.com/rajat2006/unshelf/pull/546), avoids
repeating the same YouTube quota and storage cost for every User without weakening
the tenant isolation established by [ADR-0001](./0001-multi-tenant-from-day-one.md).

## Decision

A supported channel URL resolves to one immutable YouTube channel identity.
Unshelf stores one shared target for that channel and one shared result for each
exact YouTube video identity. The scheduler inside the API process claims each due
actively followed channel, performs YouTube I/O outside a database transaction,
publishes the shared results, and fans out one Candidate mapping to every active
follower. A short database lease and uniqueness constraints make concurrent or
repeated ticks safe; this first slice has no manual or app-open acquisition and no
separately deployed worker.

Follow and Candidate state remain private. A Candidate directly owns exactly one
of _pending_, _kept_, or _rejected_. The active model has no separate Discovery
occurrence, presence/reappearance history, snapshot-application layer, preview
receipt, or decision ledger. Preview may upsert reusable shared channel and video
data, but it creates no private state. Confirming creates or restores the Follow
and seeds recent Candidates from that stored data without a second YouTube
request.

The Library owns the mapping from one User and one exact Provider identity to an
Item. Keep and eligible manual Capture use that mapping to create or reuse the
same Item; title or raw Source similarity is never identity. Provider refreshes
may update shared video data but never silently rewrite User-confirmed Item fields.

YouTube-specific URL resolution, fetching, eligibility, retry, and normalization
stay behind one concrete YouTube client within the Discover module. Stored
identities remain Provider-namespaced, but there is no Provider registry, generic
adapter contract, generic target resolver, or generic fetch-results framework.
Those abstractions must be reconsidered from the needs of a second real Provider.

## Considered alternatives

- Fetching once per Follow was rejected because Users following the same public
  channel would consume duplicate quota for identical data.
- Sharing Candidates or decisions was rejected because they represent private
  learning intake, not public Provider data.
- The earlier design in [#385](https://github.com/rajat2006/unshelf/issues/385)
  and draft [PR #395](https://github.com/rajat2006/unshelf/pull/395) added generic
  Provider orchestration, snapshots, Discovery occurrences, durable preview
  receipts, request-driven acquisition, and retention machinery. It was not
  merged and was rejected as speculative complexity for the first Provider.

YouTube data refresh and retention compliance remain a separate decision and
delivery concern tracked by
[#534](https://github.com/rajat2006/unshelf/issues/534).
