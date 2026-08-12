# Mixed learning workflow patterns in existing products

Researched 2026-08-02 against current first-party product documentation and
public first-person workflow accounts.

**Status:** exploration, not a product or domain decision. The current-product
matrix records only capabilities evidenced in the official documentation
reviewed. An em dash means “not evidenced in those sources,” not a definitive
claim that the product has no such feature.

## Question

How do current learning, read-later, bookmarking, feed, book-tracking, and
personal-knowledge products represent and present continuous intake, long-form
structure, loose collections, ordered plans, daily focus, and completion? What
can Unshelf learn from their domain primitives, information architecture,
interactions, and trade-offs without choosing its final model prematurely?

## Executive synthesis

No reviewed current product handles all six capabilities with one organising
primitive. The recurring pattern is a **stack of distinct lifecycle layers**:

1. **Arrival** is cheap and permissive: an automatic Feed, an Unsorted inbox, a
   daily note, or assigned work.
   ([Reader](https://docs.readwise.io/reader/docs/faqs/adding-new-content),
   [Raindrop](https://help.raindrop.io/collections),
   [Capacities](https://docs.capacities.io/reference/use-cases/daily-notes),
   [Khan Academy](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined))
2. **Library membership** is a stronger commitment than mere arrival when intake
   is continuous. Readwise Reader makes this boundary explicit by moving chosen
   Feed documents into the Library.
   ([Reader Feed versus Library](https://docs.readwise.io/reader/docs/faqs/adding-new-content))
3. **Loose organisation** is many-to-many or query-backed: tags, overlapping
   collections, filters, and saved views.
   ([Reader Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views),
   [Capacities collections and queries](https://docs.capacities.io/reference/collections))
4. **Near-term focus** is a deliberately smaller projection: Reader's Shortlist,
   StoryGraph's five-book Up Next queue, Khan Academy's daily mission, or
   Capacities' Today view.
   ([Reader](https://docs.readwise.io/reader/guides/workflows/library-configuration),
   [StoryGraph](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions),
   [Khan Academy](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined),
   [Capacities](https://docs.capacities.io/reference/task-management))
5. **Order** is meaningful only where somebody authored a finite plan: a course
   hierarchy, a due-date-ranked learning queue, or a short manually ordered
   queue. Continuous arrival is not itself a plan.
   ([Khan Academy](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined),
   [StoryGraph](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions))
6. **Completion** has several meanings that products keep separate: seen/read,
   saved for later, reading position, finished, and mastered.
   ([Reader](https://docs.readwise.io/reader/guides/filtering/syntax-guide),
   [StoryGraph](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph),
   [Khan Academy](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery-))

The strongest implication for Unshelf is therefore not a particular competitor's
navigation. It is to preserve semantic boundaries between **Candidate, Item,
collection, plan, focus, and completion**. The current Unshelf spine already
separates an [Item and its Status](../../CONTEXT.md) from [Labels and
Trail placement](../adr/0014-next-gen-surface-model-and-navigation.md), while the
[current map](https://github.com/rajat2006/unshelf/issues/259) uses Candidate for
automatically found material that has not become a Library Item. Those current
shapes are evidence, not assumptions that Trail and Stop must survive this map.
The unresolved work is to decide which additional layer—if any—Power Learners
need for an active shortlist or today view, and how much long-form structure an
Item can earn without turning every Type into a separate organiser.

## Current-product capability matrix

All products in this matrix have live first-party documentation or product pages
as of the research date. Cells describe the product facts those official sources
support.

| Product | Intake | Long-form structure | Loose collection | Ordered plan | Daily focus | Completion |
|---|---|---|---|---|---|---|
| **Readwise Reader** (read-later + feed) | [Manual saves enter Library; automatic pushes enter Feed, then chosen documents can move to Library](https://docs.readwise.io/reader/docs/faqs/adding-new-content) | [One document has type, estimated length, and reading-progress fields](https://docs.readwise.io/reader/guides/filtering/syntax-guide) | [Tags and saved Filtered Views query one flat document database](https://docs.readwise.io/reader/docs/faqs/filtered-views) | [Configurable location workflows: Inbox → Later → Archive or Later → Shortlist → Archive](https://docs.readwise.io/reader/guides/workflows/library-configuration) | [Shortlist is a small active reading queue, not a dated plan](https://docs.readwise.io/reader/guides/workflows/library-configuration) | [Feed Seen](https://docs.readwise.io/reader/docs/faqs/adding-new-content) is separate from [Library reading progress and Archive](https://docs.readwise.io/reader/guides/workflows/library-configuration) |
| **Raindrop.io** (bookmarking) | [Browser/mobile saves; unspecified destinations fall into Unsorted](https://help.raindrop.io/collections) | [Bookmark records have detected content types; the reviewed docs do not describe a part hierarchy](https://help.raindrop.io/filters) | [Each bookmark has one collection, while tags and combined filters cross-cut collections](https://help.raindrop.io/collections) | — | [Reminders and Favorites are filterable attributes, but the reviewed docs show no dedicated today/next surface](https://help.raindrop.io/filters) | [The reviewed bookmark docs describe Favorites, reminders, notes, and highlights rather than a learning-completion state](https://help.raindrop.io/filters) |
| **Inoreader** (feed) | [Feeds bring continuous arrivals; monitoring searches can become feeds, and rules can tag, save, notify, or mark new articles read](https://www.inoreader.com/blog/2026/01/save-time-with-automations.html) | [Articles, PDFs, and uploaded documents share the reading/search surface; the reviewed docs do not describe a course-style part hierarchy](https://www.inoreader.com/blog/2025/06/use-inoreader-as-your-ultimate-read-later-app.html) | [Folders group feeds, one feed may be in several folders, and tags group individual articles](https://www.inoreader.com/blog/2024/11/organize-your-content-and-customize-your-account.html) | — | [Unread counts, Read later, dashboards, and “mark all read” focus attention, but are not a dated learning plan](https://www.inoreader.com/blog/2026/05/a-cleaner-top-bar-and-quicker-access-to-key-features.html) | [Read/unread is separate from saving an article to Read later](https://www.inoreader.com/blog/2025/06/use-inoreader-as-your-ultimate-read-later-app.html) |
| **StoryGraph** (book tracking) | [Books are found by title/author/ISBN, imported, or added manually to reading lists](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph) | [A book edition has page-based progress and dated reading entries; the reviewed docs do not expose chapters as tracked parts](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph) | [Personal tags, To-Read, Owned, and Reading Challenges overlap the same books](https://thestorygraph.com/) | [Up Next is a drag-ordered queue capped at five books](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions) | [Up Next is surfaced above the broader To-Read pile, but is not date-specific](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions) | [Currently Reading, Read, Did Not Finish, start/finish dates, page progress, and challenge completion are distinct](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph) |
| **Khan Academy** (learning) | [Learners choose courses; teacher-assigned units, videos, exercises, and activities enter a class learning queue](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined) | [Course → unit → lesson → article/video/exercise, with quizzes and course challenges](https://support.khanacademy.org/hc/en-us/articles/18564282990861-What-types-of-content-can-I-assign-to-my-students) | [Learner Home lists chosen courses and classes; no cross-course tag/collection primitive was evidenced in the reviewed docs](https://support.khanacademy.org/hc/en-us/articles/360030629852-What-is-my-Learner-Home-page-and-what-can-I-do-there) | [Assignments are due-date ordered in path/list views, but learners may choose another order](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined) | [Daily and weekly missions surface due and overdue assignments](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined) | [Assignment completion, skill levels, and unit/course mastery are separate measures](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery-) |
| **Notion** (personal knowledge / configurable workspace) | [Users create database pages directly; intake structure is user-configured](https://www.notion.com/help/intro-to-databases) | [Every database item is a page; optional sub-items and dependencies add hierarchy](https://www.notion.com/en-gb/help/tasks-and-dependencies) | [The same records can appear in filtered table, board, timeline, calendar, list, gallery, and chart views](https://www.notion.com/help/views-filters-and-sorts) | [Sub-items, dependencies, dates, and timeline views can express user-authored order](https://www.notion.com/en-gb/help/tasks-and-dependencies) | [My Tasks aggregates selected task databases when records have Status, Assignee, and Due date](https://www.notion.com/en-gb/help/guides/give-your-to-dos-a-home-with-task-databases) | [Status, checkbox, number/progress, and formula properties let the workspace author define completion](https://www.notion.com/help/database-properties) |
| **Capacities** (personal knowledge + tasks) | [Daily note is a low-friction inbox fed by direct entry, email, WhatsApp, Telegram, and other integrations; review promotes what matters into objects or tasks](https://docs.capacities.io/reference/use-cases/daily-notes) | [Every note is a typed object with type-specific properties/templates; the reviewed docs do not define a learning-part model](https://docs.capacities.io/reference/content-types) | [Overlapping collections curate one object type, tags cross types, and queries automate stable groupings](https://docs.capacities.io/reference/collections) | [Task status, scheduled date, deadline, context, and saved queries build user-authored work plans](https://docs.capacities.io/reference/task-management) | [Today combines scheduled, overdue, due-today, and in-progress tasks around the daily note](https://docs.capacities.io/reference/task-management) | [Done tasks, completion order, recurring occurrence history, and progress rings are task-specific completion signals](https://docs.capacities.io/reference/task-management) |

## Product models and interaction trade-offs

### 1. Readwise Reader: lifecycle locations over a flat document store

**Domain and IA.** Reader's load-bearing split is between **Feed** and
**Library**. Automatically pushed RSS/newsletter material sits in Feed as
Unseen/Seen; manually chosen material and Feed promotions sit in Library.
Library locations can implement Triage (Inbox/Later/Archive), Shortlist
(Later/Shortlist/Archive), or Classic (Later/Archive).
([Feed versus Library](https://docs.readwise.io/reader/docs/faqs/adding-new-content),
[Library configurations](https://docs.readwise.io/reader/guides/workflows/library-configuration))

**Organisation and focus.** The durable store is one flat document database.
Tags supply manual semantics; Filtered Views supply query-backed, optionally
pinned subsets; a view can split by Library location or Feed Seen state. The
Shortlist workflow then creates a small active queue without pretending the whole
Later backlog is ordered.
([Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views),
[filter syntax](https://docs.readwise.io/reader/guides/filtering/syntax-guide),
[Shortlist](https://docs.readwise.io/reader/guides/workflows/library-configuration))

**Trade-off.** This is semantically strong but vocabulary-heavy: Feed/Library,
Unseen/Seen, Inbox/Later/Shortlist/Archive, tags, favorites, and views are
different axes a newcomer must learn. The benefit is that “arrived,” “chosen,”
“important now,” “partly read,” and “kept permanently” do not collapse into one
status.

### 2. Raindrop.io: single-home filing plus cross-cutting retrieval

**Domain and IA.** A bookmark has exactly one Collection; choosing no collection
lands it in Unsorted. Collections act like sidebar folders and support nesting,
reordering, and per-collection layouts. Tags, detected content Type, attributes,
dates, and search operators then filter within a collection or across All
Bookmarks.
([Collections](https://help.raindrop.io/collections),
[Filters](https://help.raindrop.io/filters))

**Trade-off.** The single home makes browsing predictable and makes a named
collection directly presentable, while tags recover cross-cutting relevance. It
also creates two filing decisions and makes a bookmark that genuinely belongs to
several projects choose one primary home. Grid, headlines, list, and moodboard are
presentation settings, not distinct stored bookmark types.
([Collection layouts](https://help.raindrop.io/collections),
[Tags and filters](https://help.raindrop.io/filters))

Raindrop documents retrieval and curation well, but the reviewed official material
does not make bookmarks a learning queue, structured syllabus, or completion
ledger. That absence in the evidence is useful: a polished mixed-media library is
not automatically a learning workflow.

### 3. Inoreader: source organisation and article disposition are separate

**Domain and IA.** Folders organise feeds, while tags organise individual
articles; one feed can appear in multiple folders. Views can group articles by
feed or date and sort newest/oldest. Monitoring searches become recurring feeds,
while rules can automatically tag, save to Read later, notify, export, or mark
matching arrivals read.
([Folders, tags, and article views](https://www.inoreader.com/blog/2024/11/organize-your-content-and-customize-your-account.html),
[monitoring feeds](https://www.inoreader.com/blog/2026/01/discover-and-monitor-content.html),
[rules](https://www.inoreader.com/blog/2026/01/save-time-with-automations.html))

**Trade-off.** Feed membership answers “where did this come from?” and article
tags answer “what is this about?”, a clean domain split for continuous intake.
However, unread is an attention marker on an infinite stream, not a durable
learning commitment. Inoreader consequently provides a separate Read later action
and bulk Mark all as read control.
([Read later](https://www.inoreader.com/blog/2025/06/use-inoreader-as-your-ultimate-read-later-app.html),
[unread/all and Mark all read](https://www.inoreader.com/blog/2026/05/a-cleaner-top-bar-and-quicker-access-to-key-features.html))

### 4. StoryGraph: a broad pile, a bounded next queue, and rich finish history

**Domain and IA.** StoryGraph centres the Book/edition, with lifecycle lists for
Currently Reading, Read, To-Read, Owned, and Did Not Finish. It records dated page
progress and start/finish history; personal tags and reading challenges create
overlapping views over the same books.
([Getting Started](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph),
[product overview](https://thestorygraph.com/))

**Organisation and focus.** Up Next is a distinct, manually ordered queue of at
most five books placed above the broad To-Read pile. A challenge is different
again: books satisfy prompts, and a prompt completes when the book becomes Read
with a finish date inside the challenge window.
([Up Next](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions),
[challenge completion](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph))

**Trade-off.** Bounded focus protects the difference between “interesting someday”
and “actually next.” A hard five-item limit is simple and legible, but it cannot
represent every user's externally constrained queue (library holds, book clubs,
or several parallel subjects). StoryGraph also demonstrates that “did not finish”
and dated completion history can be meaningful completion-adjacent facts rather
than errors.

### 5. Khan Academy: provider-owned content structure and evidence-based mastery

**Domain and IA.** Khan Academy can model nested structure because it owns the
learning material: courses contain units and a course challenge; units contain
lessons and quizzes; lessons mix articles, videos, and exercises. Skills carry
Familiar/Proficient/Mastered levels, and unit/course mastery rolls those facts up.
([Content hierarchy](https://support.khanacademy.org/hc/en-us/articles/18564282990861-What-types-of-content-can-I-assign-to-my-students),
[Mastery](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery-))

**Plan and focus.** A class learning queue orders assigned work by due date and
offers path and list projections. The closest due item is highlighted but not
forced; daily and weekly missions narrow the same assignments by time horizon.
([Learning queue](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined))

**Trade-off.** Khan can distinguish attempted, completed, proficient, and mastered
because every activity has machine-readable assessment semantics. An organiser of
external books, videos, and websites usually cannot infer those facts. Its lesson
for Unshelf is about **optional structure where trustworthy structure exists**, not
about importing LMS semantics onto every Item.

### 6. Notion: maximum composability, minimum opinion

**Domain and IA.** Every database record is also a page. Properties such as
Status, Multi-select, Date, Relation, Rollup, Checkbox, and Formula let users
invent a model; views present the same records as tables, boards, timelines,
calendars, lists, galleries, or charts. Sub-items and dependencies can add
hierarchy and order.
([Database items](https://www.notion.com/help/intro-to-databases),
[properties](https://www.notion.com/help/database-properties),
[views](https://www.notion.com/help/views-filters-and-sorts),
[sub-items and dependencies](https://www.notion.com/en-gb/help/tasks-and-dependencies))

**Focus.** My Tasks can aggregate tasks from selected databases, but the user must
first mark those databases as task databases and provide Status, Assignee, and Due
date properties.
([My Tasks](https://www.notion.com/en-gb/help/guides/give-your-to-dos-a-home-with-task-databases))

**Trade-off.** Notion proves that one stable record can support many projections
and relationships. It also transfers domain design, schema maintenance, and view
curation to the user. For Unshelf, “the user could build it” is not the same as a
coherent product workflow for a Power Learner.

### 7. Capacities: temporal inbox, typed knowledge, and task projection

**Domain and IA.** A daily note is a low-friction chronological inbox. During
review, a line can remain ephemeral, become a typed object, become a task, gain a
tag, or be deleted. Object Types give recurring things such as Books or Projects
their own properties and templates.
([Daily-note workflow](https://docs.capacities.io/reference/use-cases/daily-notes),
[Object Types](https://docs.capacities.io/reference/content-types))

**Organisation.** Collections are overlapping manual groups within one Object
Type; tags cross Object Types; queries are automatic rule-backed groups. The
documentation explicitly recommends changing a repetitive manual collection into
a query.
([Collections](https://docs.capacities.io/reference/collections))

**Focus and completion.** Tasks are separate objects with status, priority,
scheduled date, deadline, and contextual links. The task dashboard provides Inbox,
Today, Scheduled, Context, Open, Completed, and saved-query sections. Today derives
from scheduled/due/overdue facts rather than requiring a second copy of each task.
([Task management](https://docs.capacities.io/reference/task-management))

**Trade-off.** Capacities cleanly separates raw capture, durable knowledge, and
action. The cost is conversion/review work and a larger vocabulary of types,
collections, tags, queries, and tasks. A learning product should copy the semantic
separation only where it removes ambiguity, not the whole PKM ontology.

## Public first-person workflow evidence

These accounts are anecdotes: they show real workflow pressures and workarounds,
not prevalence. Product-company replies inside a thread are not treated as user
evidence.

### Infinite intake needs a non-obligatory state

- A Reader user described a saved-content backlog growing as large as in their
  previous tool. Other participants described two workable interpretations: a
  periodically triaged Inbox, or a broad Later “anti-library” from which only
  current-project material is promoted to Shortlist. This is evidence that the
  same UI can feel either like an obligation queue or a harmless reservoir,
  depending on the semantics users assign it.
  ([Reader backlog discussion](https://www.reddit.com/r/readwise/comments/1dh5w18/tips_for_managing_reader_backlog/))
- An Inoreader user intentionally left interesting articles unread so they could
  return during the week; an accidental mass-read event erased that improvised
  queue. Another RSS discussion described read/unread as a breadcrumb rather than
  an obligation to consume everything. These are concrete examples of why a feed
  disposition should not double as “I committed to learn this.”
  ([Inoreader unread-as-later account](https://www.reddit.com/r/InoReader/comments/1uy2yye/inoreader_marked_all_as_read/),
  [RSS read-state interpretations](https://www.reddit.com/r/rss/comments/1931jd0/is_the_readunread_feature_of_rss_readers_necessary/))

### Folder, label, collection, and view solve different jobs

- A long-time Raindrop user reported that single-home Collections fail when one
  link supports several projects, while tags cannot replace a Collection when the
  desired output is a shared curated pack. Another user preferred tags because
  several contexts can attach to one bookmark and combine during retrieval. The
  anecdotes expose a real semantic difference between **home/presentation** and
  **cross-cutting relevance**, not merely a preference for two widgets.
  ([single-home/share tension](https://www.reddit.com/r/raindropio/comments/1qxfal9/thoughts_on_organisation_the_old_tags_vs/),
  [tag-based retrieval account](https://www.reddit.com/r/raindropio/comments/1l5s6jh/full_text_search_vs_tags/))
- A Notion user described spending more time building the system than using it;
  a six-year user separately described the cycle from attractive flexibility to
  setup overwhelm. These accounts caution against making Power Learners construct
  the product's domain model before they can organise learning.
  ([overbuilt setup discussion](https://www.reddit.com/r/Notion/comments/1oxuz1m/do_you_ever_feel_like_your_notion_setup_is_too/),
  [six-year complexity account](https://www.reddit.com/r/Notion/comments/1jcw3y1/are_we_making_notion_too_complicated_after_6/))

### A small active set helps, but its boundary must match the job

- StoryGraph users explained that the five-book limit applies only to Up Next,
  not the whole To-Read pile. One wanted a larger queue; another felt the cap
  prevented Up Next from becoming as large as the backlog. In a separate thread,
  users worked around the fixed boundary with month tags or used the five slots
  only for time-sensitive library books.
  ([five-item limit discussion](https://www.reddit.com/r/TheStoryGraph/comments/197kyqt/tbr_pile_limits/),
  [ordered-TBR workarounds](https://www.reddit.com/r/TheStoryGraph/comments/wosszr/ordering_tbr/))
- A Khan Academy adult learner described moving through grade-level material until
  reaching genuinely new territory, then keeping a profile course list of relevant
  topics. This is a self-authored route through provider structure rather than
  blind adherence to one global order.
  ([adult learner account](https://www.reddit.com/r/khanacademy/comments/p4sru1/as_an_adult_learner_what_is_the_best_way_to_study/))

### Daily context is useful when it is a projection or inbox, not another store

- Capacities users described Daily Notes as temporary matter, a work journal, or
  an inbox whose durable material later moves into separate objects. One user's
  daily template mixed scratch capture with embedded queries for current-focus
  projects and upcoming deadlines.
  ([Daily Note workflows](https://www.reddit.com/r/capacitiesapp/comments/1m0b6ii/daily_note_workflow/))
- Capacities task users disagreed about whether no notifications made dated tasks
  too weak. One participant valued the opposite: due dates and priorities placed
  the right work in the daily list without a second task app. This is evidence that
  **consulted focus** and **outbound reminders** are separable jobs.
  ([Capacities task discussion](https://www.reddit.com/r/capacitiesapp/comments/1u95g59/how_is_task_management_in_capacities/))

## Discontinued and transformed comparators

These products are **not** evidence of the current hosted-product landscape and
are excluded from the capability matrix.

- **Pocket hosted service — discontinued.** Mozilla shut Pocket down on 2025-07-08;
  its apps and extensions are unavailable, the API and export window closed on
  2025-11-12, and account data entered permanent deletion. A support-forum user
  who learned of the closure late described spending hours trying to recover saved
  sites before finding the export control. The product lesson is operational:
  years of lightweight capture still create a valuable personal archive, so
  export and understandable exit paths are part of the workflow contract.
  ([Mozilla closure facts](https://support.mozilla.org/en-US/kb/future-of-pocket),
  [first-person export difficulty](https://support.mozilla.org/en-US/questions/1532541))
- **Omnivore Cloud — discontinued; self-hosted code continues.** The Omnivore team
  joined ElevenLabs in October 2024; the project's own repository says the Cloud
  application was deprecated in November 2024 and the app is now self-hosted.
  A user whose blogging workflow depended on Omnivore's configurable Obsidian
  export reported that no alternative was a drop-in replacement on the short
  migration timeline. The lesson is not merely “offer CSV”: preserve the semantics
  users built around labels, highlights, notes, and downstream links.
  ([ElevenLabs announcement](https://elevenlabs.io/blog/omnivore-joins-elevenlabs),
  [current Omnivore repository status](https://github.com/omnivore-app/omnivore),
  [first-person workflow disruption](https://5typos.net/2024/10/29/omnivore-is-shutting-down-and-team-joining-elevenlabs))

## Cross-product findings

### Finding 1: arrival, commitment, and organisation are separate facts

Reader's Feed → Library promotion, Raindrop's Unsorted → Collection move, and
Capacities' Daily Note → Object/Task conversion all delay a stronger semantic
commitment until after low-friction capture.
([Reader](https://docs.readwise.io/reader/docs/faqs/adding-new-content),
[Raindrop](https://help.raindrop.io/collections),
[Capacities](https://docs.capacities.io/reference/use-cases/daily-notes))

**Implication for Unshelf:** the current rule that manual Capture creates an Item
immediately while recurring discovery first creates a Candidate is consistent with
several product precedents. It should remain a provenance/lifecycle distinction,
not become a second general-purpose Library.
([current Capture](../../CONTEXT.md),
[Candidate map note](https://github.com/rajat2006/unshelf/issues/259))

### Finding 2: manual membership, labels, and saved queries are not substitutes

Raindrop's Collection is a single home, StoryGraph's tags overlap, Capacities'
Collections overlap only within a Type, and Reader's Filtered Views are rules over
one flat database. Each answers a different question: “where is its home?”, “what
is it relevant to?”, “what set did I curate?”, or “what currently matches?”
([Raindrop](https://help.raindrop.io/collections),
[StoryGraph](https://thestorygraph.com/),
[Capacities](https://docs.capacities.io/reference/collections),
[Reader](https://docs.readwise.io/reader/docs/faqs/filtered-views))

**Implication for Unshelf:** the current model assigns cross-cutting relevance to
Labels and authored sequence to Trails, but this map may replace either shape. Any
final model should admit a new collection or saved view only if its membership has
independent meaning that the chosen categorisation and ordering concepts cannot
express—especially curated presentation or a reusable automatic query.
([Label/Trail boundary](../adr/0014-next-gen-surface-model-and-navigation.md))

### Finding 3: focus is a narrow projection over a broader store

Reader promotes from Later to Shortlist, StoryGraph promotes from To-Read to a
five-book Up Next queue, Khan filters assigned work into daily/weekly missions,
and Capacities derives Today from task dates and status.
([Reader](https://docs.readwise.io/reader/guides/workflows/library-configuration),
[StoryGraph](https://roadmap.thestorygraph.com/changelog/up-next-and-suggestions),
[Khan Academy](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined),
[Capacities](https://docs.capacities.io/reference/task-management))

**Implication for Unshelf:** choosing what to learn today probably should not move
or duplicate an Item. The decision still open is whether focus is (a) an explicit
small shortlist, (b) a date-derived view, (c) a recommendation/projection from a
deliberate plan (currently represented by a Trail), or (d) a combination with a
clear precedence rule. Unshelf's Target date is currently “finish by,” not “work on
today,” so deriving focus from it alone would change its meaning.
([Target date](../../CONTEXT.md),
[date decision](../adr/0005-soft-target-and-completion-dates-on-the-item.md))

### Finding 4: a stream is not a backlog, and a backlog is not a plan

Feed products use Seen/Unread and bulk clearing because continuous intake cannot
honestly promise completion. Reader adds a Library boundary; Inoreader adds Read
later. Finite plans instead use authored order or due dates.
([Reader Feed](https://docs.readwise.io/reader/docs/faqs/adding-new-content),
[Inoreader Read later](https://www.inoreader.com/blog/2025/06/use-inoreader-as-your-ultimate-read-later-app.html),
[Khan learning queue](https://support.khanacademy.org/hc/en-us/articles/38555649696397-How-is-a-student-s-learning-queue-organized-on-Khan-Academy-reimagined))

**Implication for Unshelf:** neither a recurring source nor its Candidate stream
should automatically become the product's deliberate ordered plan, whatever
primitive ultimately carries that job. The user must Keep a Candidate before it
can enter such a plan.
([Candidate and deliberate-plan boundary](https://github.com/rajat2006/unshelf/issues/259))

### Finding 5: progress, completion, and mastery should not collapse

Reader separates Seen from reading percentage and Archive; StoryGraph separates
page progress, Read, Did Not Finish, and dated history; Khan separates attempted,
completed, proficient, and mastered.
([Reader](https://docs.readwise.io/reader/guides/filtering/syntax-guide),
[StoryGraph](https://thestorygraph.freshdesk.com/support/solutions/articles/79000142013-getting-started-with-storygraph),
[Khan Academy](https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery-))

**Implication for Unshelf:** current Item Status can remain the cross-Type learning
commitment while later Type details carry finer progress where it is trustworthy.
Before changing the shared enum, prototypes should test whether Power Learners
need cross-Type **paused** or **did not finish**, and whether “done” means consumed,
understood, or intentionally closed. Khan-style mastery should not be inferred for
external material without evidence.
([Item spine and deferred Type details](../adr/0003-one-item-spine-with-per-type-details.md),
[current Status](../../CONTEXT.md))

### Finding 6: workflow-first navigation is more stable than Type-first navigation

Reader's top-level split is Feed/Library, Khan's is Learner Home/Classes/Course,
and Capacities separates Calendar/Daily Note, Object dashboards, and Tasks. Within
those surfaces, articles, videos, books, exercises, and other types become filters
or structured details rather than separate end-to-end organisers.
([Reader](https://docs.readwise.io/reader/docs/faqs/adding-new-content),
[Khan Learner Home](https://support.khanacademy.org/hc/en-us/articles/360030629852-What-is-my-Learner-Home-page-and-what-can-I-do-there),
[Capacities](https://docs.capacities.io/reference/use-cases/daily-notes))

**Implication for Unshelf:** preserve the map's standing preference to organise
around intake, Library organisation, deliberate planning, focus, and completion.
Type-specific surfaces should require a distinct behaviour—not merely different
metadata or thumbnail treatment.

### Operational caveat beyond this map: portability must preserve workflow semantics

Pocket's closure removed a long-lived hosted archive, while Omnivore Cloud's
deprecation disrupted workflows built around labels, highlights, and downstream
exports.
([Pocket](https://support.mozilla.org/en-US/kb/future-of-pocket),
[Omnivore repository](https://github.com/omnivore-app/omnivore),
[first-person workflow account](https://5typos.net/2024/10/29/omnivore-is-shutting-down-and-team-joining-elevenlabs))

**Future/out-of-scope implication for Unshelf:** this map does not decide import,
export, migration, or rollout. When a later effort does, it should preserve stable
Item identity, Source, Status, completion history, categorisation, ordered-plan
relationships, and any Candidate provenance
separately. A flat list of URLs would be data export without workflow portability.

## In-scope decisions this research informs but does not make

1. Is “today” a user-curated shortlist, a projection from dates/deliberate-plan
   topology, or both?
2. If there is a shortlist, is it globally bounded, bounded per plan, or merely
   visually encouraged to stay small?
3. Does an Item need cross-Type paused/DNF states, or should those remain optional
   Type details?
4. Which long-form Types earn first-class parts, and who owns their order: the
   provider, the User, or both?
5. Does a manual collection express curated membership or presentation that the
   eventual categorisation and ordered-plan concepts cannot, or would it
   reintroduce double filing?
6. Are saved query views a real repeated workflow for Power Learners, or can
   temporary URL-owned filters cover the next scope?

## Source quality and limitations

- **Product facts** use first-party help centres, documentation, changelogs,
  product pages, or source repositories. They describe intended/current behaviour
  but are vendor-authored and do not establish adoption, usability, or outcomes.
- **Currentness** was checked on 2026-08-02. Pocket hosted service and Omnivore
  Cloud are explicitly separated from the current matrix; Omnivore's self-hosted
  code continues.
- **Non-features** are deliberately narrow: “not evidenced in the reviewed docs”
  does not prove absence. Plan-tier, platform, beta, and regional differences were
  not exhaustively tested with paid accounts.
- **User evidence** is a purposive sample of public first-person Reddit/forum/blog
  accounts. It is self-selected, not demographically verified, sometimes describes
  older UI, and cannot support prevalence claims. It is used only to expose
  workflow pressures and workarounds.
- **Category fit is uneven.** Khan Academy owns its course content and can measure
  mastery; StoryGraph is book-specific; Notion and Capacities are general-purpose;
  Reader, Raindrop, and Inoreader centre web material. Their mechanisms are
  analogies, not drop-in models for a mixed-material learning organiser.
- **No direct interviews or behavioural telemetry** were available. Rajat remains
  the map's live fit-check, and later prototypes should test the open choices above
  with realistic mixed libraries rather than treating competitor precedent as
  validation.
