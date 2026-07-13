# Ingestion is one uniform manual capture; no fetch, no import

v1 has no ingestion machinery. Content enters Unshelf through a **single uniform
manual capture** — the User creates an **Item** by hand with a required title, a
chosen type, and an optional Source, landing in **All**. There is no metadata
fetch on paste (the User types the title — ADR-0003's "title typed by hand"
governs), no bulk **import** from Raindrop or Chrome (#13), and — with no import
— no one-time-migration-vs-ongoing-sync question left to answer. We chose this
because v1 is a personal, dogfooded tool where hand-typing a title is cheap,
while a fetcher/importer is real infrastructure (network calls, HTML parsing,
paywalls and JS-rendered pages, timeout/failure/fallback paths, dedupe matching)
sitting off the founder's core "take the organising load off me" critical path —
the same reasoning that deferred chapter auto-fetch (#9, ADR-0002).

## What this collapses

- **"Paste-a-URL" and "add-by-title" are not two flows.** With nothing fetched,
  both are the same insert: title (required — the Item's identity, ADR-0003),
  type (chosen, no default), Source (optional). A URL fills Source; an offline
  book leaves it blank. v1 stores no provenance — an Item is just an Item, never
  "a pasted one" vs "a typed one."
- **No dedupe.** Capture is a pure insert; capturing the same link or title twice
  yields two independent Items. "One Item" is a model-identity statement (one
  row, referenced by many Stops), not a source-uniqueness guarantee. A matching
  engine is a fast-follow only if dupes prove painful in practice.
- **Source is stored verbatim, unvalidated.** Whatever the User pastes is kept
  as-is; if it is a URL it renders clickable, otherwise it is inert text. Capture
  never rejects over Source shape — a soft, optional pointer that never nags.

## Considered options

- **Fetch-on-paste (pre-fill title/type/thumbnail from the page).** Rejected for
  v1: it is the more convenient bookmark-tool UX, but it buys a fetcher and its
  whole failure surface for a single-user tool — and it is a clean *additive*
  seam, since pre-filling the *same* `title`/`type` fields later reshapes
  nothing, so deferring it costs no rework.
- **Bulk import / ongoing sync (Raindrop, Chrome).** Rejected (#13): no import
  path to ground in a real corpus, and bulk migration is post-v1 roadmap. Reopen
  when it lands — that is when real exports become useful design fodder.

## Consequences

- **The capture *channel* is not decided here.** Web form, browser extension,
  share sheet, bookmarklet — that is a platform/UX question (#10, #11). #8
  decides *what capture is* (one manual insert), not where you invoke it.
- **CONTEXT.md tightened:** the *Item* "only one of it" line now reads explicitly
  as model-identity, not source-uniqueness, and a **Capture** term is added,
  distinct from the deferred bulk **Import**.
- **Fetch and import are named fast-follows,** both additive to the existing Item
  spine (ADR-0003) — neither reshapes the Item when picked up.
