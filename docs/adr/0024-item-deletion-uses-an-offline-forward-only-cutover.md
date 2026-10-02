# Item deletion uses an offline, forward-only compatibility cutover

## Status

Accepted

## Context

ADR-0023 requires a timezone-aware Item tombstone and a self-sufficient elapsed
Daily Focus snapshot of title, Type, day-end Status, and Part percentage. The
current snapshot stores only Status and Part percentage; history joins the live
Item for the remaining facts. The current API also treats every retained Item
row as active.

Adding nullable columns is structurally compatible with the previous API, but
allowing that API to serve after the first tombstone exists is not logically
safe: it would expose and mutate the tombstone as an Item. Making title and Type
snapshots required while the previous API can still create Daily Focus
memberships would instead reject those old writes.

Unshelf has no production Users at the time of this rollout, so preserving
availability during the cutover has no product value. Existing records are still
worth preserving: a real forward migration both protects the data and proves the
path a populated installation would use.

## Decision

Ship the schema migration and Item deletion together in one offline deployment.
Stop and drain the old API before applying the migration; start only the new API
after the migration succeeds. Schema-stale preview deployments remain
best-effort under the existing preview contract.

Add one new forward migration without rewriting migration history or resetting
the database. In its transaction:

1. Add nullable, timezone-aware `items.deleted_at` with no default. Existing
   Items remain active because their value is `NULL`.
2. Add nullable `daily_focus_items.title_snapshot` and
   `daily_focus_items.type_snapshot` columns.
3. Backfill both columns from the owned Item by joining on `item_id` and
   `user_id`. Existing title and Type are the exact historical values because
   neither is currently mutable through the product.
4. Fail the migration if any membership remains incomplete, then make both
   snapshot columns `NOT NULL` and constrain Type to the shared Type vocabulary.

Keep the existing Status snapshot and nullable Part-percentage snapshot
unchanged. A missing Part percentage continues to mean that the Item had no
Parts. Retain the Daily Focus membership's Item foreign key: tombstones remain
indefinitely, while hard purge and any resulting referential redesign are
outside this effort.

The same application release writes title and Type whenever it creates or
refreshes a Today snapshot, applies the shared `deleted_at IS NULL` eligibility
rule to every ordinary Item path, and exposes the deletion operation. Use no
database trigger to bridge old writers.

Replace the existing elapsed Daily Focus response in place with its
available-Item/deleted-snapshot variants. Do not add a temporary versioned route
or representation header. An already-open old browser may fail until refreshed;
that is acceptable within this offline, pre-User cutover.

The migration is transactional and blocks the new API from starting on failure.
Once the first tombstone is written, deploying tombstone-unaware application
code is forbidden: schema and application failures are fixed forward. There is
no down migration, Restore, or hard-purge path.

Do not add a speculative partial active-Item index. Existing Item reads are
owner-scoped and there is no workload evidence that the current owner index is
insufficient; add another index only after query plans or retained-tombstone
volume justify it.

## Considered options

- **Use separate compatibility and activation deployments.** Rejected because
  no production User needs an uninterrupted mixed-version window, while an
  offline cutover is simpler and can enforce the final snapshot constraints
  immediately.
- **Leave title and Type snapshots nullable.** Rejected because an elapsed Daily
  Focus is self-sufficient only when every membership owns those facts; deletion
  should not opportunistically repair an incomplete historical record.
- **Fill snapshots for old writers with a database trigger.** Rejected because
  the old API is deliberately stopped, making a trigger unnecessary, and the
  database standards prohibit triggers without a separately justified
  invariant and migration contract.
- **Version the elapsed-history endpoint.** Rejected because there are no
  production clients to carry through a compatibility period; the existing
  response can change during the offline deployment.
- **Reset the disposable database instead of backfilling it.** Rejected because
  the exact backfill is small, preserves all existing records, and supplies a
  production-safe migration path and acceptance target.

## Consequences

- Deployment acceptance must prove that the old API is quiescent before the
  migration and that the new API starts only after it completes.
- Migration coverage must seed pre-migration current and elapsed Daily Focus
  memberships, including an Item without Parts, then verify exact title and Type
  snapshots, preserved Status and Part percentage, tenant ownership, and zero
  incomplete snapshots.
- Cross-surface acceptance must prove that no ordinary read or mutation exposes
  a tombstone, while elapsed history still renders the four-fact snapshot.
- A deployment may be unavailable during the cutover, and an old browser may
  require a refresh afterward.
- A rollback to the previous application is not a recovery mechanism after Item
  deletion begins; operational recovery is forward-only.
