# v1 feature cut: capture, organise, and item-level track — nothing else

Unshelf v1 ships three of the founding brief's five verbs — **dump, organise,
track** — and explicitly defers the other two. A User captures Items (paste a
link, or add manually by title) into a single catch-all folder (**All**),
organises them by pulling Items into **Stops** and arranging those Stops on a
visual **Trail** (sequence + parallel forks, but no dates), and tracks progress
at the **item level only** (e.g. not started / in progress / done). We chose
this because the founder's core promise is to take the *organising* load off the
user's mind: the job that replaces Raindrop + Chrome bookmarks day to day is
capture → arrange → mark progress. The brief's headline scheduling and reminding
are configure-occasionally features whose cost (a scheduling engine; reminder
delivery infrastructure) and whose nagging character work against that calm,
organise-once promise — so they wait.

## Deferred (explicitly, not forgotten)

- **Reminders** (revision / backlog) — heaviest infrastructure (delivery
  channels, scheduling) for an occasional-use feature. Out of v1. (#7)
- **Dates / timeline / calendar** — the Trail expresses "what to do first /
  next" as *topology* only. Ordering yes, calendar no. (#6) _Refined by
  ADR-0005: a soft, passive **target date** (and a captured completion date) do
  land in v1 as fields on the Item — it is the scheduling **engine**, calendar
  slotting, and delivery/nudges that stay deferred, not "when" wholesale._
- **Sub-item check-off** (chapters, lessons, videos) and the **auto-fetch** that
  would populate those lists — a direct departure from the brief's "the app
  creates the list of chapters and you check them off." v1 tracks at the item
  level; sub-items are not first-class. (#4, #9)
- **Multiple folders** — v1 has one folder (All); organisation is done with
  Stops, not by filing into more folders.
- **Auto-organisation** ("auto mode"), **suggestions**, **teams**, **billing** —
  already out per the map and ADR-0001.

## Consequences

- **#9 (auto-fetch research)** leaves v1's critical path — a future enhancement,
  not a build blocker.
- **#4 (content item)** shrinks: every type (article, video, course, playlist,
  offline book) must be *representable* and trackable at item level, but
  chapters/lessons are not modelled in v1.
- **#6** and **#7** become fast-follows, informed by real dogfooding, not v1 work.
- Offline books are representable (add manually by title) but carry no chapter
  check-off in v1 — they are titled Items with a manual status.
