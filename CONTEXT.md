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

**Power Learner**:
A User who learns independently at high volume across many sources and formats,
repeatedly collecting, choosing, organising, and tracking learning material.
Defined by learning behaviour rather than profession or subject area.
_Avoid_: Software engineer, Student, Expert (none defines the audience by itself)

### Recurring discovery

**Provider**:
An external service Unshelf queries for learning material through provider-specific
targets and filters. Provider details stay behind the recurring-discovery boundary
rather than becoming shared Unshelf concepts.
_Avoid_: Source (the optional link stored on an Item), Follow

**Follow**:
A User-owned relationship to one shared Provider target. A Follow is active when
`deleted_at` is absent; removing it stops future Candidate intake and hides its
pending Candidates without deleting shared Provider data, Candidate decisions, or
Library Items. Following the same target again restores that relationship.
_Avoid_: Subscription (may mean a paid plan or a provider's own subscription),
Channel (one provider-specific kind of target), Source (already the link stored
on an Item)

**Candidate**:
A User-owned durable mapping to one shared Provider result before the User has
resolved it. For one User, one Provider identity denotes at most one Candidate,
whose state is exactly _pending_, _kept_, or _rejected_. An untouched Candidate
remains pending; repeated Provider fetches never reset its decision.
_Avoid_: Item, Inbox Item, Recommendation

**Provider identity**:
A Provider and that Provider's stable reference to one piece of learning material,
treated together as an exact, provider-namespaced identity. Matching titles or raw
Source strings are not Provider identity.
_Avoid_: Source, title, URL

**Keep**:
A User's decision to resolve one pending Candidate by linking it to an Item in the
Library. Keep creates that Item from the User-confirmed title and Type plus the
Candidate's canonical Source and Provider identity, or reuses the User's Item with
that exact Provider identity. It does not affect another User's Candidate or
silently apply later Provider metadata changes to the Item.
_Avoid_: Capture, Save, Import

**Reject**:
A User's terminal decision to resolve one pending Candidate without creating,
changing, or deleting an Item. Reject affects only that User's Candidate and
repeated Provider fetches preserve it.
_Avoid_: Delete, Hide, Ignore

### Items & organisation

**Item**:
A single piece of learning material captured into Unshelf — an article, video,
course, YouTube playlist, or (offline) book — added by hand: paste a link or type
a title. Referenced, not copied: one Item can be placed in many Learning Plans,
but at most once in any one Learning Plan, and every placement points at the
single stored record. "Only one of it" is about model identity —
one row per capture — not source-uniqueness: capturing the same link twice creates
two Items unless the capture establishes the same exact Provider identity, in
which case the User's existing Item is reused. Deleting permanently ends the
Item: it leaves the Library and every active relationship, cannot be restored,
and exists afterward only through any Daily Focus snapshots already preserved
as history.
_Avoid_: Bookmark, Link, Resource, Content, Deleted Item

**Type**:
The kind of material an Item is — one of _article_, _video_, _playlist_,
_course_, _book_, or _other_. Confirmed by the User at Capture, whether entered
manually or accepted from a Source inspection suggestion; a label on the Item,
not a separate kind of record.
_Avoid_: Kind, Category, Format

**Structured Item**:
An Item that currently owns a non-empty, flat, ordered list of Parts, not a
separate kind of Item. Structure is optional for every Type and is a User-owned
snapshot entered and edited manually.
_Avoid_: Structured Type, Container Item

**Part**:
A lightweight, checkable title owned in a flat order by exactly one Structured
Item. It is not an Item, has no Type, Source, Status, Target date, or Labels, does
not appear in the Library, and cannot be selected independently for a Learning
Plan or Daily Focus; renaming or reordering it preserves its identity and
Completion.
_Avoid_: Child Item, Sub-item, Library Item

**Status**:
An Item's item-level progress — _not started_, _in progress_, or _done_. There is
one shared Status per Item across every place it is referenced. A Structured Item
derives it from Part completion unless the User chooses a Status manually. A
manual choice does not rewrite Part checkboxes, and its Status remains visible
separately from the derived Part percentage. Creating its initial Part list or
removing its final Part preserves that choice; other Part-completion or membership
changes return Status to automatic derivation. Stage and Learning Plan progress
derive from this value rather than storing another Status.
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
The act of adding an Item to Unshelf — one uniform entry (required title,
confirmed Type, optional Source) landing in the **Library**. An eligible YouTube
Source may be inspected to suggest editable values, but the User still confirms
the current fields explicitly and the Item retains no separate inspection
metadata. Pasting a link and adding an offline book by title remain the same
Capture; Source is stored verbatim, and absent or unsuccessful inspection never
prevents manual completion. Capture creates or reuses the Item immediately; it
never waits in recurring discovery intake. If a matching Candidate is discovered
later, it remains pending and visible as already in the Library until the User
chooses Keep or Reject.
_Avoid_: Import, Ingest, Add, Save (Import means a bulk pull from an external
tool — a deferred sibling of Capture, not a synonym)

**Source inspection**:
A one-shot, best-effort attempt inside Capture to suggest an Item's title and Type
from an eligible YouTube video or playlist Source. It is advisory and ephemeral:
it neither creates an Item nor leaves a durable metadata record, and its partial
or absent result leaves the same Capture available for the User to complete.
_Avoid_: Import, recurring discovery, metadata sync

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
day preserves each selection as a Daily Focus snapshot.
_Avoid_: Task list, Learning Plan, Status

**Daily Focus snapshot**:
An elapsed Daily Focus's frozen record of one selected Item: its title, Type,
day-end Status, and Part percentage. If the Item is later deleted, the snapshot
remains as inert history without an Item link, origin, or reconsideration action.
_Avoid_: Historical Item, Archived Item, Deleted Item

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
