# The redesign designs ahead of frozen v1: two axes, three surfaces, a two-door top bar

The web-UI redesign (wayfinder map #53) had to choose an information architecture,
and choosing one forced a fork: reskin the *frozen* v1 model (one Trail, one folder
**All**, no tags — ADR-0002 / ADR-0004), or design the IA against the model the
product is actually heading toward. The redesign **deliberately designed ahead**
(issue #54, revised while drawing the anchor on issue #59). That is the
hard-to-reverse choice recorded here: it fixes what surfaces exist, what the chrome
is, and — as intent, ahead of the build — reopens two settled model ADRs. Chosen
from throwaway prototypes (`prototype-radical.html` / `prototype-nav-model.html` and
the label-placement spikes on `worktree-issue-59-screens-prototype`), never merged.

**The target model has two independent organising axes:**

- **Trails** — sequencing. A User has **many Trails**; each is a canvas of Stops and
  forks. A **Stop belongs to exactly one Trail** — demoted from ADR-0004's global
  grouping primitive to a **per-Trail waypoint**.
- **Labels** — a **many-to-many categorization** axis over the flat store. Labels are
  the store's cross-cutting grouping; they live **only inside the Library**.

**Three surfaces, one axis each** — so neither axis reads as filtering the other:

- **Trails index** (home) — the User's Trails, each with progress. Trails only: no
  label filters, no capture line here.
- **Library** (the flat store, **renamed from All**) — every Item, filterable by
  label; the per-row home for triage (Status, target date, labels, ＋ Stop). Renamed
  because "All" read as a vague catch-all.
- **Trail** — one Trail's canvas of Stops + forks; open a Stop for its Items.

The **Item stays the one shared record** (ADR-0003); every surface is a view over it.

**Navigation — a slim two-door top bar.** The chrome is a slim top bar carrying
exactly two named doors, **`Trails · Library`**, with Trails the default and hero
(the Unshelf mark at left = Trails/home; Capture + account at right). Chosen over a
*Focus Home* and a *Library-as-a-drawer*; it is **not tabs** and **not** a sidebar
(a top bar wins for ≤5 destinations). **Capture is a global chrome action** (top-bar
button + `⌘K` / `c`), a **non-navigating overlay** that files into the Library and
never a Trail, and stays **pure intake** (label-at-capture deferred, #75).

The through-line: the two axes kept reading as if one filtered the other whenever
co-located on one surface, and a capture box above the Trails misread as
"capture *into this Trail*." One axis per surface, capture as omnipresent chrome,
fixes both — grounded in a survey of Readwise Reader / Raindrop / Linear / Todoist /
Things.

## Relationship to prior ADRs

This ADR is **presentation intent that runs ahead of the built model.** It does not
itself change any schema; it commits the *design* to a model that the current v1
ADRs do not describe. Building that model is a **separate downstream effort — #74.**

- **Supersedes ADR-0002 (single folder All)** *in intent*: the target model adds
  **multiple Trails** and **labels** over the store. ADR-0002's frozen-v1 feature cut
  still describes v1 as shipped; ADR-0014 is where the IA departs from it.
- **Supersedes ADR-0004 (Stop the single grouping primitive; tags rejected)** *in
  intent*, and reopens it honestly. ADR-0004 rejected tags because "a Stop is already
  a many-to-many grouping." That argument **no longer holds once Stops are demoted to
  per-Trail waypoints**: the store loses its cross-cutting grouping, so a
  many-to-many **label** axis fills the gap ADR-0004 assumed the Stop covered. Labels
  are not the double-filing ADR-0004 feared — they categorize the *store*, while
  Stops sequence *within a Trail*; the two axes no longer overlap.
- **Still stands:** **ADR-0003** (the Item spine — the one shared record every
  surface views) and **ADR-0008** (single responsive web app, desktop-primary).
- **ADR-0010** (Trail persistence) stands; its Trail canvas is reskinned by this
  effort (see that ADR's update) but the edge-list model is unchanged.

## Considered options

- **Reskin frozen v1 only** (one Trail, one All, no tags). Rejected: it would design
  an IA the product is already leaving, forcing a second redesign the moment the
  next-gen model lands. Designing ahead lets the spec and the #74 build target the
  same shape.
- **Buckets / folders as the store's grouping** (instead of labels). Rejected on #54:
  buckets re-file each Item into one place — the single-home rigidity ADR-0002 walked
  away from; a many-to-many label does not.
- **A capture-forward home** and **a chrome-only home** (nav variants B and A on
  #56), and later a **Focus Home** and **Library-as-a-drawer** (#59). Rejected: each
  co-located the two axes or hid the store, reintroducing the "one filters the other"
  misread.
- **Label quick-filters + a Peek capture line on Home** (the earlier #54 / #56
  shape). Rejected on #59: labels on the Trails index and a capture line above the
  Trails both misread; labels moved inside the Library and capture became global
  chrome.

## Consequences

- **The spec ships; the model build is #74.** `docs/ui-design-spec.md` §2–3 is the
  locked IA + chrome. Multiple Trails, the label axis, and Stop-as-waypoint are
  schema changes owned by the downstream build, not this map.
- **"Library" is the store's UI name.** The glossary term **All** now notes Library
  as its surface name (CONTEXT.md); the model concept — the catch-all every capture
  lands in — is unchanged.
- **The chrome is fixed:** a slim top bar, two doors (`Trails · Library`), global
  Capture; not tabs, not a sidebar. Routing for these surfaces is ADR-0013.
- **Labels become a first-class model concept** in the target model (many-to-many
  over Items), reversing ADR-0004's "Tag is not a domain term" for the next-gen
  model. **Label is now defined in the glossary** (CONTEXT.md — a free-text,
  User-owned, many-to-many marker over Items in the Library, with *Tag* moved to
  _Avoid_); its **model realisation — schema + enforcement — lands with #74**, not
  here.

## Update — one placement per Item per Trail (2026-07-29)

An Item may appear in many Stops across different Trails, but it belongs to **at
most one Stop on any one Trail**. A Trail sequences each Item once. Repeating the
same shared Item in two Stops on one Trail would make its one shared Status appear
at two points in the plan and make "what comes next" misleading. Cross-cutting
relevance belongs on Labels; reuse in a genuinely different plan belongs on
another Trail.

This deliberately rejects same-Trail reuse even when one Item supports two Stops:
the User chooses the single Stop that owns its place in that Trail. Every placement
door must respect the invariant. Once an Item is placed on a Trail, that Trail may
show the existing `Trail · Stop` placement but must not offer another Stop or a new
Stop for it.

The built `stop_items` join currently prevents only a duplicate pair of one Stop
and one Item; the API explicitly permits the same Item in two Stops without
considering their Trail. The downstream model build must therefore enforce the
stronger per-Trail invariant at the write boundary and database boundary. This
wayfinding effort records the decision and hands off its implementation.
