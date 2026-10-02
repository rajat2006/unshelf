# Item deletion forgets Keep before normal rediscovery

## Status

Accepted

## Context

A kept Candidate does not store the Item it produced or reused. The effective
link runs through the User's exact Provider-identity association, while the
Candidate retains only its terminal `kept` decision. Repeated Provider intake
preserves that decision.

ADR-0023 requires Item deletion to release the Provider identity and forbids
reusing the retained Item tombstone. Releasing only the identity would leave a
kept Candidate with no active Item and would prevent normal intake from creating
another Candidate. Resetting the same Candidate to pending would instead let a
delayed request against its old id recreate an Item without a fresh Discover
lifecycle.

Normal Discover eligibility already accounts for an active Follow and the
rolling Provider-publication window. Candidate decisions have no user-facing
history.

## Decision

Deleting a provider-backed Item releases its Provider-identity association. If
the matching Candidate is kept, deletion ends and removes that Candidate rather
than resetting it in place. An already-pending Candidate remains pending, and a
rejected Candidate remains rejected; deleting a separately captured Item does
not rewrite either decision. Shared Provider results and Follows are unchanged.

Deletion does not insert a replacement Candidate. Normal Discover intake owns
Candidate creation and may later create a fresh pending Candidate with a fresh
id only when the Provider result satisfies its ordinary eligibility rules.
Deletion does not refresh publication time, bypass an inactive Follow, or force
stale material back into Discover.

Once the Provider identity is free, a later exact-identity Capture may create a
fresh active Item. If Capture happens before rediscovery, a later Candidate
remains pending and appears as already in the Library; Keep then reuses that new
active Item. If Discover creates the Candidate first, Keep creates a fresh Item.
Neither path restores or reuses the tombstone.

Fresh Candidates retain the existing decision contract: concurrent Keeps
produce one Item, repeating the same decision returns the same result, and the
opposite decision conflicts. Workspace eligibility continues to control
presentation, while ownership and pending state continue to control a decision
request addressed by id.

There is no special product ordering for a decision request overlapping Item
deletion. [ADR-0026](0026-item-deletion-is-one-explicit-cleanup-transaction.md)
defines the single-request transaction and deliberately leaves overlapping
same-User mutations unsupported rather than introducing a shared lifecycle-lock
protocol.

The ended Candidate's Keep timestamp is not retained in a separate audit model.
Elapsed Daily Focus snapshots and the Item tombstone remain the historical
records required by this effort.

## Considered options

- **Reset the kept Candidate to pending in place.** Rejected because an old
  request would still address the current Candidate and could recreate an Item
  after deletion without passing through fresh Discover intake.
- **Keep the terminal Candidate and release only the Provider identity.**
  Rejected because it leaves a kept decision with no active Item and prevents
  ordinary intake from creating a fresh Candidate.
- **Insert a replacement pending Candidate during deletion.** Rejected because
  Item deletion should not own intake or force material past the normal Follow
  and relevance rules.
- **Force the Provider result back into Discover.** Rejected because deletion is
  not a recency signal; stale or unfollowed material should behave as if the
  deleted Item had never existed.
- **Add Candidate decision history.** Rejected because the product exposes no
  such history and the retained deletion records already satisfy the effort's
  historical contract.
- **Define a special winner for overlapping deletion and decision requests.**
  Rejected because no distinct user-facing behavior is required; atomic state
  integrity is sufficient.

## Consequences

- A kept Candidate row is removed as part of deleting its linked Item, freeing
  the User-and-Provider-result uniqueness slot for later normal intake.
- Requests using the ended Candidate id find no Candidate after deletion has
  committed.
- Candidate creation remains inside Discover rather than the Item lifecycle.
- Later Capture and Keep create or reuse only a fresh active Item for the freed
  Provider identity.
- The deletion transaction removes every matching kept Candidate it observes,
  but does not promise an ordering against an overlapping decision request.
- Acceptance must cover kept, pending, and rejected Candidates; active,
  unfollowed, and stale Provider results; Capture before rediscovery; and normal
  replay, conflict, and concurrent-Keep behavior on a fresh Candidate. It does
  not cover a Candidate decision racing Item deletion.
