# Trail authoring — design spike (issue #21) — THROWAWAY

Throwaway prototype. It exists to settle the one open design question before the
Trail is built (T8, the Trail-build slice), then be deleted. **Do not ship any of
this.** The validated decision lives in `docs/adr/0010-trail-edge-model.md`; the
code here is the primary source that got us there and rides to a throwaway branch.

## The question

Two things, entangled, that the PRD (#14) left for this spike:

1. **How are the Stop-to-Stop edges persisted?** (the edge / DAG shape) —
   sequence + parallel forks, a DAG, no dates, one Trail per User. This is the
   hard-to-reverse decision: T8's schema, repository, and the `packages/shared`
   contract all build against it.
2. **What should the desktop drag-and-fork authoring interaction feel like?**
   (US 39 — "a direct drag-and-fork canvas … arranging, not data entry").

## How it's built

Visual representations of the Trail, over **one shared edge-list model**
(`model.ts`). All hand-built (plain React + SVG/CSS, no graph library — a generic
node lib gives the flowchart look we're avoiding). Switch with the floating bar or
`←` / `→`. The chosen direction is first:

| Key | Direction | Feel | Layout | Status |
|-----|-----------|------|--------|--------|
| **A** | **Adventure map** — horizontal trodden trail, waypoint rings, "you are here", compass/contour base; drag to pan, drag a waypoint to rearrange (view-only) | warm journey; progress reads as walked-vs-ahead | derived | **CHOSEN** |
| **R** | Adventure map — professional repaint of A: desaturated pine=done / ochre=now, sealed matte medallions (no coin, no tick), thinner survey-chart styling | same, but adult/considered rather than gamey | derived | **CHOSEN palette direction** |
| **M** | Adventure playground — same map, 2D pan/zoom/drag | explorable | *free (stored x/y)* | parked |
| **S** | Space playground — galaxy, suns ignite on completion | rich, dopamine | *free (stored x/y)* | parked (revisit for **3D**) |
| **C** | Constellation — linear night sky | atmospheric | derived | parked |

Authoring is explicit and wire-free: each Stop offers **＋ next** (extend) and
**⑃ fork** (parallel branch); every control has a hover tooltip. **Progress** is
shown two ways at once — a per-Stop completion ring (React = 3/5 Items done) and
the path *behind* a done Stop rendered as "walked". Click a Stop (or **▸**) to
advance it live.

Layout in the chosen direction (A) is *derived* from topology (`geometry.ts` →
`layers`), so it stores no position — consistent with ADR-0010. The parked
playgrounds (M, S) place Stops in free 2D space, which *would* need a stored
layout; that trade is noted, not taken.

The **state panel** (right) shows the live model: the `(from → to)` edge list, the
DAG check, roots/leaves, and derived progress. Whatever any representation builds
reduces to that flat edge list — the proposed persistence shape — with progress
derived, never stored.

Earlier rounds (in this branch's git history): three node-editor styles (free
canvas / auto-lanes / outline) rejected as flowcharts; then Metro + Roadmap
rejected as bland; then a plain-blue playground + a momentum-ribbon, dropped.

`model.ts` is the one part worth keeping — a pure reducer + DAG helpers with no
React/DOM/DB. It lifts into `apps/api` and `packages/shared` when T8 is built.

## Run

```
pnpm --filter @unshelf/web dev
# open http://localhost:5173/?prototype=trail   (add &variant=A / B / C)
```

Renders ahead of Clerk (see `main.tsx`), so it needs no auth key and no backend.

## Verdict

**Persistence shape — chosen (→ ADR-0010).** An **adjacency edge list**:
`trail_edges(user_id, from_stop_id, to_stop_id)`, mirroring `stop_items` (tenancy
anchor + composite owner FKs + cascade). The **Trail is not a table** — like All,
it is derived: its nodes are the User's Stops, its edges are these rows.
**No stored layout and no fork order** — the Trail stays a "lightweight topology"
(ADR-0038); column position is derived on read (`layers`), exactly as `pastTarget`
is derived. **Acyclicity is enforced at write time** (`canConnect` here; the
repository at the API seam in T8), because Postgres can't cheaply forbid cycles
declaratively. All three variants proved the edge list is sufficient — the only
thing that changes between them is whether a *layout* must also be persisted.

**Visual representation — chosen: the Adventure map (Variant A, palette-refined as
R).** Simple, complete, and it reads as a *journey* rather than a diagram. Layout
is derived, so it needs no stored positions and confirms ADR-0010 as-is. Progress
is shown as walked-vs-ahead trail plus per-Stop rings, all derived from Item
Statuses (no new persistence). A is the structure; **R repaints it to look adult
and considered rather than gamey** — a desaturated survey-chart palette (pine =
done, ochre = now), matte "sealed" medallions with no coin sheen and no checkmark
(a full disc against hollow rings is enough to read as done). T8 ships this
Adventure-map direction.

**Polish left on the table (deliberately parked, not blocking):**
- The completion (pine) fill still reads a touch too green — nudge it toward a more
  neutral/bronze slate so "done" feels earned, not label-coloured.
- Revisit whether a very subtle engraved mark helps the sealed node vs. a bare disc.
- *What's the best way to make a User feel they're progressing?* The playgrounds
  (M, S) and especially a future **3D** take are candidates worth another
  prototyping round — but they imply a stored layout, so revisiting them means
  revisiting ADR-0010's "no position" call. Out of scope for the T8 build.
