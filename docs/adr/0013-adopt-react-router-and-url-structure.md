# The web app adopts react-router; every surface owns a URL, detail opens as a right sidebar

`apps/web` has **no client-side router today** — it is a single React 19 + Vite tree
that swaps surfaces in local state. The redesign (wayfinder map #53) introduces real
navigation, and adopting a router plus fixing the URL contract is a hard-to-reverse
architectural choice: routes become the app's addressable surface and everything
deep-links against them. The URL structure was chosen from a throwaway prototype
(`prototype-routing.html` on `worktree-issue-58-routing-prototype`, variants A–D,
human picked **D**) and settled on issue #58; this ADR records that decision.

**Adopt `react-router` (v7, declarative SPA).** The route table:

| Route | Surface |
|-------|---------|
| `/` | Trails index (home) |
| `/library` | The Library (`?label=…` carries the active label filter) — the routing prototype (#58) used `/all`; the store was renamed All → Library at #59, so this route follows the surface name (ADR-0014) |
| `/trails/:trailId` | A Trail — `:trailId` opaque |
| `/trails/:trailId/stops/:stopId` | An open Stop |
| `/items/:itemId` | An Item — one canonical, context-independent URL |
| `/sign-in` | The single auth route |

Three properties of this table are themselves the decision:

- **Detail opens as a non-modal right sidebar that owns its URL.** Opening a Stop or
  an Item docks a panel on the right; the canvas reflows beside it; there is **no
  scrim** and the canvas **stays interactive**. Because the panel owns
  `/trails/:trailId/stops/:stopId` or `/items/:itemId`, **back / refresh / bookmark /
  deep-link all work**. An Item has **one** canonical URL regardless of which Stop or
  Trail it was reached through (it is the one shared record, ADR-0003). Opened
  **cold** (no origin surface), `/items/:itemId` renders the sidebar over the
  **Library** — the Item's home surface; a cold Stop URL renders its Trail, which the
  URL already names.
- **Auth is a gate with one route.** Signed-in → Home; signed-out → `/sign-in`;
  logout → the signed-out screen. Aligned with the signed-out design (#57) and
  Clerk's modal (this ADR does not re-decide admission — that is #77). First load
  holds on a neutral placeholder until Clerk resolves auth, so no route flashes a
  sign-in wall.
- **Deep-linking is owner-scoped.** The URLs address the owner's own space —
  bookmark, refresh, back, return-after-sign-in. **Cross-user public sharing is out
  of scope** (no sharing / permissions model on the roadmap); an unknown route
  resolves **not-found → Home**.

**Capture stays out of the URL** — it is a non-navigating overlay (ADR-0014 / #56):
it files an Item into the Library and leaves the current route untouched.

## Considered options

- **Stay routerless (local-state surface swap).** Rejected: it cannot deep-link,
  bookmark, or restore a surface on refresh — the core of the redesign's navigation.
- **Full-page detail** (a Stop / Item replaces the whole surface). Rejected
  (prototype): loses the canvas context you opened the detail *from*.
- **Drawer-with-scrim / centered modal for detail.** Rejected: a scrim makes the
  canvas non-interactive and reads as a mode; the right sidebar keeps the canvas live
  beside the panel.
- **Opaque `:trailId` vs human-readable slug.** Slugs deferred: they belong to the
  next-gen model build (#74), not this presentation spec; opaque ids keep the URL
  contract stable now.
- **Modelling Capture as a route.** Rejected: capture never navigates, so a URL for
  it would falsely restore an overlay on refresh.

## Consequences

- **`apps/web` gains `react-router` (v7)** and a route tree matching the table
  above — a build task for the **downstream UI-build effort**, not done here — and
  **not** part of #74 (the domain/schema migration), which does not cover the router.
- **The right-sidebar detail pattern is load-bearing** for Stop and Item: any build
  must render detail beside a live canvas, not over it, and route it.
- **Every surface is addressable**, which is what makes owner-scoped deep-linking,
  refresh-restore, and return-after-sign-in work; the label filter lives in the URL
  (`/library?label=…`) so a filtered Library is itself linkable.
- **Full spec:** `docs/ui-design-spec.md` §4. Chosen from the throwaway
  `prototype-routing.html` (`worktree-issue-58-routing-prototype`, variant D), never
  merged.

## Update — Item placement stays inside URL-owned detail (2026-07-30, map “How an Item gets into a Stop”)

[Prototype the Item picker in its two hardest frames](https://github.com/rajat2006/unshelf/issues/212)
and [Creating a Stop for an Item from the Item sidebar](https://github.com/rajat2006/unshelf/issues/214)
preserve the route-owned right-sidebar decision:

- `/items/:itemId` owns single-Item placement. Its Item sidebar shows
  Trail-qualified placement chips and `Add to Trail…`, including placement into an
  existing Stop and atomic creation of a new loose Stop.
- `/trails/:trailId/stops/:stopId` owns Stop-first intake. The open Stop keeps its
  current Items above an always-present Library search with immediate placement and
  Undo.
- Library rows carry no placement control, and neither flow introduces a modal,
  scrim, or temporary URL. The underlying Library or Trail stays available beside
  the sidebar.

At phone width the same Stop URL owns a full-width detail surface beneath a compact
Trail context bar. That responsive presentation changes the rectangle, not route
ownership, history, refresh, bookmark, or deep-link behavior.
