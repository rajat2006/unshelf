# Non-restorable Item deletion retains a tombstone and frozen history

## Status

Accepted

## Context

Deleting an Item must remove it from every active Unshelf surface without
erasing elapsed Daily Focus history. A hard delete would cascade away that
history, while the existing historical response still depends on a live Item
for most of what it renders.

## Decision

Deleting an Item adds a timezone-aware `deleted_at` value and freezes every
existing scalar fact on its retained row: identity, owner, title, Source,
creation time, Type, Status, status mode, Target date, and completion date. The
row is an internal, immutable tombstone rather than a domain Item; it is never
restored, returned through the Item interface, or used as the source of
historical presentation. Parts, Label associations, current Daily Focus
membership, planning suppressions, Learning Plan placements, and Provider
identity associations do not survive as relationships to the tombstone.

Every ordinary read, join, aggregate, ownership check, and mutation composes one
shared active-Item eligibility function whose rule is `deleted_at IS NULL`.
Feature queries remain free to select, rank, aggregate, or mutate in the shape
they need, but they do not redefine Item eligibility. Tombstone access belongs
only to explicitly named deletion and elapsed-history paths. A deleted Item is
indistinguishable from a missing or foreign Item at canonical active routes and
uses the existing not-found response.

Every elapsed Daily Focus renders from a self-contained snapshot of title, Type,
day-end Status, and Part percentage. Snapshot-owned facts refresh while the
focus is Today and freeze once its date has elapsed; Source, Labels, Target date,
completion date, status mode, Parts, and origin are not historical facts. The
historical contract distinguishes an available Item from a deleted snapshot.
The available variant may carry an Item id and current origin for navigation or
reconsideration; the deleted variant carries neither, renders the frozen title
as plain text with “Item deleted,” and exposes no action.

The history reader determines availability from the retained row's
`deleted_at`; Daily Focus snapshots do not copy another deletion marker. This
keeps one lifecycle truth while allowing the snapshot content itself to remain
unchanged.

## Considered options

- **Erase or neutralise scalar Item facts at deletion.** Rejected because the
  retained identity already exists for referential history, while nullable or
  synthetic replacements would create a second erasure lifecycle without
  changing the product's indefinite-retention boundary.
- **Keep elapsed history partly live.** Rejected because later Item changes
  would rewrite the meaning of a past day, and deletion would leave history
  unable to render without inventing a replacement Item.
- **Return a nullable or synthetic Item from deleted history.** Rejected because
  callers could still construct links and mutations for something that is no
  longer an Item. A discriminated historical contract makes that impossible.
- **Copy deletion state into every Daily Focus snapshot.** Rejected because it
  could disagree with the tombstone and would require updating every elapsed
  membership when deletion occurs.

## Consequences

- Active Item JSON remains unchanged; `deleted_at` is persistence-only.
- Elapsed Daily Focus has a dedicated response shape rather than making the
  editable current-day Item nullable.
- The history wire contract requires a coordinated or versioned rollout; the
  migration and compatibility sequence is decided by
  [Choose the deleted-Item migration and compatibility contract](https://github.com/rajat2006/unshelf/issues/576).
- Cross-surface acceptance must cover active filtering as well as canonical Item
  detail, because Item-bearing queries are intentionally feature-specific.
