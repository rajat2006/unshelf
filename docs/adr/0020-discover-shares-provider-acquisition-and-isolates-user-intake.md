# Discover shares Provider acquisition and isolates User intake

The Discover decision map
[#379](https://github.com/rajat2006/unshelf/issues/379) establishes a
YouTube-first recurring-discovery slice. Several Users may Follow the same public
YouTube channel. Fetching that channel separately for every User would waste
quota and create conflicting copies of the same Provider data, while sharing
Candidates, Discoveries, decisions, or Items would violate Unshelf's tenant
boundary.

The architecture must also preserve immediate manual Capture, keep Provider
rules behind a replaceable boundary, execute acquisition without a permanent
worker, make concurrent requests safe, and remove expired YouTube API data
without deleting User history or approved Library fields.

## Decision

Discover is one deep module under `apps/api/src/discover/`. Express routes,
the web application, and maintenance commands call its use cases; they never
coordinate Provider adapters, repositories, retries, transactions, retention,
or Item linking themselves.

Its application-facing facade uses explicit use-case names:

```ts
interface DiscoverModule {
  prepareFollow(input: PrepareFollowInput): Promise<FollowPreview>;
  confirmFollow(input: ConfirmFollowInput): Promise<FollowConfirmation>;
  readWorkspace(input: ReadDiscoverWorkspaceInput): Promise<DiscoverWorkspace>;
  acquireAndApply(input: AcquireAndApplyInput): Promise<AcquisitionSummary>;
  setFollowLifecycle(input: SetFollowLifecycleInput): Promise<FollowSummary>;
  decide(input: DecideDiscoveryInput): Promise<DiscoveryDecision>;
  purgeProviderData(input: PurgeProviderDataInput): Promise<PurgeReport>;
}
```

Routes obtain `userId` only from authenticated request state, validate external
input with Zod, call one facade method, map tagged domain failures, and serialize
the returned projection. Unexpected database and programming failures continue
through the existing error middleware and structured logger.

### Shared Provider acquisition, private User intake

Provider acquisition is shared at the narrowest scope for which the Provider
returns the same data. For first-slice YouTube, that scope is one resolved public
channel using Unshelf's one system API key.

- A **Provider target** is the shared YouTube channel.
- A **Provider result** is one shared internal record for a currently retained
  YouTube video identity. Its purgeable projection contains the title, canonical
  watch Source, publisher, publication time, thumbnail, likely Type, and other
  approved intake fields.
- A **Provider snapshot** is one atomically published, validated result set from
  an acquisition of that target.
- A **Provider acquisition attempt** records the shared fetch outcome, timing,
  coverage, checkpoint movement, and next eligible time. It is not a User action
  and is not stored on every Follow.
- A **Follow** remains User-owned and links one User to the shared target. Its
  `lastAppliedProviderSnapshotId` means that snapshot has been incorporated into
  that User's intake. It does not mean the User opened, viewed, or personalized
  the channel.
- A **Candidate**, **Discovery**, decision, and **Item** remain private to one
  User. One Candidate references the shared Provider result and may hold the
  nullable Item link for that User.

Thus five Users following the same channel share one target acquisition, one
Provider result per retained video identity, and one current projection. They
still have five Follows, five Candidates for a surfaced video, independent
Discoveries and decisions, and up to five private Items.

The first slice does not add a `providers` catalogue table or credential/account
tables. A code registry contains the system-owned `youtube` adapter. A later
adapter must declare whether its acquisition scope is system-wide, per Provider
account, or per User; data may be shared only inside that declared authorization
scope.

### Persistence

Shared acquisition tables use the `discover_` prefix and contain no `user_id`:

| Table | Ownership and purpose |
| --- | --- |
| `discover_provider_targets` | One internal target, Provider key and target kind, acquisition scope, nullable retained external target reference, current snapshot and latest-attempt pointers, Provider-owned checkpoint/coverage envelopes, and next eligible time. A partial unique constraint enforces the retained Provider target identity inside its acquisition scope. |
| `discover_provider_target_projections` | Purgeable current channel display metadata with Provider provenance, `fetched_at`, and `expires_at`. |
| `discover_provider_results` | Durable internal result id plus nullable exact Provider external reference. A partial unique constraint enforces `(provider, external_reference)` while the reference exists. |
| `discover_provider_result_projections` | Purgeable normalized video metadata with schema version, provenance, `fetched_at`, and `expires_at`. |
| `discover_acquisition_attempts` | Running and terminal acquisition facts, lease, outcome, bounded diagnostics, coverage, checkpoint movement, and published snapshot id. A partial unique constraint permits one running attempt per acquisition scope. |
| `discover_provider_snapshots` | One immutable publication header and monotonically increasing target-local sequence for a target and acquisition attempt. |
| `discover_provider_snapshot_results` | Ordered membership of internal Provider results in a snapshot. |

User-owned tables carry `user_id` and use composite ownership foreign keys in
the same style as existing Item membership:

| Table | Ownership and purpose |
| --- | --- |
| `discover_follows` | User, shared target, User-entered target URL, lifecycle, and nullable `last_applied_provider_snapshot_id`. `(user_id, provider_target_id)` is unique across every lifecycle so Follow again restores the same history. First-slice health is derived from the shared target's latest attempt rather than copied onto every Follow. |
| `discover_follow_previews` | A User-specific, opaque, 15-minute receipt that references one exact shared snapshot, creates no Follow, and may be consumed once. |
| `discover_follow_preview_results` | The at-most-ten eligible results shown by that exact preview. |
| `discover_candidates` | One User's relationship to a shared Provider result and nullable `item_id`. `(user_id, provider_result_id)` is unique, and a non-null Item link is unique. |
| `discover_follow_candidate_presence` | Whether one Candidate was present in the Follow's latest provably complete coverage, plus its appearance sequence and first/last surfaced snapshots. This is detection state, not a User decision. |
| `discover_discoveries` | One appearance occurrence of a Follow surfacing a Candidate, its appearance sequence, `new`, `seen`, `kept`, or `dismissed` state, and state timestamps. `(follow_id, candidate_id, appearance_sequence)` is unique. |
| `discover_idempotency` | User, operation kind, request id, and stable result needed to replay a completed mutation safely. |

Every User-owned cross-table reference includes `user_id`; a Discovery cannot
join another User's Follow or Candidate, and a Candidate cannot link another
User's Item. Check constraints enforce valid lifecycle, outcome, and Discovery
state/timestamp combinations. Shared searchable and constrained facts are typed
columns. Only Provider-private target, checkpoint, coverage, and projection
payloads use versioned JSONB envelopes decoded inside the Provider adapter.

Provider result identity can be enforced only while its external reference is
retained. Retention leaves the internal Provider result and Candidate ids as
tombstones. If YouTube later returns the same video after its raw reference has
been purged, Unshelf creates a new Provider result and Candidate rather than
inventing a hash or matching title/Source text.

### Follow preview and confirmation

`prepareFollow` validates a public channel URL through the YouTube adapter,
acquires or reuses a shared snapshot, and stores a User-specific preview receipt
for at most ten eligible videos from the rolling prior 30 days. It does not
create a Follow. Multiple Users may reference the same shared snapshot through
different preview receipts.

`confirmFollow` locks and consumes the exact receipt in one transaction. It
creates or reactivates the User's one Follow for that target and creates
Discoveries for exactly the previewed results. An expired, already-consumed, or
no-longer-verifiable receipt returns a tagged failure; confirmation never swaps
in a newly fetched set that the User did not see.

Provider snapshots are ordered per target. An active Follow applies every
available snapshot after `last_applied_provider_snapshot_id` in order, then moves
that pointer in the same transaction. Repeated snapshots containing a result
that remains present update its presence row but create no new Discovery. Only
provably complete coverage may mark a result absent; a later reappearance
increments the appearance sequence and creates a new Discovery. Partial coverage
never invents disappearance.

Paused or removed Follows do not apply snapshots. Resume applies the current
snapshot and advances directly to it, so currently present results may surface
but intermediate results that disappeared during the pause are not backfilled.

### One-shot acquisition endpoint

The authenticated web shell invokes acquisition once on its first startup in a
browser tab, after rendering currently stored Discover data. Manual workspace
and per-Follow actions invoke the same operation with a different trigger. The
technical operation is acquisition and application; **refresh** remains only a
possible UI label.

`POST /api/discover/acquisitions` runs `acquireAndApply` in that HTTP request. It
does not enqueue a durable job and there is no continuously running or scheduled
Provider worker. App-open acquisition observes the shared target's latest
attempt and skips targets inside the 15-minute cooldown. Manual requests bypass
freshness but not an in-flight claim, Provider quota/throttle gates,
`Retry-After`, or next-eligible time.

Requests for distinct targets run with bounded concurrency through
[`p-limit`](https://github.com/sindresorhus/p-limit).
Concurrent requests for the same acquisition scope coalesce through the
PostgreSQL running-attempt constraint and lease: one request owns the YouTube
call; the others join its terminal result instead of consuming quota again.
A process restart may abandon the HTTP operation, but its short lease makes the
attempt reclaimable by a later request. A client disconnect does not cancel the
bounded server operation, so closing a tab does not stop it; a process failure
can stop it safely. No correctness depends on an in-memory promise.

YouTube acquisition has a 30-second total attempt budget.
[`p-retry`](https://github.com/sindresorhus/p-retry) performs at most two retries
after the initial call with bounded exponential backoff and jitter. Only network
errors, timeouts, 408, 429, and 5xx are retryable. Provider `Retry-After`, reset,
and quota signals override generic timing. A PostgreSQL Provider gate shares
YouTube quota exhaustion across processes without blocking other Providers.

### Transaction boundaries

No database transaction remains open while Unshelf waits for YouTube.

1. **Claim transaction.** Insert a running acquisition attempt and lease, or
   observe the existing running attempt for that acquisition scope; commit.
2. **Provider I/O.** Call and validate YouTube outside a transaction.
3. **Publication transaction.** Lock the target and attempt; upsert exact
   Provider results and fresh projections, publish the snapshot and membership,
   record the terminal attempt, and move checkpoint/coverage and target pointers
   together. Compare-and-set on the attempt/generation prevents an older call
   overwriting newer data.
4. **Per-Follow application transaction.** For each requesting User's Follow,
   lock the Follow, apply its available ordered snapshots, upsert Candidates,
   presence, and Discoveries, and advance `last_applied_provider_snapshot_id`
   together. Repeating the same application is a no-op. One User's failure cannot
   roll back the shared snapshot or another User's state.
5. **Decision transaction.** Keep or Dismiss locks the selected Discovery and
   Candidate and resolves only that occurrence. Replaying the same request is a
   no-op; a different terminal decision returns `decision_conflict`.

Publication accepts individually valid records from a partial Provider response
and records rejected-record counts. It advances a checkpoint only through
coverage that is both provably complete and durably committed. An authoritative
empty response may publish; unrecognized shape or extraction drift fails without
advancing coverage. Provider failure never deletes stale projections or changes
Follow lifecycle or Discovery decisions.

### Keep and manual Capture

Keep requires an explicit User confirmation of the currently proposed title,
canonical YouTube watch Source, and Type `video`. In one transaction it creates
the User's Item, stores those approved fields durably on the existing shared
`items` row, sets `discover_candidates.item_id`, and marks only the selected
Discovery kept. Later Provider acquisitions update only the purgeable projection
and never rewrite Item fields.

Manual Capture remains its existing immediate path and does not call Discover.
It continues to store User input verbatim and does not deduplicate matching raw
title or Source text. Discover may reuse an existing Item only while an exact
retained Provider identity proves the match; recognition failure never blocks
Capture.

An internal, non-route hook may parse a supported canonical YouTube Source
without fetching Provider data, establish its exact Provider identity, and
create the User's Candidate-to-Item link. It stores the link only on the
Candidate; `items` does not gain a reverse Discover or Provider column. Generic
Source equality and title equality never invoke this path.

The YouTube retention research in
[#397](https://github.com/rajat2006/unshelf/issues/397) remains the evidence for
policy ambiguity, but its conservative release block on every approved Item copy
is superseded by this product decision: explicit Keep confirmation is the
boundary at which the title, canonical watch URL, and Type become durable
User-approved Item fields. This records the accepted product and provenance
boundary; it does not claim field-specific written approval from YouTube. A
future one-click “Don't ask again” preference is tracked separately in
[#405](https://github.com/rajat2006/unshelf/issues/405) and is not part of this
map.

### Retention and Provider purge

YouTube-origin target/result projections, external references, and checkpoint
payloads receive `fetched_at` and `expires_at` no later than 30 calendar days
after a real successful fetch. A successful acquisition replaces the projection
and its expiry; it may not merely extend the old row.

A deployment-scheduled one-shot API maintenance command invokes
`purgeProviderData({ kind: "expire_due" })` daily and deletes projections due at
29 days, leaving a safety margin before the 30-day boundary. It is retention
housekeeping, not Provider polling, and makes no YouTube request. Cleanup uses
bounded indexed batches and generation predicates so it cannot erase a
concurrently refreshed projection.

The same module exposes a complete `youtube` suspension/termination purge. It
first gates new YouTube acquisition, then removes every YouTube-origin
projection, external reference, and Provider-private payload. Internal ids,
Follow lifecycle, Discovery history, Candidate-to-Item links, and User-approved
Item fields survive.

### Provider adapter, validation, and secrets

An internal `ProviderAdapter` port is the only substitutable external boundary.
The first production adapter uses the official YouTube Data API and a deterministic
fake implements the same contract in tests. The adapter owns target URL
resolution, eligibility, bounded preview/acquisition, Provider paging,
checkpoint/coverage interpretation, response Zod schemas, normalization, and
Provider error translation. It cannot persist, mutate User lifecycle, create
Items, or decide transaction boundaries.

`YOUTUBE_API_KEY` is server-only configuration injected into the adapter. The
API fails startup when Discover is enabled without it, adds it to diagnostic
redaction secrets, never stores it in PostgreSQL, never accepts it from a User,
and never includes it in request URLs written to logs. Rotation is a deployment
secret change and process restart.

Structured attempt logs contain only internal target/attempt ids, trigger,
outcome, duration, accepted/rejected counts, coverage movement, retry count, and
bounded error classification. They exclude raw Provider payloads, credentials,
video metadata, and User-entered URLs. Metrics distinguish complete, partial,
failed, throttled, and Provider-unavailable outcomes and alert on quota gating,
drift, lease recovery, and approaching retention deadlines.

### Web integration and rollout

The web application adds `/discover`, enables the existing Discover navigation
control, and gives `DiscoverSurface` local request state consistent with the
current room architecture. It reads stale stored data immediately, invokes the
one-shot acquisition endpoint, and rereads after the request settles. Skeletons
are reserved for a true first load. Provider failures remain isolated by Follow.

The selected sticky workspace, Follow filter rail, three-column Candidate grid,
and phone reflow remain the visual contract. The Shell gains a Discover-specific
full-height composition so only the Candidate feed scrolls. Canonical Item route
state gains Discover as a retained background. Keep opens a confirmation using
the proposed title, URL, and Type; #405 may later bypass that confirmation by
User preference.

Rollout is additive and performs no backfill:

1. Deploy schema, module, key configuration, and the daily purge command with
   Discover disabled.
2. Verify migrations, a real production-key health probe that stores no payload,
   quota gate, redaction, and retention dry-run counts.
3. Enable the API and web route/navigation together through deployment
   configuration. Existing Items and manual Capture are untouched.
4. Rollback disables Discover acquisition and navigation but leaves additive
   tables and User history intact; the retention command continues until the
   stored Provider projections are purged.

## Verification boundary

Module tests use the existing migrated PostgreSQL Testcontainers harness and a
deterministic Provider adapter, not mock repositories. They cover tenant
constraints, two Users sharing one acquisition, cross-process claim races and
lease recovery, preview expiry/confirm races, partial publication/checkpoint
recovery, repeated application, Keep/Dismiss conflicts, Item ownership, cleanup
racing a fresh projection, and complete Provider purge.

Adapter contract fixtures cover normal, empty, paginated, duplicate identity,
missing optional data, invalid record, malformed shape, quota/throttle, and
timeout responses. Browser coverage exercises app-open acquisition, stale data
during failure, combined and Follow-filtered intake, Keep confirmation, the
canonical Item return context, desktop/mobile scrolling, and unchanged manual
Capture including duplicate Sources.

## Consequences

Sharing acquisition sharply reduces YouTube calls and storage duplication while
keeping every User decision private. Short transactions make network delay and
one User's state independent of shared publication. The module facade gives the
web and routes a small product-shaped vocabulary while keeping persistence and
Provider variability local.

The design adds snapshots, attempts, leases, idempotency, and purgeable
projections before a second Provider ships. That machinery is justified by
multi-User quota sharing, request failure recovery, exact preview confirmation,
and mandatory retention. It deliberately does not add a durable worker,
scheduled Provider polling, generic credential catalogue, repository interfaces
for local PostgreSQL, fuzzy identity, or cross-provider grouping.

After an external reference expires, later reacquisition cannot prove continuity
with its tombstone. The accepted cost is a new Provider result/Candidate rather
than retaining prohibited identity or silently merging on title or URL.

## Considered alternatives

- Fetching once per Follow was rejected because Users of the same public channel
  would receive identical Provider data while duplicating quota, attempts, and
  projections.
- Sharing Candidates or Discoveries was rejected because they own User-specific
  intake and decisions.
- A durable background worker or scheduled Provider polling was rejected; the
  selected operation is request-driven and one-shot.
- Holding one transaction around the YouTube request was rejected because it
  would retain locks across network latency and failure.
- Storing Provider rows directly on Items was rejected because one shared video
  may be proposed independently to many Users, while Items are private and exist
  only after Keep or Capture.
- Generic public repository and Provider CRUD interfaces were rejected because
  they would expose implementation variability instead of hiding it inside the
  Discover module.
