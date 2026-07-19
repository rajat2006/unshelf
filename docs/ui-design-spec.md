# Unshelf web UI — design spec (locked)

The locked presentation spec for the Unshelf web app (`apps/web`): its **theme**,
its **information architecture**, its **navigation**, its **routing**, its
**signed-out experience**, and its per-surface **states**. It is the destination of
the wayfinder map [_Redesign the Unshelf web UI_](https://github.com/rajat2006/unshelf/issues/53)
— an index of decisions already made, each resolved on its own ticket and, where
load-bearing, recorded as an ADR. This doc is the single place a build effort reads
to know what the redesigned UI *is*.

**Status: locked.** Presentation only — no feature changes are decided here. The
redesign is **not built here**; that is a downstream effort.

## What this spec is, and is not

- **Is** the IA, chrome, routing, theme, and state design for `apps/web`, drawn
  against — and anchored by — a throwaway visual prototype.
- **Is not** the build. Nor a design-token/component-system deliverable (ruled out
  of scope on the map): a rough prototype + this spec, not a design system.
- **Designs *ahead* of frozen v1.** The IA deliberately assumes the *next-gen*
  model — **multiple Trails per User**, **labels as a many-to-many axis over the
  store**, and **Stop demoted to a per-Trail waypoint** — which supersedes the
  single-Trail / single-folder / no-tags assumptions of ADR-0002 and ADR-0004. The
  spec and prototype ship from this effort; **building that model and its schema is
  a downstream effort — [#74](https://github.com/rajat2006/unshelf/issues/74)**.
  ADR-0003 (the Item spine) and ADR-0008 (single responsive web app) still stand.

## Anchor prototype

The whole spec is anchored by one throwaway visual prototype — self-contained HTML,
never merged to `main`, reacted to over several HITL rounds:

- **`apps/web/prototype-screens.html`** on branch
  `worktree-issue-59-screens-prototype` — the final anchor: **Trails · Library ·
  Trail** in Quiet Focus, light + dark, with the signed-off nav model folded in.
  ([#59](https://github.com/rajat2006/unshelf/issues/59)).

Open it (no build step):

```
git show worktree-issue-59-screens-prototype:apps/web/prototype-screens.html > /tmp/unshelf-screens.html && open /tmp/unshelf-screens.html
```

Earlier throwaway prototypes stand behind individual decisions and are cited in
each section below.

---

## 1. Theme — Direction C · Quiet Focus

**Decision:** [Theme direction](https://github.com/rajat2006/unshelf/issues/55) ·
**ADR:** [0012](adr/0012-quiet-focus-theme-and-token-layer.md) ·
**Prototype:** the theme prototype app on `worktree-issue-55-theme-prototype` —
entry `apps/web/prototype-theme.html`, with the palette / type / spacing tokens in
`apps/web/src/prototype/ThemePrototype.tsx`

Quiet Focus makes "enable, don't automate" visual: calm, modern, minimal — **not**
bookish, **not** map-themed.

- **Palette.** Cool near-neutral greyscale + a single **indigo** accent (light
  `#4B57C4`, dark `#7C88FF`). Green signals *done*; **quiet-slate** signals *past
  target* — **never red**.
- **Type.** One modern **grotesque** for everything. Ship candidate: **Inter**, or
  the native `system-ui` stack for zero webfont cost.
- **Spacing.** A **4px** grid — 4 / 8 / 12 / 16 / 24 / 40. Radii 6 / 8 / 10.
- **Light and dark are peers**, both first-class and shipping together. They are
  expressed through a **CSS-custom-property token layer** (~10 tokens redefine
  between modes); this token layer replaces today's inline `style={}` and is a
  build prerequisite for any theming. See ADR-0012.

### Token palette (Direction C · Quiet Focus)

The complete locked palette — builders read this, not the throwaway prototype:

| Token | Role | Light | Dark |
|-------|------|-------|------|
| `--bg` | Page | `#FAFAFB` | `#0E0F13` |
| `--surface` | Surface / cards | `#FFFFFF` | `#16181D` |
| `--ink` | Text | `#16181D` | `#ECEEF3` |
| `--muted` | Muted / secondary text | `#676C76` | `#8B909B` |
| `--line` | Hairline / borders | `#E6E8EC` | `#24272E` |
| `--accent` | Accent (indigo) | `#4B57C4` | `#7C88FF` |
| `--accent-h` | Accent hover | `#3B46A8` | `#99A2FF` |
| `--on-accent` | Text/icon on accent | `#FFFFFF` | `#0E0F13` |
| `--done` | Status *done* (green) | `#1F9D63` | `#35C081` |
| `--past` | *Past target* (slate, never red) | `#767C88` | `#868C98` |
| `--field-bg` | Input background | `#FFFFFF` | `#1A1C22` |
| `--field-line` | Input border | `#D9DCE2` | `#2C2F38` |
| `--trail-bg` | Trail canvas ground | `#F4F5F7` | `#121319` |

Source of record: `apps/web/src/prototype/ThemePrototype.tsx` (Direction C), on
`worktree-issue-55-theme-prototype`, never merged. Type = one modern grotesque
(Inter or `system-ui`); spacing = the 4px grid above; radii 6 / 8 / 10.

## 2. Information architecture — surfaces

**Decision:** [Information architecture](https://github.com/rajat2006/unshelf/issues/54),
revised by [#59](https://github.com/rajat2006/unshelf/issues/59) ·
**ADR:** [0014](adr/0014-next-gen-surface-model-and-navigation.md)

Two independent organising axes, **one axis per surface** so neither reads as
filtering the other:

- **Trails** — sequencing. A User has **many Trails**; each is a canvas of **Stops**
  and forks. A Stop belongs to exactly one Trail (Stop-as-waypoint).
- **Labels** — a **many-to-many categorization** axis over the store. Labels live
  **only inside the Library**, never on the Trails index.

The surfaces:

- **Trails index** (the landing / home) — the User's Trails, each with progress.
  Trails-only: **no** label quick-filters, **no** capture line (both were tried and
  dropped — see §3).
- **Library** (the store, formerly *All*) — every **Item**, filterable by label.
  The per-row home for triage: **Status**, **target date**, applied **labels**, and
  **＋ Stop** (pull an Item onto a Trail). Renamed from *All* because "All" read as a
  vague catch-all; "Library" names the flat store plainly.
- **Trail** — one Trail's canvas of Stops + forks; open a Stop node for its Items.

The **Item** remains the one shared record (ADR-0003); every surface is a view over
it. A **Status** flipped in the Library is the same record shown on the Trail.

## 3. Navigation & chrome

**Decision:** [Navigation model](https://github.com/rajat2006/unshelf/issues/56),
revised by [#59](https://github.com/rajat2006/unshelf/issues/59) ·
**ADR:** [0014](adr/0014-next-gen-surface-model-and-navigation.md) ·
**Prototypes:** `prototype-nav.html` (`worktree-issue-56-nav-prototype`),
`prototype-radical.html` / `prototype-nav-model.html` (`worktree-issue-59-screens-prototype`)

- **A slim top bar with two named doors — `Trails · Library`** — Trails the default
  and the hero. Chosen (prototype variant A) over a *Focus Home* (home = your next
  Trail step) and a *Library-as-a-drawer*. Two peer destinations, Trails elevated;
  **not tabs**, and **not** a sidebar (a top bar wins for ≤5 destinations).
- **Top bar layout:** the **Unshelf mark (= Trails / home) at left**; **Capture +
  account (Clerk `UserButton`) at right**.
- **Capture is a global chrome action** — a top-bar button plus `⌘K` / `c` — whose
  composer states it **lands in the Library, never a Trail**. It is a
  **non-navigating overlay**: it opens on any surface, files the Item into the
  store, and leaves you where you were. Capture is deliberately **pure intake**
  (required title + chosen Type + optional Source); labelling at capture time is
  deferred ([#75](https://github.com/rajat2006/unshelf/issues/75)).

Why this shape: the two axes kept reading as if one filtered the other whenever
co-located, and a capture box above the Trails misread as "capture *into this
Trail*." The fix — one axis per surface, capture as omnipresent chrome — is grounded
in a survey of Readwise Reader / Raindrop / Linear / Todoist / Things (flat store
behind one named door; tags demoted inside it; capture a quiet global action).

## 4. Routing & URLs

**Decision:** [Routing](https://github.com/rajat2006/unshelf/issues/58) ·
**ADR:** [0013](adr/0013-adopt-react-router-and-url-structure.md) ·
**Prototype:** `prototype-routing.html` (`worktree-issue-58-routing-prototype`, variant D)

- **Adopt `react-router` (v7, declarative SPA).** `apps/web` has no client router
  today; the redesign introduces one.
- **Routes:**
  - `/` — Trails index (home)
  - `/library` — the Library; the active label filter lives in the URL as
    `?label=…` (the routing prototype #58 used `/all`; the store was renamed
    All → Library at #59, so the route follows)
  - `/trails/:trailId` — a Trail (opaque id)
  - `/trails/:trailId/stops/:stopId` — an open Stop
  - `/items/:itemId` — an Item, one canonical, context-independent URL
  - `/sign-in` — the single auth route
- **Open Stop / open Item = a non-modal right sidebar.** It docks right; the canvas
  reflows beside it; no scrim; it stays interactive; it **owns its URL**, so back /
  refresh / bookmark / deep-link all work. Full-page, drawer-with-scrim, and
  centered-modal were rejected.
- **Cold deep-link fallback.** The Item URL is context-independent, so opening
  `/items/:itemId` fresh (no origin surface to reflow beside) renders the sidebar
  over the **Library** — the Item's home surface, since every Item lives in the
  store. A Stop opened cold (`/trails/:trailId/stops/:stopId`) renders its Trail
  beneath, which the URL already names.
- **Capture stays out of the URL** (non-navigating, §3).
- **Deep-linking is owner-scoped** — bookmark / refresh / back / return-after-
  sign-in for the owner. Cross-user public sharing is out of scope (no sharing
  model on the roadmap).
- **Unknown route → not-found → Home.** `:trailId` is opaque; human-readable slugs
  are a downstream-build concern (#74).

## 5. Signed-out & sign-in

**Decision:** [Signed-out and sign-in experience](https://github.com/rajat2006/unshelf/issues/57)

- **A dedicated, chrome-less signed-out screen** (not an inline gate): the centered
  **Unshelf wordmark + "Sign in with Google"** on the Quiet Focus background (light
  / dark). **No marketing copy** — the old "invite-only" line is dropped; a richer
  landing is parked post-v1.
- The button opens **Clerk's sign-in modal** (`mode="modal"`); Clerk owns Google
  OAuth and any gating. "Direct-to-Google" was rejected (it would cost us callback /
  rejection handling and break the ADR-0009 seal).
- **Auth is a gate with one `/sign-in` route:** signed-in → Home; signed-out →
  `/sign-in`; logout → the signed-out screen. No confirmation screens.
- **First load holds on a neutral, wordmark-only placeholder** until Clerk resolves
  auth — no sign-in-wall flash. The signed-in shell (§3) renders only once auth
  resolves signed-in. Rejection is Clerk's default.
- This spec **asserts no invite-only claim**. The auth *admission* model (sign-in =
  sign-up; invite-gating relaxed) revises ADR-0001 and is decided separately —
  [#77](https://github.com/rajat2006/unshelf/issues/77), out of scope for this map.

## 6. Per-surface states

Only the **empty** state was drawn in the anchor (Library filtered to a label with
no Items). Loading and error were carried into this spec to specify:

- **Empty.** Per surface, a quiet centered prompt in neutral tone, no illustration:
  - _Trails index_ — "No Trails yet" + a primary action to start one.
  - _Library_ — distinguish **truly empty** ("Nothing captured yet" + a nudge to
    Capture) from **empty-under-filter** ("No Items match this label" + clear-filter),
    since the recovery differs.
  - _Trail_ — "This Trail has no Stops yet" + add-a-Stop.
- **Loading.** Skeleton placeholders in the surface's own layout (Trail cards,
  Library rows, the Trail canvas), tinted with theme tokens — never a full-screen
  spinner once the shell is up. The only full-screen hold is the first-load auth
  placeholder (§5).
- **Error.** An inline, surface-scoped panel — "Couldn't load this" + a retry —
  that never replaces the chrome (the top bar stays; only the surface body shows the
  error). The right-sidebar detail (§4) errors **inside the sidebar**, leaving the
  canvas intact.

## 7. The Status control

**Status** (ADR-0003; glossary) is a 3-state value — *not started* / *in progress* /
*done*. Its control is a **3-state segmented pill**, one per Item row in the Library
and on the Stop's Items. Flagged while drawing the anchor as possibly heavy per row;
**kept** — it makes all three states one tap and keeps the store's core gesture
(triage progress) direct. It reads the shared Item record, so the same control on a
Trail reflects a Library change and vice-versa.

- **Done** reads in the theme's green.
- **Past target** (target date passed, not yet done — a *derived* state, ADR-0005)
  reads in **quiet-slate**, never red.

## 8. The Trail canvas

**Decision:** [#59](https://github.com/rajat2006/unshelf/issues/59) ·
**ADR:** [0010](adr/0010-trail-edge-model.md) (persistence, updated by this effort
for the reskin)

A **reskin, not a redesign** of ADR-0010's Adventure map. The **topology-as-journey**
reading is kept — solid **walked ground** vs **dotted-ahead** edges, a sealed green
**done**-medallion, an indigo filling **"you are here"** ring, and ＋ / ⑃ / ⇢
authoring gestures. Dropped: ADR-0010's **warm survey-chart skin** (pine/ochre paper)
and the **compass rose**. The canvas now sits on a cool neutral surface with a faint
neutral graticule, per Quiet Focus's "not map-themed." Layout stays **derived from
topology** (ADR-0010) — no stored positions.

## 9. Responsive

Per ADR-0008 (single responsive web app, desktop-primary, must reflow to phone):

- The shell **reflows** with **no page-level horizontal scroll** (ADR-0008) —
  clamped paddings, auto-fill grids, wrapping rows.
- The **Trail canvas is the one deliberate exception** to that rule. ADR-0008 itself
  frames the Trail as a *large-screen canvas* that mobile cannot author, so on the
  phone it **pans sideways within its own container** and is **view-only** (no
  authoring; layout derives from topology, so the same Trail renders read-only with
  no extra data — ADR-0010). This is an inner-container pan, **not** the page-level
  horizontal scroll ADR-0008 forbids.
- No separate phone mockup was drawn; the reflowing shell is the spec.

## 10. Decisions record (map index)

| # | Decision | Ticket | ADR |
|---|----------|--------|-----|
| Theme | Direction C · Quiet Focus + token layer | [#55](https://github.com/rajat2006/unshelf/issues/55) | [0012](adr/0012-quiet-focus-theme-and-token-layer.md) |
| IA | Surfaces: Trails index · Library · Trail | [#54](https://github.com/rajat2006/unshelf/issues/54) | [0014](adr/0014-next-gen-surface-model-and-navigation.md) |
| Nav | Slim two-door top bar; global Capture | [#56](https://github.com/rajat2006/unshelf/issues/56) | [0014](adr/0014-next-gen-surface-model-and-navigation.md) |
| Signed-out | Chrome-less screen + Clerk modal gate | [#57](https://github.com/rajat2006/unshelf/issues/57) | — (auth admission → [#77](https://github.com/rajat2006/unshelf/issues/77)) |
| Routing | react-router; URL structure; right-sidebar detail | [#58](https://github.com/rajat2006/unshelf/issues/58) | [0013](adr/0013-adopt-react-router-and-url-structure.md) |
| Anchor | Home · Library · Trail, final | [#59](https://github.com/rajat2006/unshelf/issues/59) | — |

## 11. Out of scope

- A formal design-token / component-system deliverable.
- **Building** the redesign — a downstream effort — **including building the
  next-gen model** the IA assumes (multiple Trails, labels over the store,
  Stop-as-waypoint): [#74](https://github.com/rajat2006/unshelf/issues/74).
- The **auth admission model** (sign-in = sign-up; invite-gating relaxed), which
  revises ADR-0001: [#77](https://github.com/rajat2006/unshelf/issues/77).
- **Label-at-capture** — capture stays pure intake:
  [#75](https://github.com/rajat2006/unshelf/issues/75).
- Cross-user / public **shareable links** — no sharing model on the roadmap;
  deep-linking (§4) is owner-scoped only.
