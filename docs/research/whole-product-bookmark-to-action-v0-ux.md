# Unshelf v0: from “bookmark anything” to deliberate action

Researched 2026-08-18 against the current Unshelf repository, current
first-party product documentation, official open-source project documentation,
W3C accessibility standards, and first-party human–AI interaction research.

**Status:** product and UX exploration, not an architecture or domain decision.
This note proposes a coherent v0 and the seams needed for AI-assisted v1. It does
not supersede an ADR or authorize implementation.

## Executive recommendation

Unshelf should be built around one legible loop:

```text
Capture or import
       ↓
Inbox: decide what a save means
       ↓
Library: keep and retrieve it
       ↓ optional commitment
Plan: arrange a small set toward an outcome
       ↓ explicit daily choice
Today: do the next useful thing
       ↓
Complete, archive, or keep as reference
```

The important shift is not a new visual treatment. It is a cleaner mental model:

- **Saved state and progress state must be separate.** A restaurant, code
  reference, gift idea, or article kept for citation is not automatically “not
  started.” `Active / Archived / Trashed` answers whether Unshelf still keeps a
  save in the working Library; optional `Not started / In progress / Done`
  answers progress only when the User means to act on it.
- **Inbox is a review state, not a second store.** Every save remains one Item in
  the Library spine. `Inbox` is the system view of Items not yet reviewed. An
  import can intentionally bypass or bulk-clear review so 5,000 bookmarks do not
  manufacture 5,000 chores.
- **Library is for retrieval, Plans are for commitment, and Today is for
  execution.** Labels, Types, Saved Views, plan placement, and daily selection
  must not be presented as interchangeable ways to file an Item.
- **v0 should make importing a real bookmark collection a first-class path.** A
  bookmarks-HTML import needs preview, duplicate handling, provenance, progress,
  and rollback. Link capture should start with the URL and attempt metadata in
  the background; manual title entry remains the fallback.
- **Keep planning simple by default.** An empty Plan begins with `Add Items`, not
  `Create a Stage`. The default editor is an ordered outline with optional
  Stages. Branching is an advanced action; the graph is a supporting view, not
  the only way to understand or edit a plan.
- **Today should remain explicitly chosen.** Transparent, deterministic
  suggestions can help in v0, but nothing enters Today without the User choosing
  `Add`. Keep the working set intentionally small without enforcing an arbitrary
  quota.
- **AI belongs in v1 as a reviewable assistant, not as hidden automation.** Good
  first uses are Type and Label suggestions, semantic retrieval, draft Saved
  Views, draft Plans, and explained Today suggestions. Store proposals separately
  from accepted facts; support accept, edit, dismiss, undo, and a global off
  switch.

This recommendation deliberately reopens current decisions. The clarified
product—importing and managing bookmarks of *anything*—does not fit the present
Power Learner-only glossary, the learning-material Type enum, manual-only
Capture, or the rule that every fresh Item is `not started`. Those conflicts need
new product decisions before a visual redesign is treated as settled.

## 1. Product position: choose the broader promise explicitly

The repository currently defines Unshelf as a personal learning organizer for a
**Power Learner**, and an Item as learning material: article, video, playlist,
course, book, or other ([domain glossary](../../CONTEXT.md)). The clarified
promise is broader:

> Save or import anything worth returning to, find it again, and turn the few
> things that matter now into a plan and a doable day.

There are two coherent products, but mixing them silently is not coherent:

| Product position | What belongs | What “Done” means | Recommended action |
| --- | --- | --- | --- |
| Learning organizer | Articles, books, courses, videos, playlists | Material was completed | Keep the current glossary and market the narrower promise honestly. |
| Bookmark-to-action workspace | Any URL or offline reference; only some are actionable | Optional progress on Items the User chose to act on | **Recommended for the clarified brief.** Broaden Item semantics and separate storage lifecycle from action progress. |

This note assumes the second position. It still supports learning deeply—Plans,
Parts, target dates, and progress remain useful—but does not force learning
semantics onto every bookmark.

### Proposed v0 product sentence

**Unshelf is the calm place where saved things become findable, and the right
ones become actionable.**

This avoids promising that Unshelf reads or completes content for the User. It
also names the differentiator competitors usually leave open: the bridge from a
large saved collection to a small deliberate plan and today’s working set.

## 2. What current products establish

The matrix records capabilities evidenced in current first-party documentation.
An em dash means “not established by the reviewed source,” not “the product
definitely lacks it.” Marketing statements are treated as feature descriptions,
not evidence that the feature improves outcomes.

