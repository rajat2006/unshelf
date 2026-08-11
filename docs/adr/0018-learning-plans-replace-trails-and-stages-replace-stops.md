# Learning Plans replace Trails; Stages replace Stops

Power Learners need a flat store of possibilities, durable categorisation,
goal-bound commitment, ordered or branching study, and temporary daily attention
without treating those jobs as interchangeable filing systems. We therefore
replace the target **Trail** and **Stop** language from ADR-0014 with **Learning
Plan** and **Stage**, keep **Library** and **Label** deliberately narrow, and make
**Daily Focus** a separate dated projection. This supersedes ADR-0004 and ADR-0014
in target-model intent; ADR-0010's directed-acyclic topology remains useful, but
its future nodes are no longer required to be Stops.

## Decision

- **Library** is the durable, flat home of every Item. Item existence implies
  Library membership; Capture does not also categorise, commit, or prioritise.
- **Label** is optional, durable, many-to-many categorisation across Library
  Items. It carries no order, Status, progress, commitment, or daily priority.
- **Learning Plan** is a durable commitment toward an outcome. It owns placements
  of shared Items, permits each Item at most once, and may be active or archived.
- A Learning Plan's arrangement is a directed acyclic graph. One path is an
  ordinary sequence; forks express parallel study.
- **Stage** is an optional, named grouping within one Learning Plan for a
  meaningful phase, sub-outcome, prerequisite boundary, or checkpoint. Items may
  instead be placed directly in the plan. Items inside a Stage have a local order.
- Item Status remains the only stored progress state. Stage progress and Learning
  Plan progress derive from the shared Statuses of their current unique Items.
- **Daily Focus** is an editable, dated selection of whole Items from the Library
  or Learning Plans. A planned selection may retain its originating placement for
  navigation without moving or duplicating the Item; a past day freezes membership
  and day-end Item Status as history.

The future Learning Plan module should expose one small topology interface: a
Plan Node is either a direct Item placement or a Stage, and every plan edge joins
Plan Node identities. This is an internal representation, not another user-facing
organisation primitive. It gives layout and branching code one interface without
manufacturing a meaningless one-Item Stage around every direct placement.

## Considered options

- **Keep Trail and Stop unchanged.** Rejected because a mandatory unordered Stop
  makes precise Item sequencing require one-Item wrappers, while Trail describes
  a visual metaphor more clearly than the User's durable commitment.
- **Remove grouping entirely.** Rejected because long curricula and meaningful
  sub-outcomes benefit from optional phases, even though small plans do not.
- **Make every Stage mandatory for uniform code.** Rejected because implementation
  convenience would create empty or generic groups. The Plan Node interface gives
  callers uniformity without changing the domain truth.
- **Store plan or Stage completion separately.** Rejected because the same Item is
  shared across surfaces; a second completion state could disagree with Item
  Status.

## Consequences

The schema, shared types, routes, and UI now use Learning Plans whose current
nodes are Stages. The migration preserves existing topology and stable identities
while introducing the Plan Node seam needed for direct Item placements. The full
product decision lives in
[Choose the organisation primitives for the Library, plans, and daily focus](https://github.com/rajat2006/unshelf/issues/261).
