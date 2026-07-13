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
course, YouTube playlist, or (offline) book — usually added by pasting its link.
Captured once and referenced everywhere: the same Item may appear in many Stops,
but there is only ever one of it.
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

**Source**:
The optional link to where an Item lives, stored as the User captured it. Absent
for offline Items such as books, which are added by title alone — the title, not
the Source, is what identifies an Item.
_Avoid_: Link, URL, Bookmark

**All**:
The single catch-all folder every captured Item lands in — the raw dump. In v1
the only folder, as Raindrop has one default collection. Organising happens by
pulling Items into Stops, not by creating more folders.
_Avoid_: Inbox, Library, All-items, Dump

**Stop**:
A unit the User forms by pulling one or more Items together (e.g. "Learn CSS",
"Self-hosting", "Build the API"). The single organising concept — a Stop is also
what appears as a node on the Trail, and it may hold learning material or a
project.
_Avoid_: Group, Collection, Bucket, Milestone, Node (a Stop is _shown_ as a node)

**Trail**:
A visual arrangement of Stops in sequence (Stop 1 → Stop 2 → …) with forks where
threads run in parallel. It expresses "what to do first / next" as topology; in
v1 it carries no dates or calendar.
_Avoid_: Map, Roadmap, Timeline, Schedule, Graph
