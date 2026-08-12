# Unshelf

A personal learning organizer: scattered articles, courses, and offline books
become one place — captured into a Library, arranged into Learning Plans,
brought into Daily Focus, and tracked to completion. A multi-user product where
each User's learning space is entirely their own.

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
a title. Referenced, not copied: one Item can be placed in many Learning Plans,
but at most once in any one Learning Plan, and every placement points at the
single stored record. "Only one of it" is about model identity —
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
one Status per Item, shared across every place the Item is referenced. Stage and
Learning Plan progress derive from this value rather than storing another Status.
_Avoid_: Progress, State

**Target date**:
The User's optional, soft "by when" for an Item — one nullable date per Item,
shared across every place it appears in (like Status). It is passive: Unshelf never
reaches out about it. When the date is past and the Item is not yet done, the Item
shows a derived _past target_ state; once done, that state clears but the date
stays as history. There is no Timeline or Schedule record — this field plus the
Learning Plan's ordering are the whole of "when".
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
chosen Type, optional Source) landing in the **Library**. v1 has a single capture: no
metadata is fetched (you type the title), and there is no bulk **import** from
other tools. Pasting a link and adding an offline book by title are the same
capture — the link just fills Source, which is stored verbatim and unvalidated.
_Avoid_: Import, Ingest, Add, Save (Import means a bulk pull from an external
tool — a deferred sibling of Capture, not a synonym)

**Library**:
The durable, flat home of every Item. Membership is inherent in Item existence
rather than a separate filing relationship; Capture lands there without implying
categorisation, commitment, or daily priority.
_Avoid_: All, Folder, Inbox, All-items, Dump

**Stage**:
An optional, named grouping inside one Learning Plan for Items that share a
meaningful phase, sub-outcome, prerequisite boundary, or checkpoint. Items may
also be placed directly in the Learning Plan; a Stage is never a mandatory
sequencing wrapper. Its Items have a local order, and its progress is derived
from their shared Statuses rather than stored as a separate state.
_Avoid_: Stop, Folder, Bucket, mandatory wrapper

**Learning Plan**:
A durable, User-authored arrangement of shared Library Items toward a learning
outcome. It expresses commitment and plan-specific role or position without
duplicating an Item or its shared Status; it owns Item placements directly, may
group some into optional Stages, and may be active or archived. Its arrangement
forms a directed acyclic graph—an ordinary sequence is one path and forks express
parallel study—and its progress is derived from its current unique Items.
_Avoid_: Trail, Map, Roadmap, Timeline, Schedule, Graph

**Daily Focus**:
A dated selection of whole Items chosen for current attention from the Library or
one or more Learning Plans. Selecting an Item changes neither its Library nor plan
placement; when selected from a Learning Plan, the selection may retain that
specific placement as origin context. The current day is editable, while a past
day preserves its membership and each Item's day-end Status as history.
_Avoid_: Task list, Learning Plan, Status

**Label**:
A free-text marker a User optionally applies to Items as durable, many-to-many
categorisation across the **Library**. A Label carries no order, commitment,
Status, progress, or Daily Focus priority; each User owns and customises their own.
_Avoid_: Tag (the former name — now Label), Category, Bucket, Folder, Topic

### Reminders (deferred from v1)

**Reminder**:
Anything Unshelf sends _out_ to prompt the User — the whole "reaches out" family:
a due-nudge on a Target date, a backlog/staleness nudge ("untouched for 3 weeks"),
or a Revision prompt. Deferred entirely from v1 (#7): v1 is passive — the User
consults Unshelf, never the reverse. A backlog _pile_ needs no term of its own — it
is simply the _not started_ Items in the **Library**.
_Avoid_: Notification, Nudge, Alert, Backlog (a backlog nudge is one kind of Reminder)

**Revision**:
Returning to a _done_ Item later to reinforce it — the spaced-repetition flavour of
Reminder. Deferred (#7); v1 banks only the Completion date (ADR-0005) so a future
Revision feature has the finish-history it cannot backfill. Staleness, by contrast,
is a rolling signal a future Reminder observes live — v1 stores nothing for it.
_Avoid_: Review, Repetition, Recall, Spaced repetition
