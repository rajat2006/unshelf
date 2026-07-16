# The Trail persists as an adjacency edge list; layout is derived, not stored

The Trail is a topology of Stops — sequence with parallel forks, a DAG, no dates,
one Trail per User (ADR-0004, the #14 PRD, glossary *Trail*). The PRD deferred the
Trail's edge/DAG persistence shape and its authoring interaction to a throwaway
prototype at the start of the Trail build (issue #21). This ADR records the
persistence decision that spike settled; it is the hard-to-reverse half — T8's
schema, repository, and the `packages/shared` contract all build against it.

The Trail persists as a single **adjacency edge list**:

```
trail_edges(user_id, from_stop_id, to_stop_id)
```

one row per directed Stop-to-Stop edge, mirroring `stop_items` exactly — a tenancy
anchor plus composite owner foreign keys `(from_stop_id, user_id)` and
`(to_stop_id, user_id)` into `stops(id, user_id)`, `ON DELETE CASCADE`, primary key
`(user_id, from_stop_id, to_stop_id)`, and a `CHECK (from_stop_id <> to_stop_id)`.

Three properties fall out of this shape and are themselves the decision:

- **The Trail is not a table.** Like All (ADR-0003) it is a derived view: its
  **nodes are the User's Stops** — every Stop is already "what appears as a node on
  the Trail" (glossary *Stop*) — and its **edges are these rows**. A fork is a Stop
  with several out-edges; a join is a Stop with several in-edges. "One Trail per
  User" needs no `trails` row: the edge set scoped to a User *is* the Trail. No
  Trail-level attributes exist in v1 to hang on such a row.
- **No stored layout, no fork order.** The edge set carries no `x`/`y` and no
  ordering among sibling forks. Canvas position is **derived on read** by
  longest-path layering (see the prototype's `layers`), the same discipline as the
  derived `pastTarget` (ADR-0005). This keeps the Trail the "lightweight topology"
  ADR-0004 / the PRD (US 38) require, and there is nothing extra to keep true.
- **Acyclicity is enforced at write time, at the API seam.** A `connect` is
  refused when the target can already reach the source (a back-edge). Postgres
  cannot cheaply forbid cycles declaratively, so the repository owns the invariant
  and the API-boundary tests exercise it — exactly where the PRD says the Trail's
  *logic* (edges persist and read back, DAG validity) is tested.

The prototype (issue #21, several authoring interactions over one shared edge-list
model) confirmed the shape: sequence, forks, and joins all reduce to this flat
edge list, and the layout is fully recoverable from topology.

## Considered options

- **A parent/next pointer on the Stop** (`next_stop_id` or `parent_stop_id`).
  Rejected: a single pointer cannot express a DAG. Forks need many children and
  joins need many parents; either direction overflows one column. It only models a
  list or a tree, not the sequence-with-parallel-forks the Trail is.
- **The whole graph as JSON on one Trail row** (`trail(user_id, graph jsonb)`).
  Rejected: it breaks referential integrity to `stops` (a deleted Stop leaves a
  dangling node; no cascade), it is not relationally queryable, and it fits neither
  the tenancy-anchor-on-every-table rule (ADR-0009) nor the "test the persisted
  state at the API seam" ethos. Atomic whole-Trail rewrite is its only draw, and
  the edge list gets that from an ordinary transaction.
- **Edges plus a stored per-Stop layout** (an `x`/`y`, or a `position` column).
  Rejected for v1: it makes the User own and maintain a canvas layout — a second
  place for the plan to drift — for no domain benefit, since the Trail carries no
  spatial meaning (US 38, ADR-0004). Layout derives cleanly from topology instead.
  Purely additive later if free-form nudging ever earns its place: the prototype's
  free-placement playgrounds are that direction, banked, not built, and the chosen
  Adventure map's drag-to-rearrange is deliberately **view-only** (in-memory, never
  persisted) so it does not cross this line.
- **Ordered forks** (a `position` on the edge to order parallel branches).
  Rejected: parallel threads are by definition unordered relative to each other;
  their vertical stacking is a render concern, not a persisted fact. Additive later
  if it earns its place, the same deferral discipline as ADR-0004's `position`.

## Consequences

- **`packages/shared` gains a `TrailEdge` type** — `{ userId, fromStopId, toStopId }`
  with branded ids — and the Trail read/write contract the PRD sketches ("read and
  persist the Stop-to-Stop edges"). Both ends import it; no client/server drift.
- **`apps/api` gains a `trail_edges` table** appended to `schema.ts` (idempotent,
  the established pattern) and a Trail repository whose `connect` enforces
  acyclicity, tested at the HTTP seam against real Postgres alongside per-User
  isolation — the T8 build slice.
- **The authoring interaction is a direction, not a contract.** The spike commits
  to the **Adventure map** (prototype Variant A, palette-refined as R): a
  horizontal, auto-laid-out trail where each Stop offers *＋ next* and *⑃ fork* and
  progress reads as ground walked-vs-ahead. It gives the "arranging, not data entry"
  gesture (US 39) while keeping layout derived. This does not bind the schema (any
  interaction writes the same edges) and is recorded in the prototype README, not
  frozen here.
- **The same derived layout is the mobile Trail view seam.** Mobile is view-only
  (US 40, ADR-0008); because position is derived from topology, the identical trail
  renders read-only on the phone with no extra data — noted for that surface, not
  built in this spike.
- **Every rejected option stays cheap to add** — a layout table, an edge
  `position`, a `trails` row for a future Trail attribute — each additive and
  non-breaking, the same deferral discipline as ADR-0003 and ADR-0004.
