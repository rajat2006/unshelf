# Item deletion is one explicit cleanup transaction

## Status

Accepted

## Context

ADR-0023 retains a deleted Item row as a tombstone. The Item's existing
foreign-key cascades therefore do not run, while its Parts, organisational
relationships, current Daily Focus membership, and Discover identity must not
remain attached. Provider identity is also the indirect link between a kept
Candidate and its Item, so releasing that identity without ending the kept
Candidate would leave an impossible decision state.

Unshelf is a personal application. Overlapping mutations from the same User are
possible at the HTTP and database layers, but protecting every Item write would
require a shared lifecycle-lock protocol across otherwise independent feature
modules. That edge case does not justify the extra interface and implementation
changes for this effort.

## Decision

Delete one owned active Item in one application-managed database transaction.
The operation first resolves the Item through its id, owner, and active
eligibility, then performs explicit, owner-and-Item-scoped cleanup before setting
the one deletion timestamp and committing. Missing optional relationships are
normal; any database failure rolls back both cleanup and the tombstone.

The transaction:

1. Finds every Provider-identity association targeting the Item. For each exact
   identity, it removes a matching kept Candidate, while leaving pending and
   rejected Candidates unchanged, then removes every association. Shared
   Provider results and Follows remain.
2. Deletes the Item's Parts and Label associations, all of its planning
   suppressions, and only its membership in the database's current Daily Focus.
   Elapsed Daily Focus membership and its frozen snapshot remain.
3. Removes the Item from active and archived Learning Plans. A direct placement
   is removed by deleting its Item node, whose existing cascades delete every
   incident edge and the placement without reconnecting surrounding nodes. A
   Stage placement is deleted without deleting its Stage or changing Stage
   topology. Placement removal also removes current or elapsed Daily Focus
   origin links, as deleted history exposes no origin.
4. Sets the retained Item row's timezone-aware `deleted_at` once, leaving every
   scalar tombstone fact unchanged.

Every mutation is scoped by both Item identity and User ownership. Labels,
Learning Plans, Stages, Daily Focus records, shared Provider data, other Items,
and every unrelated record remain unchanged.

Do not add database triggers, new cross-table integrity constraints, or a shared
lifecycle-lock module for deletion. The transaction guarantees all-or-nothing
behavior for the deletion request itself. Behavior when another same-User Item
mutation overlaps that transaction is unsupported and is not an acceptance
requirement; existing operation-specific locks remain implementation details.

## Considered options

- **Rely on foreign-key cascades.** Rejected because changing `deleted_at` does
  not delete the Item row and therefore activates no cascade.
- **Enforce tombstone integrity against arbitrary SQL.** Rejected because it
  would require triggers or an active-parent schema seam that adds migration,
  repair, and cleanup coupling without a product requirement for direct-SQL
  safety.
- **Introduce one shared Item lifecycle lock across every write.** Rejected
  because it broadens this effort across many mutation paths to cover a rare
  same-User overlap. The product accepts that overlap as unsupported.
- **Require exactly one Provider identity per Item.** Rejected for now. Current
  application flows create at most one, while the schema remains permissive;
  deletion safely releases every association it finds.

## Consequences

- The deletion module owns explicit cleanup rather than depending on schema
  cascades from a retained parent row.
- Sequential deletion either commits the complete tombstone state or changes
  nothing.
- A concurrent same-User write may race with deletion and leave a relationship
  pointing at the tombstone. If that becomes a supported usage pattern, the
  write modules must adopt a shared serialization protocol in a later effort.
- Acceptance covers transaction rollback and exact post-commit preservation and
  cleanup, but not cross-request mutation races.
