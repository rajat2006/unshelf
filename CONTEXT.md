# Unshelf

A personal learning organizer: scattered articles, courses, and offline books
become one place — captured, arranged into a visual Trail of Stops, and tracked
to completion. A multi-user product where each User's learning space is
entirely their own.

## Language

**User**:
An individual account holder — the tenant that owns a private learning space.
In v1 one User is one isolated tenant; there are no teams, and nothing is shared
between Users.
_Avoid_: Account, Customer, Tenant (all denote the same thing as User in v1)

### Items & organisation

**Item**:
A single piece of learning material captured into Unshelf — an article, video,
course, YouTube playlist, or (offline) book — added by hand: paste a link or type
a title. Referenced, not copied: one Item can appear in many Stops across
different Trails, but in at most one Stop on any one Trail; every placement
points at the single stored record. "Only one of it" is about model identity —
one row per capture — not source-uniqueness: capture the same link twice and you
have two Items (v1 does not dedupe).
_Avoid_: Bookmark, Link, Resource, Content

**Type**:
The kind of material an Item is — one of _article_, _video_, _playlist_,
_course_, _book_, or _other_. Chosen by the User at capture; a label on the Item,
not a separate kind of record.
_Avoid_: Kind, Category, Format

**Status**:
An Item's item-level progress — _not started_, _in progress_, or _done_. There is
one Status per Item, shared across every Stop the Item appears in; v1 tracks
progress here and nowhere finer (no chapter or lesson check-off).
_Avoid_: Progress, State

**Target date**:
The User's optional, soft "by when" for an Item — one nullable date per Item,
shared across every Stop it appears in (like Status). It is passive: Unshelf never
reaches out about it. When the date is past and the Item is not yet done, the Item
shows a derived _past target_ state; once done, that state clears but the date
stays as history. There is no Timeline or Schedule record — this field plus the
Trail's ordering are the whole of "when".
_Avoid_: Deadline, Due date, Schedule, Timeline, Overdue, Late (a target is soft
and never nags; anything that _reaches out_ is a Reminder, deferred with #7)

**Completion date**:
When an Item entered _done_ — set on that transition, cleared if the Item is moved
back out of done, so it always reflects the most recent completion. Nothing in v1
reads it; it is captured because completion history cannot be backfilled and it
seeds future revision.
_Avoid_: Finished on, Done date

**Source**:
The optional link to where an Item lives, stored as the User captured it. Absent
for offline Items such as books, which are added by title alone — the title, not
the Source, is what identifies an Item.
_Avoid_: Link, URL, Bookmark

**Capture**:
The act of adding an Item to Unshelf — one uniform manual entry (required title,
chosen Type, optional Source) landing in **All**. v1 has a single capture: no
metadata is fetched (you type the title), and there is no bulk **import** from
other tools. Pasting a link and adding an offline book by title are the same
capture — the link just fills Source, which is stored verbatim and unvalidated.
_Avoid_: Import, Ingest, Add, Save (Import means a bulk pull from an external
tool — a deferred sibling of Capture, not a synonym)

**All**:
The single catch-all folder every captured Item lands in — the raw dump. In v1
the only folder, as Raindrop has one default collection. Organising happens by
pulling Items into Stops, not by creating more folders.
_Redesign note (ADR-0014, map #53):_ the web-UI redesign names this surface
**Library** in the UI — the model concept (the catch-all every capture lands in) is
unchanged; only the user-facing name differs. The target model also adds a
many-to-many **label** axis over it (built downstream, #74).
_Avoid_: Inbox, All-items, Dump (and — pre-redesign — Library, now the UI name)

**Stop**:
A flat grouping the User forms by pulling one or more Items together — the single
organising concept in v1 (no tags, sub-Stops, or extra folders). Its Items are an
unordered set; ordering between Stops is expressed on the Trail, not within a Stop.
One uniform kind of Stop serves every purpose: whether it stands for a topic to
learn ("Learn CSS") or a project to build ("Build the API") is how the User uses
it, not a type the model distinguishes. A Stop is also what appears as a node on
the Trail.
_Avoid_: Group, Collection, Bucket, Milestone, Tag, Topic, Node (a Stop is _shown_ as a node)

**Trail**:
A visual arrangement of Stops in sequence (Stop 1 → Stop 2 → …) with forks where
threads run in parallel. It expresses "what to do first / next" as topology; in
v1 it carries no dates or calendar.
_Avoid_: Map, Roadmap, Timeline, Schedule, Graph

**Label**:
A free-text marker a User creates and applies to an Item to categorise it — the
cross-cutting axis over the store (the **Library**). Many-to-many: an Item can carry
several Labels and a Label spans many Items. Each User creates and customises their
own Labels, private to that User like everything else. Distinct from a **Stop**: a Label categorises Items across
the whole store, whereas a Stop sequences Items within one Trail — the two are
independent axes. Readmits the "tag" idea ADR-0004 set aside: once the Stop is a
per-Trail waypoint (ADR-0014) the store needs this cross-cutting grouping. A
next-gen concept — the model realisation (schema, enforcement) is built downstream
(#74).
_Avoid_: Tag (the former name — now Label), Category, Bucket, Folder, Topic

### Reminders (deferred from v1)

**Reminder**:
Anything Unshelf sends _out_ to prompt the User — the whole "reaches out" family:
a due-nudge on a Target date, a backlog/staleness nudge ("untouched for 3 weeks"),
or a Revision prompt. Deferred entirely from v1 (#7): v1 is passive — the User
consults Unshelf, never the reverse. A backlog _pile_ needs no term of its own — it
is simply the _not started_ Items in **All**.
_Avoid_: Notification, Nudge, Alert, Backlog (a backlog nudge is one kind of Reminder)

**Revision**:
Returning to a _done_ Item later to reinforce it — the spaced-repetition flavour of
Reminder. Deferred (#7); v1 banks only the Completion date (ADR-0005) so a future
Revision feature has the finish-history it cannot backfill. Staleness, by contrast,
is a rolling signal a future Reminder observes live — v1 stores nothing for it.
_Avoid_: Review, Repetition, Recall, Spaced repetition