| Product | Capture and migration | Intake / lifecycle | Organisation and retrieval | Bridge to action | AI or automation evidenced | Useful lesson for Unshelf |
| --- | --- | --- | --- | --- | --- | --- |
| **Raindrop.io** | Browser extension, share sheet, bookmarklet, save-all-tabs, and HTML/CSV/TXT/JSON import; import previews found bookmarks/folders/tags and skips duplicate URLs ([extension](https://help.raindrop.io/install-extension/), [import](https://help.raindrop.io/import)) | Unfiled saves land in **Unsorted**; Trash is recoverable ([Collections](https://help.raindrop.io/collections)) | One folder-like Collection per bookmark; many Tags; auto-detected content Types; composable filters; bulk move/tag/open/delete ([Collections](https://help.raindrop.io/collections), [Filters](https://help.raindrop.io/filters), [Bookmarks](https://help.raindrop.io/bookmarks/)) | Favorites and reminders exist, but the reviewed docs do not establish a plan-to-today execution loop | Stella offers semantic search and proposes bulk organisation; major changes require confirmation, outputs link to sources, and AI can be disabled ([Ask Stella](https://help.raindrop.io/stella)) | Match capture/import/retrieval competence, but do not copy single-home folders. The confirmation and undo boundary is a strong model for future AI. |
| **Readwise Reader** | Browser extensions, share sheets, file/email routes, and imports; saves can obtain rendered content through the extension ([Adding content](https://docs.readwise.io/reader/docs/faqs/adding-new-content)) | Configurable Library workflows include Inbox → Later → Archive, Later → Shortlist → Archive, and Later → Archive ([Library configuration](https://docs.readwise.io/reader/guides/workflows/library-configuration)) | One flat document database, tags, full-text search, and saved query-backed Filtered Views; Type and source are filterable ([Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views), [filter syntax](https://docs.readwise.io/reader/guides/filtering/syntax-guide), [search](https://docs.readwise.io/reader/docs/faqs/searching)) | Shortlist creates a small active queue; Archive remains distinct from reading progress | Ghostreader can summarize and tag. Auto-tagging is experimental and the docs recommend manual triggering until the prompt is tested; prompts and models are configurable ([default prompts](https://docs.readwise.io/reader/guides/ghostreader/default-prompts), [custom prompts](https://docs.readwise.io/reader/guides/ghostreader/custom-prompts)) | Separate arrival, active shortlist, reading progress, and archive. Do not expose Reader’s full query language in the routine v0 path. |
| **Karakeep** | Browser extensions and HTML/Pocket/Omnivore import; imported titles, tags, and dates are preserved and an import list is created ([quick sharing](https://docs.karakeep.app/using-karakeep/quick-sharing/), [import](https://docs.karakeep.app/using-karakeep/import/)) | Favorite and Archive are personal states on bookmarks ([Bookmarking](https://docs.karakeep.app/using-karakeep/bookmarking/)) | Items can appear in several manual Lists; Smart Lists are saved-search results; Tags are lightweight cross-cutting labels; search supports state, Type, list, tag, source, and Boolean operators ([Lists](https://docs.karakeep.app/using-karakeep/lists/), [Tags](https://docs.karakeep.app/using-karakeep/tags/), [search language](https://docs.karakeep.app/using-karakeep/search-query-language/)) | A manual list can be a reading queue, but no first-party plan/Today loop was established | Optional automatic AI tagging and summarisation; operators can choose OpenAI-compatible or local Ollama models and change prompts ([configuration](https://docs.karakeep.app/configuration/environment-variables/)) | Manual Lists and Smart Lists prove that curated sets and dynamic views are different jobs. Keep imported provenance and let AI remain optional. |
| **Linkwarden** | Browser extension; bookmarks HTML and several migration formats are supported ([extension](https://docs.linkwarden.app/getting-started/browser-extension), [import settings](https://docs.linkwarden.app/Usage/profile-settings), [migration API](https://docs.linkwarden.app/api/import-data-for-migration)) | Pinning and preservation exist; the reviewed sources do not establish an Inbox-to-Today lifecycle | Each Link has one Collection and many Tags; advanced search covers title, URL, tag, date, Collection, description, Type, and exclusions ([overview](https://docs.linkwarden.app/Usage/overview), [advanced search](https://docs.linkwarden.app/Usage/advanced-search)) | — | Optional local AI can generate Tags or choose among predefined Tags ([AI tagging](https://docs.linkwarden.app/Usage/ai-tagging)) | General bookmark products need editable metadata, scalable retrieval, and import. Its one-Collection constraint is a poor fit for Unshelf’s flat Library plus overlapping views. |
| **Capacities** | Pasted links can remain plain URLs or become recognised Weblink objects | Every object has a Type, and Type can be changed later with a property-mapping confirmation | Overlapping Collections are manually curated; Queries are live saved filters; Type dashboards expose untagged and uncollected subsets ([Object Types](https://docs.capacities.io/reference/content-types), [Collections](https://docs.capacities.io/reference/collections), [Queries](https://docs.capacities.io/reference/queries)) | Task and daily-note systems exist, but they require explicit task semantics rather than treating every object as work | AI can generate some properties; the reviewed docs do not establish an automatic plan builder | Let Users start loosely and refine later. A recognised Type should be editable and never be confused with a folder or workflow state. |
| **Notion** | Web clipper saves pages; records can be created directly in databases | Lifecycle is workspace-defined rather than opinionated | The same records can appear in multiple filtered/sorted/grouped Views and open in a side peek while the database remains interactive ([Views and filters](https://www.notion.com/en-gb/help/views-filters-and-sorts)) | My Tasks aggregates records explicitly configured as tasks ([Task databases](https://www.notion.com/en-gb/help/guides/give-your-to-dos-a-home-with-task-databases)) | AI Autofill can summarize, extract, or classify; database generation is previewed before acceptance and Notion tells Users to check accuracy ([AI Autofill](https://www.notion.com/help/autofill)) | Reuse one Item in many projections and retain side-panel context. Avoid Notion’s cost: do not make Users invent the whole model. |
| **Todoist** | Fast entry and CSV project import | Inbox is the default home for unassigned tasks; Today and Upcoming are cross-project projections ([getting started](https://www.todoist.com/help/articles/get-started-with-todoist-OgNNJR)) | Projects, optional Sections, Labels, filters, and saved layouts; Sections are for breaking *large* projects into phases ([Sections](https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn), [Filters](https://www.todoist.com/help/articles/introduction-to-filters-V98wIH)) | Today is a small current-work view; completed tasks leave the active list | Filter Assist converts a plain-language request into a query, but the User still reviews and presses `Add filter` ([Filter Assist](https://www.todoist.com/help/articles/introduction-to-filters-V98wIH)) | Make optional Stages earn their place; let AI draft a deterministic object the User can inspect. Todoist’s warning that a successful CSV import cannot be undone is evidence for giving Unshelf import rollback ([CSV import](https://www.todoist.com/help/articles/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN)). |
| **Things** | Quick Entry and Inbox catch unprocessed thoughts or links | Inbox is temporary; Anytime is actionable; Someday is uncommitted; Logbook holds completion history ([default lists](https://culturedcode.com/things/support/articles/4001304/)) | Areas, Projects, Tags, search, and optional project Headings ([getting productive](https://culturedcode.com/things/support/articles/6378414/), [Headings](https://culturedcode.com/things/support/articles/2803577/)) | Today is a chosen cross-project focus; Someday stays visually quiet and out of actionable views | — | A broad possibility pool should not appear as active work. Unshelf needs the same semantic distinction without copying a full task manager. |

### Cross-product pattern

No reviewed product uses one status to mean all of these: newly arrived, kept,
filed, shortlisted, in a plan, selected today, partly consumed, completed, and
archived. The products that feel conceptually strongest use multiple narrow
axes. Reader separates location from reading progress; Things separates Inbox,
Someday, Today, and Logbook; Capacities separates objects from tasks; Notion
requires a database to opt into task semantics. That is the clearest evidence
for separating Unshelf’s saved lifecycle from optional action progress.

The prior [mixed-workflow research](mixed-learning-workflow-product-patterns.md)
and [power-learner research](power-learner-learning-material-workflows.md) reach a
compatible conclusion for learning material: arrival, Library membership,
commitment, daily attention, and completion are distinct jobs. This note extends
that finding across the entire general-bookmark v0.

## 3. Target mental model and value loop

### The four user-visible layers

| Layer | The question it answers | Membership | Typical actions | It is not |
| --- | --- | --- | --- | --- |
| **Inbox** | “What did I just save, and what does it mean?” | Dynamic: active Items with no `reviewedAt` | Confirm metadata, add Labels, keep as reference, add to Plan, archive, delete | A separate folder or a promise to reach zero |
| **Library** | “What have I kept, and how do I find it?” | Every non-trashed Item; Inbox is a view over it | Search, filter, label, save a View, bulk edit, open source | A backlog in which every row is unfinished |
| **Plans** | “Which saved things support this outcome, and in what order?” | Explicit placement of shared Items | Add, order, optionally group, branch, archive Plan | A category system or a duplicate copy of the Item |
| **Today** | “What small set deserves attention now?” | Explicit date-scoped selection | Start/resume, update progress, remove, carry forward | A second Plan or an automatic queue |

### Item axes

One Item can carry several independent facts:

```text
Identity       title · source · Type · metadata · provenance
Saved state    active · archived · trashed
Review state   unreviewed · reviewed
Meaning        Labels · Saved Views (derived)
Commitment     zero or more Plan placements
Attention      zero or one entry in today's Daily Focus
Progress       none · not started · in progress · done
Structure      optional ordered Parts
```

`Progress = none` is essential for the general bookmark product. It means “kept
as reference / no completion expected,” not “missing data.” Choosing `Add to
Plan`, `Track progress`, or creating Parts can offer to change `none` to `not
started`, but must explain and allow the User to decline.

### The value loop

The product should make three conversions easy and measure them separately:

1. **Outside → trusted Library:** a link or import becomes a clean, retrievable
   Item without demanding organisation up front.
2. **Library → deliberate commitment:** a few Items become a Plan with an
   outcome and an understandable next step.
3. **Commitment → action → closure:** the User chooses Today, makes progress,
   and records completion or archives a no-longer-relevant save.

Raw bookmark count is not the outcome. A successful v0 helps the User retrieve
what they saved and move a chosen subset forward without turning the entire
Library into guilt.

## 4. Recommended v0 information architecture

### Global navigation

Use four working destinations and one global action:

```text
Unshelf      Today    Inbox 12    Library    Plans          + Save
```

- **Today** remains the returning User’s home after onboarding.
- **Inbox** is visible, but its count is quiet and is never colored as an error.
- **Library** owns search, filters, Labels, Types, and Saved Views.
- **Plans** owns active and archived commitments.
- **Save** opens one non-navigating capture overlay from every surface.
- Remove disabled `Discover — Coming later` from primary navigation. Navigation
  describes what works now, not the roadmap.

On a phone, use a compact four-destination bottom or wrapping navigation bar and
a visible `Save` action; do not hide the core destinations behind an unlabeled
hamburger solely to preserve the desktop composition. The document—not an inner
panel—should own vertical scrolling, except for bounded result lists where scroll
position is deliberately preserved.

### Routes

```text
/today                         Current Daily Focus
/inbox                         Unreviewed Library Items
/library                       All active Items
/library/views/:viewId         Saved View (or URL-owned filter state)
/plans                         Active and archived Plans
/plans/:planId                 Outline editor
/plans/:planId/graph           Optional topology projection
/items/:itemId                 Canonical Item detail
/settings/import               Import start and batch history
/settings/import/:batchId      Preview/progress/result/rollback
```

Keep `/items/:itemId` canonical and retain the current side-panel-on-desktop
behavior. Notion’s first-party view documentation similarly keeps a database
interactive beside a side peek, and the existing [routing ADR](../adr/0013-adopt-react-router-and-url-structure.md)
already makes this a load-bearing Unshelf pattern.

### First-run destination

Do not drop an empty new account onto an unexplained empty Today. Show a one-time
setup surface with two equal, concrete paths:

1. `Import bookmarks` — for a real existing collection.
2. `Save your first link` — for a small clean start.

After one path succeeds, show a three-step checklist that can be dismissed:
`Find it in Library` → `Add one Item to a Plan` → `Choose one for Today`.
Do not gate the app on completing the tutorial.

## 5. Detailed v0 workflows

### 5.1 Onboarding and import

#### Import contract

Support the browser bookmarks HTML format first. Raindrop, Karakeep, and
Linkwarden all document this as a migration path; it is the widest useful v0
intersection. Add product-specific formats only after real failed imports justify
them.

Flow:

1. **Choose file.** Explain what will be read: URL, title, folder path, saved
   date where present. Do not upload until the User continues.
2. **Parse and preview.** Show counts: total rows, valid links, exact URL
   duplicates in the file, matches already in Unshelf, folder paths, and failures.
3. **Choose mapping.** Recommended defaults:
   - keep folder paths as import provenance;
   - optionally create Labels from the final folder names after preview;
   - import as `reviewed` by default for batches above a configurable threshold;
   - allow `Put new Items in Inbox` for a small intentional batch.
4. **Choose duplicate behavior.** Default `Skip exact URL matches`; alternatives
   `Review matches` and `Import separate copies`. Never silently overwrite an
   existing Item.
5. **Confirm.** Show the exact number of new Items and Labels before mutation.
6. **Run in background.** Keep a durable batch screen with progress and permit
   leaving the page. Report partial failures per row, not just “Import failed.”
7. **Result.** Offer `View imported Items`, `Review failures`, and `Undo this
   import`. Rollback removes only records created by that batch and reverses only
   batch-created Label memberships; it must not delete pre-existing Items that a
   duplicate rule reused.

Raindrop’s import preview and duplicate summary show the value of a review step
([import](https://help.raindrop.io/import)). Todoist documents that its completed
CSV import has no undo and requires manual bulk deletion, which is a failure mode
Unshelf can avoid ([Todoist CSV import](https://www.todoist.com/help/articles/import-or-export-a-project-as-a-csv-file-in-todoist-YC8YvN)).

#### Import must not create moral debt

An Inbox badge of 4,800 is not activation. For a large migration, default to
“Available in Library, marked reviewed,” then offer a Saved View named after the
batch. Preserve `importBatchId`, original folder path, source product if known,
and original saved timestamp so future filters and AI can reason without
overloading Labels.

### 5.2 Fast capture

The default path for a link should be:

```text
Paste URL → Save now
             └ metadata/type suggestion fills asynchronously and remains editable
```

Recommended overlay:

1. **Source URL** first.
2. Fetch title, canonical URL, site name, description, favicon/preview, and a
   bounded Type suggestion in the background.
3. Show editable **Title** and **Type** as soon as available. Use `Web page` or
   `Other` as the honest fallback rather than blocking capture.
4. Optional collapsed `Organize now`: Labels, add to a Plan, track progress.
5. Primary action `Save to Inbox`; secondary `Save as reviewed`.

For an offline save, `Add without a link` switches to Title first and asks for a
Type. The user-visible Type can be broader than today’s learning enum—for
example Article, Video, Course, Book, Podcast/Audio, Product, Place, File,
Web page, Other—but this is a domain decision, not a prototype-only rename.

If metadata fetch fails, keep the URL, let the User enter a title, and offer
`Retry metadata` later. Capture success must not depend on a third-party page
being fetchable. If an exact normalized URL already exists, show the existing
Item and offer `Open existing` (primary) or `Save another copy`; do not surprise
the User with silent dedupe.

The current capture interaction can retain its accessible native modal basis.
The WAI-ARIA modal-dialog pattern requires contained focus, Escape/close behavior,
an accessible name, and focus return ([modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)).

### 5.3 Inbox and triage

Inbox is a dense review queue with two modes:

- **Quick review:** one Item at a time, keyboard friendly.
- **Bulk review:** selection checkboxes and a persistent action bar.

Each row shows Title, domain, Type suggestion/confirmation, saved time, and
import/capture source. Primary row actions:

- `Keep` — marks reviewed and leaves the Item in Library.
- `Add to Plan…` — places it and marks reviewed.
- `Archive` — removes it from active retrieval without marking Done.
- `Delete` — moves to Trash with Undo.

Labels and Type editing sit behind `Organize`, not in the critical path. Bulk
actions include Keep, add/remove Labels, set Type, archive, and delete. Preserve
selection across pagination only when the scope is explicit (`24 selected on
this page`; `Select all 1,420 matching Items`).

The empty state is celebratory but neutral: `Inbox reviewed` with `Browse
Library` and `Save something`. Never imply the User failed when Inbox is not
empty. Things calls Inbox a temporary staging ground, while Reader offers both
triage-heavy and simpler configurations; those first-party workflows support an
Inbox that helps but does not dictate one method
([Things default lists](https://culturedcode.com/things/support/articles/4001304/),
[Reader Library configuration](https://docs.readwise.io/reader/guides/workflows/library-configuration)).

### 5.4 Library

The Library’s first screen should prioritize retrieval over per-row editing:

```text
Library                                      2,431 Items
[ Search title, URL, domain, Labels…                         ]
[Filters] [Sort: Recently saved] [Save view]       [Select]

Active: Type = Video ×   Status = In progress ×   Clear all

All | Unreviewed | In progress | Unplanned | Done | Archived
```

#### Filters

Start with a simple visual builder:

- Type
- Label
- saved lifecycle: active / archived
- review state: reviewed / unreviewed
- progress: none / not started / in progress / done
- Plan membership: in any Plan / not in a Plan / named Plan
- Today: selected / not selected
- source domain
- saved date and import batch
- has Parts / target date / past target

Filters combine without silently clearing other axes. Show active chips outside
the popover and keep the state in the URL. Correct `Unplanned` to mean no active
Plan placement; it must not mean “has no Labels.”

#### Saved Views (“sub-sections”)

The User’s requested sub-sections should be **Saved Views**, not folders:

1. Apply filters and sort.
2. See the matching count immediately.
3. Choose `Save view`.
4. Name it and optionally pin it under Library.

Deleting a View says `Items stay in Library`. Readwise, Capacities, Notion,
Karakeep, and Readeck all document query-backed reusable subsets; this is a
better match for the one-Item spine than single-home folder trees
([Reader Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views),
[Capacities Queries](https://docs.capacities.io/reference/queries),
[Notion Views](https://www.notion.com/en-gb/help/views-filters-and-sorts),
[Karakeep Smart Lists](https://docs.karakeep.app/using-karakeep/lists/)).

#### Scale

Import makes the current `fetchAll` plus client-side filter model insufficient.
v0 needs server-side search/filter/sort, stable cursor pagination, result counts,
and bounded rendering. Start with one dense list layout; defer moodboards and a
large card gallery until visual bookmarking is a validated need. Search should
cover title, Source/domain, and Labels in v0; metadata description and archived
content can join when actually stored and indexed.

### 5.5 Item detail

Make the top of detail answer “what is this, why did I keep it, and what can I do
next?”

1. **Open original** — primary action for a linked Item.
2. Editable Title, Source, Type, description/`Why I saved this`, and Labels.
3. Saved lifecycle and review state.
4. Optional progress and target date.
5. `Add to Today` and Plan placements.
6. Optional Parts, collapsed until used.
7. Provenance: saved date, capture channel/import batch, original folder path.
8. Archive, move to Trash, and restore actions with clear consequences.

Today, Parts and Plan placement dominate the current Item sidebar while basic
bookmark operations—edit Title/Source/Type, prominent Open original, Archive,
and Delete—are absent. Reverse that hierarchy for the broader product. Parts are
powerful for a course or book and irrelevant to most reference bookmarks.

### 5.6 Plans

#### Plans index

Each active Plan card shows:

- Plan name and optional outcome statement;
- the next incomplete Item;
- `x of y done` only for Items tracking progress;
- last activity;
- primary `Open plan`, secondary Archive.

Archived Plans live behind one filter, not intermixed by default. The empty
state asks `What do you want to make progress on?` and opens a two-step creation:
name/outcome, then add Items from Library.

#### Plan editor

Use an **outline first**:

```text
Learn product analytics                         3 of 8 complete

[+ Add Items]  [+ Stage]  [More: Branching view · Archive]

01  Metrics foundations               Done
02  Event design                       In progress    [Add to Today]
    Stage: Instrumentation
03  Tracking-plan examples             Not started
04  Validation checklist               Not started
```

- Empty primary CTA: `Add Items from Library`.
- Drag handles may be offered, but every reorder has keyboard/button alternatives
  such as `Move before…`, `Move after…`, `Move to Stage…`.
- Stages are optional headings for a real phase or checkpoint. `Create Stage`
  remains secondary.
- Branching is invoked with words: `Start parallel path`, `Join after`, `Remove
  connection`. The graph route visualizes it, but the outline remains the stable
  editing and mobile surface.
- Do not show Library drawer, graph canvas, loose-node rail, Stage editor, and
  Today sidecar simultaneously. Open one job at a time and preserve context.
- Today selection belongs in Today or a simple row action, not a permanently
  expanded Plan sidecar.

The detailed reasoning for direct Items plus optional Stages is already in
[Learning-plan stage models](learning-plan-stage-models.md). Todoist likewise
documents Sections as a way to break *large* projects into phases, not as a
mandatory parent of every task ([Sections](https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn)).

#### What to do with the DAG in v0

Preserve the current topology data seam, but do not make graph authoring the
entry price. Most v0 Plans should be a linear order, optionally grouped. Expose
branches only after the User chooses the advanced action. If usability testing
cannot make `what comes next` clear in both outline and graph, defer branch
authoring from v0 rather than ship an impressive but confusing canvas.

### 5.7 Today and execution

Today has two regions, not a planning studio:

1. **Today’s list** — explicit picks in user-controlled order.
2. **Choose more** — collapsed suggestions and Library search.

Each Today row shows a clear next action:

- `Open original` for a simple bookmark;
- `Resume` plus Part progress for a structured Item;
- status/progress control;
- origin Plan and Stage;
- `Remove from Today` without changing Plan or Library membership.

v0 suggestions can stay deterministic and explainable:

- unfinished from yesterday;
- next incomplete Item in an active Plan;
- already in progress and inactive longest;
- approaching soft target;
- recently committed but not yet started.

Show the reason beside every suggestion, and require `Add`. An intention search
that merely exact-matches words should be labelled `Filter by words or Labels`,
not presented as intelligent understanding. Debounce input and cancel stale
requests; do not refetch on every keystroke without feedback.

At day end or next visit, offer a small review: keep unfinished Items today,
return them to their Plan/Library, or mark them done. Past Daily Focus remains a
secondary `History` route and never dominates the main navigation.

### 5.8 Completion, archive, and review

Completion and archive answer different questions:

- `Done`: “I completed the action/material I intended.” Retain `completedAt`.
- `Archive`: “Keep this out of my active Library.” It may be reference material,
  completed, abandoned, or simply no longer relevant.
- `Remove from Plan`: “This no longer belongs to this outcome.” The Item remains.
- `Remove from Today`: “Not today.” The Plan and Library remain.
- `Trash`: “I do not want Unshelf to keep this.” Make it recoverable for a
  retention window before permanent deletion.

When an Item becomes Done inside a Plan, show a quiet, non-modal consequence:
`Done. Next in “Learn product analytics”: Event taxonomy` with `Add next to
Today`. Do not automatically add it. When the last tracked Item completes, offer
`Archive Plan` but leave that decision explicit.

A lightweight Library review can be a Saved View (`Active, not opened or
changed for 90 days`), not a notification system. Outbound reminders remain a
later feature.

### 5.9 Search, filters, and command behavior

- `/` focuses global Library search from Library/Inbox.
- `Cmd/Ctrl + K` should be reserved for a command palette *or* capture, not both;
  retain `c` for Capture only when focus is not in an editable field.
- Search is global by default and clearly indicates when scoped to a View or
  Plan drawer.
- Show recent searches only after evidence they help; never let suggestions
  obscure exact results.
- Return result snippets explaining the match: Title, Label, domain, or
  description.
- Advanced syntax is a later power-user layer. v0’s visual filter builder should
  serialize to a stable rule object, not to free-form text that cannot be safely
  migrated.
- `Save as View` stores filters, sort, and visible columns/layout—not a copied
  Item list.

## 6. State design: empty, loading, error, success

| Surface / operation | Empty | Loading | Recoverable error | Success feedback |
| --- | --- | --- | --- | --- |
| First run | Two paths: Import or Save first link | Auth resolution remains chrome-less | Sign-in retry without losing intended route | Short, dismissible setup checklist |
| Capture | URL-first form; offline alternative | Metadata placeholder must not disable Save | `Couldn’t fetch details`; keep URL/title input and offer Retry | Announce `Saved to Inbox`; Undo and Open Item |
| Import | Explain accepted file and data | Durable batch progress with counts | Per-row failures; retry failed rows; preserve completed rows | Counts plus View batch / Undo batch |
| Inbox | `Inbox reviewed` | Skeleton rows with `Loading Inbox` status | Keep previous results when possible; Retry | Row leaves with Undo; count updates without alarm |
| Library | `Nothing saved yet` | Preserve toolbar dimensions; labelled status | Retry without removing global nav or URL filters | Filter count and non-interrupting status message |
| Filtered View | `No Items match`; Edit View / Clear filters | Keep active chips visible | Invalid/deleted View → Back to All | View name and count persist in URL/history |
| Item detail | Unknown Item → Back to Library | Sidebar skeleton with accessible label | Retry in sidebar; underlying context remains | Inline saved state or toast; never clear unsaved fields silently |
| Plans | `Create a Plan from Library Items` | Skeleton cards | Retry | New Plan opens with Add Items as next step |
| Empty Plan | `Add Items from Library` primary; Stage secondary | Drawer/results skeleton | Keep query and selected Items on retry | Added rows appear in outline with Undo |
| Today | `Choose a small working set` | Load today and suggestions independently | Today list remains usable if suggestions fail | Added/removed/completed message announced |

Use `role=status` or an appropriate live region for asynchronous outcomes that
do not move focus; WCAG 2.2 includes programmatic status-message requirements
([WCAG 2.2 Understanding index](https://www.w3.org/WAI/WCAG22/Understanding/)).
Errors should identify the field and suggest a correction, while destructive or
bulk changes should be reversible, previewed, or confirmed
([WCAG 2.2](https://www.w3.org/TR/WCAG22/)).

## 7. Responsive and accessibility requirements

Target WCAG 2.2 AA for v0, including:

- **Reflow:** all routine workflows work at 320 CSS px width and at 400% zoom
  without page-level two-dimensional scrolling. A graph may pan inside a labelled
  container, but the outline must provide the same authoring tasks
  ([Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).
- **Keyboard:** every action is reachable in a logical order; drag is never the
  only way to reorder or connect; Escape closes popovers/dialogs and focus returns
  to the invoking control.
- **Focus:** visible focus is never covered by sticky bars or side panels; active
  selection and keyboard focus look different.
- **Targets:** meet WCAG 2.2 target-size requirements and use larger practical
  touch targets for row actions rather than dense icon-only clusters
  ([WCAG 2.2 new criteria](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)).
- **Names and instructions:** visible labels for fields and icon+text for primary
  actions. Type suggestions use an accessible select or a correctly implemented
  combobox with manual selection; the WAI-ARIA combobox pattern defines the
  required roles and keyboard behavior
  ([combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).
- **Color and motion:** Status never relies on color alone; both themes retain
  contrast; reduced-motion removes canvas and row-transition animation.
- **Announcements:** saving, applying filters, moving Items, import progress,
  errors, and Undo are available to assistive technology without stealing focus.

Responsive behavior by workflow:

- Library split preview becomes a full-width Item route on phone; returning
  restores query, filters, selection, and scroll position.
- Filter popovers become labelled bottom sheets or full-width dialogs.
- Bulk actions remain sticky and state their selection scope.
- Plan outline is fully editable on phone. The graph is optional and view-only
  unless later testing validates touch authoring.
- Today uses one column; `Choose more` follows the active list rather than
  competing beside it.

## 8. What to remove or defer from the current UI

### Remove or change for v0

- Remove disabled `Discover — Coming later` from the primary navigation.
- Remove prototype/process labels such as `Variant D · Global room`.
- Replace internal-domain explanations such as “Daily Focus is a dated agenda,
  not a small Learning Plan” and “Derived from each Item’s shared Status” with
  task-focused copy.
- Stop describing Library as “passive” and Plans as “durable commitments” in
  headings; demonstrate the distinction through actions and state.
- Fix `Unplanned`: the current implementation checks `labels.length === 0`, not
  Plan membership.
- Do not default every saved reference to an unfinished visual state.
- Do not make Type selection a blocking manual step for a normal URL after the
  domain broadens; show and allow correction of a suggestion.
- Add the missing bookmark basics to Item detail: prominent Open original,
  metadata edit, archive, Trash, provenance.
- Replace the empty-Plan Stage CTA with Add Items.
- Make the outline primary and stop presenting Library drawer, graph, Stage
  tooling, and Today sidecar simultaneously.
- Replace symbolic graph controls with named actions and an alternative to drag.
- Add debounce/cancellation to Today search/refinement requests.
- Move search/filter/sort/pagination server-side before real imports are invited.

### Defer until after v0 evidence

- Discover/recurring feeds and provider integrations.
- Automatic page archiving, reader mode, highlights, and annotations.
- Public sharing, collaboration, teams, and permissions.
- Native apps and a full browser extension. A small bookmarklet or share target
  is a valuable Next candidate after the web loop works.
- Notifications, calendar scheduling, streaks, gamification, and outbound
  reminders.
- A permanently visible graph canvas and advanced arbitrary DAG authoring.
- Nested folders, nested Labels, and user-defined Type schemas.
- AI-generated summaries, automatic tags, semantic search, and plan generation
  until the non-AI objects and correction paths are sound.
- Visual gallery/moodboard layouts unless research recruits a visual-bookmark
  segment that cannot work well in the dense list.

## 9. AI in v1—and the v0 seams it requires

AI should reduce repeated classification and planning work while keeping the
User’s intent authoritative. Microsoft’s validated human–AI guidelines call for
clear capability/quality expectations, efficient dismissal and correction,
scoping when uncertain, explanations, granular feedback, and global controls
([Microsoft Research guidelines](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/)).
Google PAIR similarly recommends balancing automation with the ability to edit
or turn it off and connecting feedback to visible experience changes
([PAIR feedback and control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)).

### Prioritized AI use cases

| Use case | User value | Interaction | Risk boundary |
| --- | --- | --- | --- |
| **Type suggestion** | Removes a routine capture choice | `Suggested: Video · from youtube.com`; accept/edit | Never block on inference; low confidence falls back to Web page/Other |
| **Metadata cleanup** | Better titles/descriptions after import | Batch preview: current → proposed | Never overwrite user-edited fields without explicit selection |
| **Label suggestion and normalization** | Reduces tag sprawl | Suggested existing/new Labels; accept individually or in reviewed bulk | Keep generated and user Labels distinguishable in provenance, not visually stigmatized |
| **Duplicate/near-duplicate review** | Cleans large imports | Cluster with reasons; merge/keep decisions | No autonomous merge; preserve sources, Plans, progress, and history |
| **Natural-language Saved View** | Makes filters approachable | “Videos about design I haven’t started” → visible deterministic rules → Save | AI drafts rules; the stored View remains a versioned rule object |
| **Semantic search** | Finds vaguely remembered Items | Results cite the title/snippet that matched; exact search remains available | Explain indexing delay and scope; do not invent nonexistent Items |
| **Draft a Plan** | Reduces blank-page planning | User supplies outcome and candidate scope; AI proposes ordered Items/Stages with reasons | Preview only; no Items created, moved, or scheduled until confirmed |
| **Arrange an existing Plan** | Suggests sequence/parallel work | Show proposed diff and rationale; accept per move or whole draft with Undo | Preserve manual order; never claim prerequisites as fact without source/user input |
| **Today suggestions** | Reduces choice overload | Proposed 1–3 Items with reason, estimated effort if known, and Add | Never auto-add; Learn less from dismissal only when User opts in |
| **Summary / Parts draft** | Helps decide value or structure a course/book | User invokes on an Item; output can be saved or discarded | Cite source content used; never mark Parts complete or status Done |

Raindrop’s current assistant requires confirmation for major organisation
changes and links answers to sources; Readwise keeps auto-tagging experimental
and recommends testing the prompt manually; Todoist’s Filter Assist drafts a
query that the User still adds. These first-party designs all support
**proposal → inspection → acceptance**, not silent mutation
([Raindrop Stella](https://help.raindrop.io/stella),
[Readwise prompts](https://docs.readwise.io/reader/guides/ghostreader/default-prompts),
[Todoist Filter Assist](https://www.todoist.com/help/articles/introduction-to-filters-V98wIH)).

### Confidence behavior

Do not show a fake-precision percentage unless calibrated and useful.

- **High confidence:** preselect a visibly labelled suggestion, still editable.
- **Medium confidence:** show two or three choices with evidence.
- **Low confidence / insufficient data:** use the safe fallback and let the User
  choose; do not fabricate a classification.

Every proposal has `Why?`, `Accept`, `Edit`, and `Dismiss`. Bulk proposals have a
diff, affected count, confirmation, and Undo. AI never writes Plan topology,
Labels, progress, target dates, or Today membership invisibly.

### Privacy and control

Before the first AI action, explain:

- which fields/content will be sent;
- which provider/model processes it;
- retention and training policy;
- whether page contents or only metadata are used;
- how to disable AI globally and per feature.

Prefer per-action scoping in the first release. Readwise documents sending only
the portion needed by an invoked prompt, while Raindrop documents a hosted model,
no training use, explicit invocation, and a global disable control
([Readwise Ghostreader privacy](https://docs.readwise.io/reader/docs/faqs/ghostreader),
[Raindrop Stella](https://help.raindrop.io/stella)). These are product precedents,
not substitutes for Unshelf’s own privacy review.

### v0 data/model seams

Preserve these before AI ships:

- raw Source, normalized URL, resolved/canonical URL, domain;
- fetched metadata values **and field provenance** (`user`, `import`, `fetch`,
  future `ai`), plus `userEditedAt` so refresh does not overwrite intent;
- capture channel, import batch, original folder path, original saved time;
- `reviewedAt`, archive/trash timestamps, last opened/activity timestamps;
- optional progress distinct from saved lifecycle;
- Plan placement identity and order; explicit Stage and edge records;
- deterministic Saved View rule JSON with a schema version;
- suggestion record: feature, model/prompt version, bounded input references,
  output, confidence band, explanation/evidence, created time, outcome
  (accepted/edited/dismissed), and Undo link where applicable;
- granular correction events without retaining more source content than needed;
- explicit AI preferences and consent version.

Accepted values remain ordinary domain facts. Never make the application read a
model output blob as if it were the canonical Item Type or Plan.

## 10. Prioritized roadmap

### Now — coherent v0

1. Decide the broader product position and separate saved lifecycle from
   optional progress.
2. Establish Inbox as a dynamic review state and remove roadmap/prototype copy.
3. Build URL-first capture with metadata fallback, duplicate warning, and Undo.
4. Build bookmarks-HTML import with preview, provenance, duplicate rules,
   progress, partial retry, and rollback.
5. Move Library query/filter/sort to the API; add pagination, bulk actions, and
   correct Plan-membership filters.
6. Ship simple filters plus Saved Views and active filter chips.
7. Reorder Item detail around Open original, editable metadata, lifecycle,
   Labels, optional progress, Today, Plans, and collapsed Parts.
8. Make Plan outline primary; add Items first; keep Stages optional; move graph
   and Today sidecar behind explicit actions.
9. Simplify Today to explicit picks plus explained deterministic suggestions.
10. Complete responsive, keyboard, assistive-technology, error, empty, loading,
    and Undo states for the end-to-end loop.

### Next — reduce capture and retrieval friction

- Bookmarklet or small browser extension after the web capture contract is
  stable.
- Mobile share target/PWA evaluation.
- Better metadata refresh, favicon/thumbnail, and description indexing.
- Import mappings for Raindrop/Reader/Karakeep exports based on demand.
- Trash retention and batch history UI.
- Saved View management, view pinning, and recently used filters.
- Lightweight stale-Library review and resumption cues.
- Usability-tested branch editing if linear plans prove insufficient.

### Later — AI-assisted v1 and adjacent bets

- Type/Label/metadata suggestions and normalization.
- Natural-language Saved Views and semantic search.
- Draft Plan and ordering proposals with preview/diff/Undo.
- Explained personalized Today suggestions.
- User-invoked summaries and Parts drafts.
- Only after evidence: recurring discovery, reminders, reader/archive content,
  collaboration, sharing, native clients, and integrations.

## 11. Success criteria and instrumentation

### North-star behavior

**Weekly useful returns:** the percentage of active Users who reopen a previously
saved Item *or* move an existing Item into a Plan/Today and then record progress,
completion, or archive. This measures use of saved material without requiring
every bookmark to become work.

### v0 funnel metrics

| Journey | Event boundary | Initial product hypothesis |
| --- | --- | --- |
| First value | Sign-up → first successful capture/import → reopen/find one Item | ≥70% of research/beta Users complete without assistance |
| Capture | Open Save → successful Item → Undo/duplicate outcome | ≥95% technical success; median normal link save under 30 seconds |
| Import | File chosen → preview → confirmed → completed/partially completed | ≥90% task completion; 100% of completed batches have a visible result and rollback state |
| Retrieval | Start from Today/Library → open a named previously saved Item | ≥80% usability-task completion within 30 seconds |
| Triage | Open Inbox → correctly keep/plan/archive/delete test Items | ≥80% completion with no confusion about Library membership |
| Plan | Start from Plans → create Plan → add/order three existing Items | ≥80% completion without creating an accidental mandatory Stage |
| Today | Choose an existing planned Item → add to Today → open/resume it | ≥85% completion within one minute |
| Semantics | Explain difference among Inbox, Library, Plan, Today, Done, Archive | ≥80% can predict where an Item remains after each action |

Track latency, failures, abandon points, duplicate choices, Undo use, filter-zero
results, plan-editor mode, and suggestion accept/dismiss—not the bookmark text or
URL query by default. Establish a privacy-reviewed analytics dictionary before
instrumentation.

Do not optimize raw saves, Inbox zero, number of Labels, Plan size, or streaks.
GOV.UK’s first-party service guidance recommends defining start/end points,
measuring completion and time, and combining performance data with user research
rather than relying only on analytics
([measuring success](https://www.gov.uk/service-manual/measuring-success/measuring-the-success-of-your-service),
[completion rate](https://www.gov.uk/service-manual/measuring-success/measuring-completion-rate)).

## 12. Usability-test plan

Run three iterative rounds with 4–8 participants each; GOV.UK recommends this
range for interviews and usability testing and recommends more rounds rather
than one oversized round ([research planning](https://www.gov.uk/service-manual/user-research/plan-user-research-for-your-service)).
Include at least one keyboard-only participant and participants using a screen
reader or magnification across the rounds.

Recruit across these behaviors:

- large browser-bookmark importer (1,000+ links);
- frequent mixed-media saver;
- reference-first collector who rarely “finishes” a bookmark;
- goal-oriented learner who wants ordered Plans;
- mobile-first capture/review User;
- accessibility needs and low confidence with complex productivity software.

### Round 1 — mental model and IA

Use a clickable prototype with realistic data.

Tasks:

1. Save a restaurant for reference and predict whether it is unfinished.
2. Save a course, add it to a Plan, and choose it for Today.
3. Find an article saved two months ago using a vague clue and filters.
4. Archive a completed article and predict where it remains.
5. Explain Inbox, Library, Plans, and Today in their own words.

Decision gates: broader Item semantics; whether Inbox is understood as a view;
whether optional progress solves reference guilt; nav order and labels.

### Round 2 — import, triage, and Library scale

Give each participant a representative bookmarks HTML file with duplicates,
folder paths, invalid rows, and one conflict with an existing Item.

Tasks:

1. Preview and import without creating an unwanted 1,000-item Inbox.
2. Explain what happens to duplicates.
3. Find only unplanned videos about a topic.
4. Save that result as a named View and later delete the View.
5. Undo the import and predict which pre-existing data remains.

Decision gates: import defaults, folder-to-Label mapping, duplicate language,
rollback confidence, server-side result feedback, Saved View terminology.

### Round 3 — plan and execute

Tasks:

1. Create a three-Item linear Plan without a Stage.
2. Add a meaningful Stage to a longer Plan.
3. Move one Item after another without drag.
4. Make two Items parallel, then explain what comes next.
5. Add one planned Item to Today, complete it, and choose whether to add the next.

Decision gates: whether branching earns v0 scope; outline/graph comprehension;
Stage optionality; Today separation; completion/archive language.

For every task record completion, time, wrong turns, requests for help, confidence,
and the participant’s prediction of side effects. Moderated testing is suited to
seeing whether Users understand and can complete tasks, and think-aloud exposes
language/layout problems ([GOV.UK moderated usability testing](https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing)).

## 13. Explicit conflicts requiring new decisions

| Current decision or model | Conflict with the clarified product | Required decision |
| --- | --- | --- |
| [`CONTEXT.md`](../../CONTEXT.md): Power Learner; Item is learning material; avoid “Bookmark” | “Anything and everything” includes reference, shopping, travel, recipes, places, and offline ideas | Reaffirm a learning-only product or adopt a general saved-Item definition and decide whether `Bookmark` becomes user-facing language. |
| [ADR-0003](../adr/0003-one-item-spine-with-per-type-details.md): fixed learning Types, user-chosen, no default | General bookmarks exceed Article/Video/Playlist/Course/Book; blocking capture on a manual Type harms fast saving | Decide a broader bounded Type taxonomy, a generic fallback, detection/provenance, and whether user-defined Types remain deferred. Preserve the one-Item spine. |
| [ADR-0007](../adr/0007-ingestion-is-one-uniform-manual-capture.md): no metadata fetch, import, validation, or dedupe | Import and URL-first capture are core to replacing browser bookmarks | Supersede manual-only ingestion: define fetch failure, normalized/exact duplicates, import batches, mapping, provenance, partial failure, and rollback. |
| [ADR-0008](../adr/0008-single-responsive-web-app-desktop-primary.md): in-app form only; extension/bookmarklet deferred | Competitors make ambient capture a core path, but the user asked for web v0 first | Keep web-only v0 if desired, but explicitly put bookmarklet/extension in Next and make capture/import contracts channel-neutral. Let the outline—not only a desktop graph—author Plans on mobile. |
| Shared [`Status`](../../packages/shared/src/index.ts): every capture defaults `not_started` | Reference saves become false obligations; Archive is absent on Item | Add an independent saved lifecycle and make progress optional/nullable or explicitly activated. Decide how Parts and Plan placement interact with `progress = none`. |
| Library is every Item, with no Item archive/trash | A general bookmark manager needs active cleanup without equating archive to Done or permanent delete | Define archived/trash retention and default query semantics while keeping inherent Library identity. |
| Capture lands immediately in Library; no Inbox term for manual saves | Triage is needed for quick capture/import but should not create a second owner | Define Inbox as `reviewedAt is null` system View and batch review rules; keep one Item record. |
| [ADR-0014](../adr/0014-next-gen-surface-model-and-navigation.md) originally locks a small top bar; current update adds Today/Discover/Library/Plans | Disabled Discover advertises unavailable scope; Inbox is missing | Update navigation decision to Today/Inbox/Library/Plans plus Save; keep Discover out until routable. |
| [ADR-0018](../adr/0018-learning-plans-replace-trails-and-stages-replace-stops.md): optional Stages, direct Items valid | Current empty Plan still makes Stage creation primary and the UI exposes many simultaneous tools | Align presentation with the ADR: Add Items first, outline default, Stage secondary, branching progressive. No domain reversal required. |
| Current Daily Planning deterministic signals and lexical intention matching | UI copy can be misread as AI/personalized understanding | Name it transparent rules/search in v0; preserve explanation/suppression seams; decide v1 AI separately. |
| Current Library `Unplanned` checks absence of Labels | The name asserts Plan membership semantics the code does not implement | Fix the query and add an API projection/index for active Plan membership. |
| Current Saved View prototype uses `kind`, arbitrary strings, and “subsections” | Conflicts with canonical Type and may imply storage folders | Decide Type taxonomy first; ship query-backed `Saved View`; keep custom descriptions separate from canonical Type if needed. |

### ADR sequence recommended before implementation

1. **Product scope and Item lifecycle:** general saved Item, archive/trash,
   optional progress.
2. **Ingestion and provenance:** URL metadata, duplicates, import batches,
   rollback, capture channels.
3. **Type and organisation:** bounded general Type, Labels, Saved Views, Inbox
   review state.
4. **v0 IA and navigation:** Today/Inbox/Library/Plans, responsive behavior.
5. **Plan presentation:** outline-first, progressive branching, mobile authoring;
   topology data can remain.
6. **AI proposal boundary (v1 seam):** inference records, control, privacy,
   acceptance/correction, and audit/Undo.

## 14. Limitations

- Product documentation establishes current capabilities and product language,
  not causal evidence that a UI improves retention or completion.
- Marketing claims such as “quick,” “smart,” or “powerful” were not treated as
  evidence; only documented workflows influenced the recommendations.
- No user interviews or observation were performed for this note. The roadmap’s
  branch, Inbox, taxonomy, and mobile decisions remain hypotheses until the
  proposed usability rounds.
- AI model accuracy, cost, latency, and privacy depend on a provider and data
  policy that Unshelf has not selected. The v1 section therefore defines
  interaction and data seams, not a vendor choice.
