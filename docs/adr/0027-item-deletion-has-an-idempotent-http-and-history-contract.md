# Item deletion has an idempotent HTTP and explicit history contract

## Status

Accepted

## Context

The retained Item tombstone and cleanup transaction establish what deletion
means, but they do not make the public operation implementation-ready. A client
can lose a successful response, a canonical Item URL can outlive the Item, and
elapsed Daily Focus cannot represent deletion safely while its wire contract
always contains a live Item. The interaction also leaves the Item route, so its
success or recovery message must survive navigation without creating a new
application-wide notification system.

## Decision

### HTTP and replay

Delete one Item with `DELETE /api/items/:itemId`. The request has no body. Its
path parameter uses the shared Item UUID validation boundary.

- An active owned Item is deleted and answers `204` with no body.
- Repeating the request for that User's retained tombstone also answers `204`
  with no body. A replay neither reruns cleanup nor changes `deleted_at`.
- A missing or foreign Item answers `404` with `{ "error": "item not found" }`.
- A malformed Item id uses the existing `400` `invalid_request` response, and
  an unauthenticated request uses the existing `401` `unauthenticated`
  response.
- There is no deletion-specific conflict response. An unexpected failure uses
  the existing `500` `internal_server_error` response.

The deletion path is allowed to inspect an owned tombstone only to make replay
safe. Every ordinary Item read and mutation continues to make deleted, missing,
and foreign Items indistinguishable. A first successful request runs the
all-or-nothing transaction in ADR-0026; a successful replay proves only that the
owned Item is already absent and performs no write.

### Elapsed Daily Focus wire contract

The editable current-day `DailyFocus` contract remains separate. Elapsed reads
return a `DailyFocusHistory` with the same focus identity, owner, date, and
day-end completion totals, but with entries that carry only frozen historical
facts and an explicit availability variant:

```ts
interface DailyFocusHistory {
  id: DailyFocusId;
  userId: UserId;
  date: string;
  entries: DailyFocusHistoryEntry[];
  done: number;
  total: number;
}

interface DailyFocusSnapshot {
  title: string;
  type: Type;
  status: Status;
  partPercentage: number | null;
}

type DailyFocusHistoryEntry =
  | {
      availability: "available";
      itemId: ItemId;
      origin: DailyFocusOrigin | null;
      snapshot: DailyFocusSnapshot;
    }
  | {
      availability: "deleted";
      snapshot: DailyFocusSnapshot;
    };
```

Historical presentation uses `snapshot` in both variants rather than live Item
facts. The available variant's Item id permits canonical navigation and
reconsideration, and its origin supplies current navigation context. The
deleted variant cannot express an Item link, origin, or mutation target.

### Web client and recovery

The web client follows the existing authentication seam for this effort:

```ts
deleteItem(user: CurrentUser, itemId: ItemId): Promise<void>
```

Item reads and deletion expose an Item-specific failure distinction:
`not_found` for HTTP `404`, and `temporary` for network failures and every other
non-success response. Raw HTTP status and response bodies stay inside the API
client. Simplifying the cross-cutting Clerk credential plumbing is tracked
separately in
[Investigate redundant bearer-token plumbing in same-origin Clerk requests](https://github.com/rajat2006/unshelf/issues/581)
and is outside this deletion effort.

A temporary deletion failure keeps the confirmation open, restores dismissal
and retry, and says: “Couldn’t confirm whether this Item was deleted. Try
again.” It does not claim that nothing changed and does not issue an automatic
verification read. Retry is safe because the DELETE operation is idempotent.

On confirmed success, canonical detail closes and replacement navigation
returns to the exact retained Library, Today, Learning Plan, or elapsed-history
location. The destination reconciles before presenting success, so no active
surface flashes the deleted Item. Elapsed history keeps its entry and
immediately changes it to the inert deleted variant. A cold Item route returns
to Library.

Confirmed deletion carries the one-shot notice “Item deleted.” A canonical
read classified as `not_found` replaces the dead Item route with Library and
carries the neutral notice “That Item is no longer in your Library.” A deletion
classified as `not_found` returns to its retained destination, or Library when
cold, with that same neutral notice because the requested absence already
holds. The notice is route-local, consumed once, and does not persist across
reload, Back, or a later visit. Replacement navigation prevents Back from
reopening the dead Item route.

### Acceptance authority

Automated acceptance uses the repository's trusted Vitest seams:

1. API integration against PostgreSQL proves validation, authentication,
   ownership privacy, success and replay responses, the stable deletion
   timestamp, exact cleanup and preservation, transaction rollback, every
   feature-specific active-Item exclusion, both historical variants and their
   completion totals, and the decided Discover lifecycle.
2. Migration integration replays the legacy schema and proves exact snapshot
   backfill, preservation, tenant integrity, tombstone-aware exclusion, and
   retained history as required by ADR-0024.
3. Web component tests with Testing Library prove confirmation and dismissal,
   the locked pending state, ambiguous failure and retry, Item-specific error
   classification, every return destination, immediate background
   reconciliation, replacement navigation, the elapsed-history transition,
   and one-shot notices.
4. A manual smoke check proves the integrated desktop and phone success flow,
   responsive dialog, preserved background, stale-link recovery, and keyboard
   interaction.

The Playwright harness is not a trusted acceptance authority for this effort;
implementation neither adds nor relies on Playwright coverage. Acceptance also
excludes overlapping same-User mutation races, Restore, purge, bulk deletion,
and inferred Learning Plan topology reconnection.

## Considered options

- **Return a JSON acknowledgement.** Rejected because the client needs no
  deleted representation and a bodyless `204` matches an existing soft-delete
  boundary.
- **Return `404` for a repeated deletion.** Rejected because a lost first
  response would turn a safe retry into an ambiguous failure.
- **Verify every uncertain deletion with an automatic GET.** Rejected because
  idempotent retry resolves the uncertainty without a second protocol or extra
  request.
- **Return to Library when deletion began over elapsed history.** Rejected
  because the route already retains that background and the historical snapshot
  must remain visible.
- **Introduce a global toast system.** Rejected because a consumed navigation
  notice is sufficient for this one route transition.
- **Use Playwright as the full-stack acceptance gate.** Rejected because that
  harness is not trusted; PostgreSQL API integration, web component tests, and
  a bounded manual smoke check are the accepted evidence.

## Consequences

- The DELETE endpoint deliberately treats an owned tombstone differently from
  a missing or foreign id, but exposes no tombstone data and leaves every active
  route's non-disclosure rule unchanged.
- The historical response can no longer tempt a client to render live Item
  facts as history or construct actions for a deleted snapshot.
- Successful deletion and stale-link recovery remove dead canonical URLs from
  the immediate browser history.
- The implementation must reconcile independently owned Library, Today,
  Learning Plan, and history state without depending on a shared client cache.
