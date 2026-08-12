# How Power Learners Manage Mixed Learning Material

Research memo for [issue #265](https://github.com/rajat2006/unshelf/issues/265), within the wayfinder map in [issue #259](https://github.com/rajat2006/unshelf/issues/259).

Researched: 2026-08-02

## Executive finding

Power Learners do not reliably turn every saved resource into a task. Across personal-information-management studies, online-learning research, and public accounts, the most durable pattern is a separation between:

1. a broad **option pool** of potentially useful material;
2. a smaller **commitment queue** chosen for a present interest or goal; and
3. a very small **working set** that is active today or easy to resume.

Systems become stressful when they collapse those layers. A bookmark, an RSS arrival, a deliberately chosen book, and the lesson somebody intends to continue tonight do not carry the same commitment. Treating them all as one undifferentiated backlog produces unread debt, novelty bias, repeated reorganisation, and abandonment of the organiser itself. This conclusion converges across studies of keeping and refinding web information, longitudinal browser use, MOOC self-regulation, and independent public accounts of read-later queues, RSS feeds, books, and self-directed curricula.[^bruce][^abrams][^obendorf][^veletsianos][^kizilcec][^reader-backlog][^rss-hn][^self-study]

The evidence supports a calm workflow that is permissive at capture, explicit at commitment, lightweight in organisation, and rich enough to resume long material. It does **not** support one universal taxonomy, a requirement to organise at capture, a single-current-item constraint, or completion counts as the primary measure of learning.

For Unshelf, the strongest implication is that the Library should remain a flat store of options rather than silently become a to-do list. Recurring sources need a pre-Library Candidate or feed state. A separate focus/commitment concept is probably needed between Library membership and Item Status. Intentional learning goals should group mixed Types around the learner's question or outcome, with modest ordering and priority before any more elaborate graph model. The current domain decisions are therefore partly supported and partly reopened; see [Product implications](#product-implications-for-the-wayfinder-map).

## Research question and scope

This memo asks how people who handle high volumes of learning material collect, triage, organise, prioritise, resume, and track it across:

- deliberately chosen material and continuous incoming sources;
- books and other long-form material;
- one-off articles and videos;
- multi-item learning goals; and
- daily selection.

“Power Learner” is used here as a behavioural audience: someone who learns across sources and formats, keeps more possibilities than they can consume immediately, and sometimes constructs their own learning path. It is not a demographic label found in the cited literature.

The map excludes in-app reading or watching, notes and highlights, quiz creation, spaced repetition, and social learning. Those behaviours appear in the evidence, but this memo uses them only when they reveal requirements for intake, organisation, resumption, or tracking.

## Method and limitations

This is a purposive synthesis, not a prevalence study.

Three evidence layers were used:

1. **Published empirical research.** Primary papers were selected on personal information management, keeping and refinding web material, interrupted-task resumption, and self-regulated online learning. These supply the most defensible mechanisms and observed behaviours. Their samples are usually knowledge workers, students, MOOC participants, or general web users rather than a representative Power Learner population.
2. **Public qualitative accounts.** Original Hacker News and Reddit discussions were sampled for concrete descriptions of actual workflows and failures across read-later tools, RSS, books, mixed saved content, and personal curricula. These accounts are self-selected, identities and context are incomplete, votes are not prevalence, and several communities skew technical. They are useful for workflow detail and triangulation, not population estimates.
3. **Official product or practitioner material.** Mozilla research and SuperMemo documentation provide design precedent and vocabulary. They do not establish that a behaviour is common.

Patterns are labelled as follows:

- **Recurring:** appears across at least two relevant empirical cohorts and multiple independent public-account clusters, or converges broadly across otherwise independent clusters.
- **Meaningful minority:** repeated by several people in one or more established threads or observed in a narrower empirical cohort, but without broad enough convergence to call recurring.
- **Isolated/design probe:** one or a few accounts, or evidence from a neighbouring domain that suggests a question but cannot establish a Power Learner pattern.

The web evidence spans 1998–2026. Interfaces have changed, so claims about particular tools are treated as time-bound. The recurring tensions—capture cost, refinding, maintenance, interruption, attention, and commitment—are more durable. No interviews with Unshelf's own users were conducted. The classifications below are analytical judgements, deliberately conservative.

## Evidence corpus

### Published empirical studies

| Source | Method and sample | What it contributes | Main limitation here |
| --- | --- | --- | --- |
| Bruce, Jones & Dumais, [“Information behaviour that keeps found things found”](https://informationr.net/ir/10-1/paper207.html) (2004) | Keeping observation with 24 workplace participants; delayed-refinding observation with 12; survey of 214 | People keep information through many channels—email, print, files, bookmarks, notes—or deliberately leave it and rely on re-finding. Methods serve different functions such as reminder, context, access, sharing, and low maintenance. | Workplace web information, not learning-only behaviour. |
| Abrams, Baecker & Chignell, [“Information Archiving with Bookmarks”](https://www.dgp.toronto.edu/public_user/RMB/papers/p23.pdf) (1998) | Survey of 322 web users plus analysis of 50 bookmark archives | Collections grow in bursts; organisation tends to appear after visible accumulation; filing improves structure but costs attention; many bookmarks go unused. | Early-browser environment and convenience sample. |
| Boardman & Sasse, [“Stuff goes into the computer and doesn't come out”](https://discovery.ucl.ac.uk/id/eprint/13438/) (2004) | Cross-tool study of files, email, and bookmarks, including a longitudinal subset | Personal organisation is fragmented across tools; strategies vary within and across people and evolve over time. Tool boundaries discourage reflection on the whole system. | General personal information rather than learning material. |
| Bergman et al., [“The project fragmentation problem in personal information management”](https://doi.org/10.1145/1124772.1124812) (2006) | Study of 20 participants' project-related information across formats | People often think in projects while interfaces separate material by format. Extra structures and duplicate locations add cognitive load. | Small knowledge-worker sample; “project” is only an analogue for a learning goal. |
| Obendorf et al., [“Web page revisitation revisited”](https://vsis-www.informatik.uni-hamburg.de/getDoc.php/publications/280/chi2007-newformat.pdf) (2007) | Long-term clickstream data and interviews with 25 experienced users | Revisitation habits vary sharply. Most revisits are soon, but rare long-term returns matter. Links, re-search, retracing, tabs, bookmarks, and history play different roles; bookmarks/history are not the dominant route back. | Experienced web users; page revisitation is broader than learning. |
| Aula, Jhaveri & Käki, [“Information search and re-access strategies of experienced web users”](https://doi.org/10.1145/1124772.1124781) (2005) and Aljukhadar et al., [“Out of sight and out of mind”](https://doi.org/10.1177/0961000620949652) (2021) | Observed re-access tasks; the latter had 50 participants retrieve 21 personal URLs each | Search and recognition often beat carefully navigating a saved hierarchy. In the later study, bookmarks were used for only 16% of bookmarked targets, and hierarchical bookmark menus for 4%. | Elicited retrieval tasks may not match spontaneous long-term learning. |
| Zhang & Cranshaw, [“When the Tab Comes Due”](https://doi.org/10.1145/3411764.3445585) (2021) | Repeated tab walkthroughs with 10 information workers over two weeks plus survey of 103 | Open tabs act as reminders, resumable state, comparison sets, references, and aspirations, but also create stress, navigation difficulty, and loss of focus. | Information-work tasks, not exclusively learning. |
| Veletsianos, Reich & Pasquini, [“The Life Between Big Data Log Events”](https://doi.org/10.1177/2332858416657002) (2016) | 92 interviews across four HarvardX courses | A course is one node in a wider learning ecology: books, printouts, local folders, search, other devices, people, and communities. Learners skip, pause, supplement, and abandon based on value and life constraints. Platform logs miss this work. | Mid-course volunteers from one platform; retrospective accounts. |
| Littlejohn et al., [“Learning in MOOCs”](https://www.sciencedirect.com/science/article/pii/S1096751615300099) (2016) | Survey of 788 learners and 32 follow-up interviews | Motivation and personal goals change how learners use the same course; higher self-regulation is associated with adapting resources and strategies rather than simply following the provided sequence. | MOOC context; survey/interview associations are not causal. |
| Milligan & Littlejohn, [health professionals' self-regulated learning in a clinical MOOC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5125435/) (2016) | 35 interviews during a 12-week MOOC | Most learners set goals. More adaptive learners searched beyond the course, varied effort by relevance, and did not treat every activity or course completion as mandatory. | Small, professionally specialised sample. |
| Kizilcec, Pérez-Sanagustín & Maldonado, [“Self-regulated learning strategies predict learner behavior and goal attainment in Massive Open Online Courses”](https://www.rene.kizilcec.com/wp-content/uploads/2016/11/kizilcec2017srl.pdf) (2017) | Survey and platform logs for 4,831 learners across six MOOCs | Goal setting and strategic planning predict personal-goal attainment; stronger self-regulation is associated with revisiting completed materials. Time management remains difficult. | Correlational and limited to platform-visible actions. |
| Eriksson, Adawi & Stöhr, [“Time is the bottleneck”](https://link.springer.com/article/10.1007/s12528-016-9127-8) (2017) | 34 semi-structured interviews across two MOOCs | Work, family, course design, content value, and social context compete for finite time; 21 of 34 participants named lack of time. Completion intentions are heterogeneous. | Small self-selected interview sample. |
| Parnin & DeLine, [“Evaluating Cues for Resuming Interrupted Programming Tasks”](https://www.microsoft.com/en-us/research/publication/evaluating-cues-for-resuming-interrupted-programming-tasks/) (2010) | Survey of 371 programmers plus a controlled resumption study | People make cross-media notes to preserve task state. In the experiment, automatically captured chronological cues improved successful resumption over ordinary notes. | Programming, not learning; used only as a resumption design probe. |
| Agichtein et al., [“Search, Interrupted”](https://www.microsoft.com/en-us/research/publication/search-interrupted-understanding-and-predicting-search-task-continuation/) (2012) | Query-log analysis of more than 1,000 searchers | Important information tasks span sessions; deliberate advance planning is uncommon, and later manual state recovery is common. | Search-task continuation is adjacent evidence, not direct learning evidence. |

### Public qualitative corpus

| Cluster | Accounts sampled | Repeated observations | Evidence weight |
| --- | --- | --- | --- |
| Read-later backlogs | [Readwise Reader backlog discussion](https://www.reddit.com/r/readwise/comments/1dh5w18/tips_for_managing_reader_backlog/), [Hacker News read-later discussion](https://news.ycombinator.com/item?id=11149329), [current bookmarking discussion](https://news.ycombinator.com/item?id=42648006) | Hundreds or thousands of saved items; newest-first consumption; fatigue; periodic triage; searchable archive or “antilibrary”; shortlist/current-project layer; deletion or intake caps. | Strong qualitative convergence across independent threads; no demographic or prevalence inference. |
| Continuous sources | [Hacker News RSS discussion](https://news.ycombinator.com/item?id=248623), [recent RSS capacity discussion](https://www.reddit.com/r/rss/comments/1f4s23q/rss_is_not_the_solution_to_staying_informed_with/), [Readwise Feed discussion](https://www.reddit.com/r/readwise/comments/18kbzlp/how_do_you_use_feeds_on_reader/) | Unread counters become debt; people prune sources, skim low-priority groups, mark all seen, separate “must read” from optional streams, and promote only a few arrivals into a library. | Strong convergence on triage mechanics; volumes and strictness vary greatly. |
| Mixed native saves | [Scattered saved-content discussion](https://www.reddit.com/r/productivity/comments/1637kea/how_do_you_organize_your_saved_knowledge_finds_screenshots_for_later/), [ever-growing saved-items discussion](https://www.reddit.com/r/productivity/comments/f1m9fr/how_to_overcome_the_ever_growing_saved_items_list/) | Screenshots, YouTube, Reddit, Instagram, browser saves, and Pocket remain fragmented. Responses range from consolidation to periodic purge, re-search, or deliberately saving less. | Corroborates PIM research; individual prescriptions conflict. |
| Intentional curricula | [Self-study discussion](https://news.ycombinator.com/item?id=23057411), [study-workflow discussion](https://news.ycombinator.com/item?id=36759174), [learning-plan discussion](https://news.ycombinator.com/item?id=33517463) | Having the “right” resources does not answer what to do next. People use projects, roadmaps, topic/module cards, must/want distinctions, short planning horizons, and practical outputs to select from mixed resources. | Strong thread-level detail; technical self-learners are overrepresented. |
| Daily and periodic selection | [Now/Soon/Later discussion](https://news.ycombinator.com/item?id=31471127), [GTD inboxes discussion](https://www.reddit.com/r/gtd/comments/zslvpw/inboxes_everywhere/) | Review moves options into This Week or Today; limits protect the active set; optional material can remain unscheduled or be discarded without guilt. | Meaningful repeated pattern, partly influenced by named productivity systems. |
| Books and long-form material | [Book-progress discussion](https://www.reddit.com/r/books/comments/g6boxa/do_you_guys_enjoy_tracking_your_book_progress_as_you_read/), [tracking-goals discussion](https://www.reddit.com/r/books/comments/12gd4jb/setting_reading_goals_and_tracking_progress_can_be_counterproductive_because_it_turns_reading_into_a_task/), [multiple-books discussion](https://www.reddit.com/r/books/comments/9dj06x/people_who_read_multiple_books_at_a_time_how/), [next-book selection discussion](https://www.reddit.com/r/books/comments/slwh62/how_do_you_decide_which_book_on_your_backlog_to_read_next/) | Tracking motivates some and pressures others. Multiple concurrent books serve different locations, energy levels, moods, or purposes. Selection uses relevance but also length, genre, series, age, and mood. | Useful split and vocabulary; reading for pleasure and learning are intermixed. |
| High-maintenance organisation | [PhD Zotero/Obsidian workflow](https://www.reddit.com/r/ObsidianMD/comments/m5ou2h/phd_workflow_obsidian_zettelkasten_zotero_pandoc/), [personal-curriculum discussion](https://www.reddit.com/r/personalcurriculum/comments/1py6uzh/how_specific_is_your_personal_curriculum/) | Some people invest heavily in metadata, staged processing, topic notes, output-based curricula, and reviews; they also describe the time cost and unusable older captures. | Meaningful niche or isolated accounts, not a default workflow. |

Mozilla's [Save for Later diary and survey work](https://blog.mozilla.org/ux/2012/10/save-for-later/) adds a useful bridge between the layers: ten diary/walkthrough participants and a survey of more than 5,000 bookmark users exposed heterogeneous intentions—consume, reuse, share, organise, archive, clean up, or do nothing. Tabs were common resumable state and self-email bridged devices. It was exploratory product research, so this memo treats it as corroboration rather than prevalence.[^mozilla]

## An end-to-end behavioural model

The stages below are analytical. Real people skip stages, merge them, or distribute them across tools.

| Stage | What people actually do | Variation by material | Characteristic failure |
| --- | --- | --- | --- |
| **1. Encounter and capture** | Keep a tab open; use a native save, bookmark, share sheet, self-email, screenshot, file, paper note, or purchase; sometimes deliberately leave the item and trust search. Capture choice preserves a useful property such as visibility, cross-device access, context, or low effort.[^bruce][^tabs][^mozilla] | Manual choices usually carry more intent than automatic arrivals. Books may enter through ownership or a reading list; video/article captures often remain inside their source app. | Material scatters across channels. Cheap capture outruns later attention. An open tab is a powerful but fragile reminder. |
| **2. Intake and triage** | Decide whether an arrival is irrelevant, merely seen, worth keeping as reference, worth reading later, or active now. Triage may happen immediately, in batches, during review, or not at all.[^reader-feed][^rss-hn][^reader-lifecycle] | A continuous source creates many low-intent arrivals, so “seen/dismissed/kept” is distinct from progress. A manually chosen Item can often enter the Library directly. | Every arrival becomes unread debt; no bulk-clear path; old items accumulate behind a novelty-biased front. |
| **3. Organise for retrieval or intent** | Use search and a few broad folders, labels, sources, projects, or topics. Organisation is often lazy: structure appears after accumulation or when a concrete project creates a reason to group.[^abrams][^boardman][^bergman][^reaccess] | Reference stores benefit from source/topic facets. A deliberate learning goal groups books, courses, articles, and videos by purpose, not Type. | Mandatory filing interrupts capture; taxonomies decay; a resource appears in multiple conceptual places; format silos fragment the goal. |
| **4. Commit and prioritise** | Promote a few options into a shortlist, current project, Now/This Week/Today set, or scheduled slot. Choose through goal relevance, expected value, urgency, available time, energy, location, mood, or novelty.[^self-study][^now-soon][^book-next][^kizilcec] | Finite curricula can be roughly ordered or split into must/want. Streams are skimmed for signal. Long material competes differently from a ten-minute article. | The Library masquerades as a queue; too many “priorities” defeat choice; counts favour short material; today's decision is remade from scratch. |
| **5. Learn, pause, and resume** | Switch among several active Items; skip, supplement, revisit, or abandon. Preserve state through the browser/course/book itself, an open tab, a note, memory, or a cue. Resume when time and context fit.[^veletsianos][^mooc-health][^obendorf][^book-multiple] | Books need page/chapter context, courses need lesson and perhaps assignment context, video needs timestamp, and an article may need only unread/finished. A goal also needs a “what next” cue. | Status says “in progress” but cannot answer where or why to restart; device or tool changes lose state; interruption turns into permanent abandonment. |
| **6. Track, revise, or close** | Mark complete, log progress, revisit, archive as reference, decide “enough learned,” drop without completion, replace a resource, or revise the plan. Detailed tracking is optional and temperament-dependent.[^book-progress][^book-goals][^veletsianos][^mooc-health] | Completion is comparatively clear for an article, ambiguous for a reference book, and often subordinate to a personal goal in a course. | Done, dismissed, abandoned, archived, and “learned enough” collapse into one state. Metrics create pressure or bias toward easy/short items. |

## Recurring patterns

### 1. Capture is plural because keeping serves plural intentions

People do not choose capture methods solely for later retrieval. A visible tab reminds; self-email crosses devices; a bookmark archives; a screenshot preserves a moment; a folder associates material with a project. Bruce et al. found no single keeping method satisfied reminder, context, integration, access, sharing, and maintenance together. Mozilla's diary work and the tab study reach the same qualitative conclusion.[^bruce][^mozilla][^tabs]

The implication is not that a product must imitate every channel. It is that “add title and URL” is only the record-creation portion of capture. The original source, capture time, incoming channel, and perhaps the user's quick reason may carry the context required for later choice. Capture should be cheap enough that organisation is not mandatory, but it should not erase useful provenance.

### 2. Saving is not committing

Large read-later collections are variously understood as a queue, reference archive, search extension, aspirational self-portrait, or antilibrary. Conflict appears when the interface assumes only the queue interpretation. In the public accounts, people with hundreds or thousands of saves often preserve them because search may make one valuable later, while consciously giving up the idea of reading all of them. Published bookmark research similarly finds long-unused entries and limited reliance on folder navigation.[^reader-backlog][^readlater-hn][^bookmarking-hn][^abrams][^reaccess]

This is the most consequential recurring pattern for Unshelf. Library membership should answer “may I want this again?” It should not automatically answer “have I promised to complete this?” A commitment requires a separate act, even if that act is only adding an Item to a shortlist or current goal.

### 3. Continuous streams require a boundary before the durable Library

RSS users repeatedly distinguish high-signal subscriptions from skimmable streams, clear unread counts in bulk, prune noisy sources, and star or promote a small subset. Readwise users explicitly describe moving selected Feed arrivals into the Library and disposing of the rest. Without this boundary, a system manufactures work faster than the learner can evaluate it.[^rss-hn][^rss-reddit][^reader-feed][^reader-lifecycle]

This supports the Candidate/Item distinction already recorded in [the parent
Wayfinder map](https://github.com/rajat2006/unshelf/issues/259): discovery creates
a Candidate or feed hit; Keep creates an Item. Candidate state such as new, seen,
kept, or dismissed is intake state, not learning Status. Source grouping,
chronological scanning, and bulk seen/dismiss operations are primary mechanics,
not optional polish.

### 4. Organisation is usually lazy, shallow, and purpose-led

People introduce folders and other structure as collections become unwieldy, but filing itself costs attention and the structures require maintenance. Re-search, visible recency, source grouping, and broad labels often beat navigating a precise hierarchy. When a coherent project exists, however, people want the related material together even when it spans formats.[^abrams][^boardman][^bergman][^obendorf]

Power Learners therefore need two modest organisational modes:

- facets such as Type, source, status, or optional Label for retrieving from the broad Library; and
- a goal- or project-shaped grouping for a finite set of mixed material being learned together.

Neither mode should be required during Capture. A Type-first hierarchy would reproduce the project-fragmentation problem: the book, course, article, and video for one learning question would remain conceptually separated.

### 5. A small working set makes daily choice tractable

Across curricula, read-later accounts, and productivity discussions, people protect attention by promoting a few things into a shortlist, current project, Now, This Week, or Today. Some use a periodic review; some choose opportunistically from a shortlist. MOOC studies add that goal setting and planning correlate with personal-goal attainment, while time is the dominant constraint.[^self-study][^now-soon][^gtd-inboxes][^kizilcec][^time-bottleneck]

Daily choice is multi-factor rather than a stable global rank. Available minutes, energy, device, location, mood, urgency, and current goal all change what is appropriate. Long material and short material are not commensurate units. A useful product can reduce the option space without pretending it can compute one objectively correct order.

### 6. Multiple active Items and adaptive paths are normal

Public book accounts describe reading several books for different places, energy levels, or moods. MOOC learners skip low-value sections, supplement externally, pause, revisit, or stop once their personal goal is met. Self-study accounts use projects or outcomes to select and replace resources rather than treating a predefined sequence as sacred.[^book-multiple][^veletsianos][^mooc-health][^mooc-learning][^self-study]

The evidence argues against a single-current-item constraint and against equating platform completion with learning success. A plan may contain ordered prerequisites, parallel alternatives, reference material, and optional enrichment, but the present corpus does not establish that learners need a general-purpose dependency graph.

### 7. Resumption needs a cue richer than “in progress”

Tabs, course dashboards, physical bookmarks, notes, history, and memory all preserve some part of pending state. Their value is not merely locating the resource; it is restoring the learner's mental context and next action. Empirical work on tabs and cross-session search shows that deliberate advance planning is uncommon and later state recovery is common. The programming study is only adjacent evidence, but it strengthens the design hypothesis that chronological, automatically captured cues can reduce resumption cost.[^tabs][^search-interrupted][^parnin]

For long material, a status flag cannot tell the learner where to restart. At minimum, later research should test Type-appropriate position—page/chapter, lesson, timestamp, or percentage—and a lightweight generic resume cue. That need can be addressed without bringing full notes and highlights into scope.

### 8. Tracking helps some learners and distorts others

Book discussions split consistently: progress bars, logs, and goals make reading tangible and motivating for some people, while others report pressure, forced continuation, or choosing shorter books to satisfy counts. MOOC evidence likewise shows that personal goals and adaptive use matter more than raw platform completion.[^book-progress][^book-goals][^book-count-goals][^mooc-health]

Tracking should therefore be calm, optional, and subordinate to the learner's intent. Target dates may help selection, but lateness should not imply failure. Counts across unlike Types create false precision. “Done” needs neighbouring exit states so abandoning a poor resource or learning enough from part of it is not misreported as either failure or full completion.

## Meaningful minority patterns

These patterns are repeated and product-relevant, but not universal enough to make mandatory.

### Searchable antilibrary

Some high-volume collectors intentionally retain thousands of items, add little structure, and expect future search or re-discovery to surface the right one. Their success criterion is not queue zero; it is optionality at low maintenance cost.[^reader-backlog][^readlater-hn][^bookmarking-hn] This makes good search, provenance, deduplication, and non-judgemental archive semantics important, but does not justify encouraging unlimited capture.

### Scheduled review and explicit work-in-progress limits

Some people run weekly or monthly reviews that move material from Later to This Week and Today, or cap the number of active modules. This is a coherent remedy for choice overload, but many others choose opportunistically and would reject process overhead.[^now-soon][^gtd-inboxes][^self-study] Unshelf should be able to support a small active set without requiring a formal review ritual.

### Contextual multiplexing

People sometimes keep several books or resources active because they fit different locations, devices, energy levels, moods, or kinds of attention.[^book-multiple][^book-next] This supports multiple active Items and perhaps lightweight context cues. It does not yet justify a comprehensive context-tagging system.

### Detailed instrumentation

Some learners enjoy page counts, streaks, spreadsheets, reading logs, or elaborate dashboards; others experience the same mechanisms as pressure.[^book-progress][^book-goals] Detailed analytics can remain an extension point. It should not determine the core lifecycle or default tone.

### Expensive knowledge pipelines

Researchers and knowledge-management enthusiasts sometimes process every source through metadata, annotation, source notes, and topic notes. They also describe the time cost and the unusability of older, poorly processed captures.[^phd-workflow] This is evidence for preserving source identity and supporting export/integration seams, not for adding notes or mandatory processing to the present scope.

## Isolated anecdotes and design probes

- A few public accounts choose the next book by randomisation, genre rotation, backlog age, another person's choice, or a strict input cap.[^book-next] These are candidates for prototype options, not general requirements.
- SuperMemo's [incremental-learning workflow](https://www.super-memory.org/archive/help/il_full.htm) combines daily priority sorting, automatic postponement, resume points, and interleaving new topics with review. It demonstrates that a system can manage a large working set, but it is a prescribed expert workflow from one product, not evidence of broad demand.
- Automatically captured chronological cues improved interrupted programming-task resumption, and saved query/result state is suggested by search-continuation research.[^parnin][^search-interrupted] These justify testing automatic resume context, not assuming the same effect for books, videos, or courses.
- A small focus group and field deployment of a learning-resurfacing system reported that saved links in bookmarks, messaging apps, and tabs were forgotten, and that resurfacing worked only when timing matched current priority and interest.[^memorymate] This is promising recent evidence, but the sample is too small to establish default resurfacing behaviour.

## Workflow archetypes

Archetypes are useful combinations of behaviour, not mutually exclusive user personas. One learner may move between several.

| Archetype | Characteristic workflow | Main pain | Product need |
| --- | --- | --- | --- |
| **Stream skimmer** | Subscribes broadly; scans by source or recency; marks most arrivals seen; promotes a few. | Unread debt and noisy sources swamp signal. | Candidate/feed boundary, source controls, bulk seen/dismiss, low-cost Keep. |
| **Searchable collector** | Captures generously; organises lightly; re-finds through search, source, or memory; accepts that most material will not be consumed. | Native saves are fragmented; “not started” looks like failure. | Flat durable Library, provenance, search/facets, calm archive semantics. |
| **Inbox curator** | Captures first; periodically triages to discard, reference, Later, Shortlist, or active. | Review becomes a chore and Later grows indefinitely. | Fast triage, batch actions, small commitment layer, optional review cadence. |
| **Goal/project builder** | Defines an outcome; gathers mixed material; sequences essentials; marks alternatives or enrichment; replaces resources as understanding develops. | Good resources do not answer “what next?”; format silos hide the coherent path. | Mixed-Type goal grouping, simple priority/order, must/optional roles, plan revision. |
| **Contextual multiplex learner** | Keeps several books, courses, articles, or videos active and chooses by time, energy, place, device, or mood. | Restart cost and lost position make paused work disappear. | Multiple active Items, Type-aware progress or resume cue, a small selectable working set. |
| **Instrumentation enthusiast** | Logs pages, sessions, streaks, dates, and completion; may enjoy dashboards. | Tracking overhead or metric gaming can displace learning. | Optional progress detail and export, never a universal score. |
| **Knowledge-pipeline specialist** | Applies detailed metadata and downstream notes to a smaller set of high-value sources. | Processing cost creates its own backlog. | Stable source identity and integration seam; keep pipeline features out of the core workflow. |

## Pain points across material types

| Pain | Why it happens | Particularly visible in |
| --- | --- | --- |
| **Capture exceeds attention** | Saving is cheap, interest is momentary, and future time is overestimated. | Articles, videos, social saves, feeds. |
| **Unread debt and guilt** | Library membership, unread state, and commitment are collapsed. | Read-later queues, RSS counters, purchased books. |
| **Fragmentation** | Each source app provides its own saves and progress state; cross-format goals have no shared home. | Mixed articles/videos, courses plus books, cross-device capture. |
| **Organisation maintenance** | Precise folders and tags require decisions at capture and decay as interests change. | Large bookmark/reference collections and elaborate research pipelines. |
| **Novelty and recency bias** | New arrivals remain visible while old Later items lose context. | Feeds, read-later, Watch Later. |
| **Choice overload** | A broad option pool is presented directly as today's menu. | Large Libraries and self-designed curricula. |
| **Resumption friction** | “In progress” preserves neither position nor next action; tabs and memory are fragile. | Books, courses, long videos, interrupted goals. |
| **Time and context mismatch** | Work, family, energy, location, and device determine what is feasible now. | MOOCs, multiple books, mobile/desktop handoff. |
| **Ambiguous closure** | Finishing the artifact, learning enough, rejecting it, archiving it, and losing interest are different outcomes. | Courses, reference books, goal plans. |
| **Metric distortion** | Counts flatten unlike effort and reward short or easy material; targets become judgement. | Book goals, streaks, cross-Type completion dashboards. |

## Product implications for the wayfinder map

These are evidence-backed directions for specification and prototyping, not final product decisions.

### Preserve the Item spine, but do not make the Library a backlog

[ADR-0003](../adr/0003-one-item-spine-with-per-type-details.md) remains well supported: a shared Item can anchor identity, source, broad lifecycle, and cross-Type retrieval. [CONTEXT.md](../../CONTEXT.md) currently defines the Library as the flat store of all captured Items; the evidence supports that definition if Library membership remains optionality rather than obligation.

The default `not started / in progress / done` Status is too narrow to express intake and exit semantics. It should remain progress-oriented while distinct facts express Candidate intake and perhaps archived/reference, abandoned, dismissed, or “enough learned.” The exact state model still needs design work; adding every term to one enum would recreate the collapse this research warns against.

### Retain a pre-Library state for recurring sources

The Candidate boundary in [the parent Wayfinder
map](https://github.com/rajat2006/unshelf/issues/259) is strongly supported.
Continuous discovery should not create committed Items automatically. It needs
chronological/source grouping, new/seen/kept/dismissed state, batch clearing,
source pause/prune, and a cheap promotion to Item.

This reopens the scope of [ADR-0007](../adr/0007-ingestion-is-one-uniform-manual-capture.md), which deliberately constrained ingestion to manual Capture. The durable part of that decision is a uniform Item after Keep, not the assumption that all future intake can share one pre-Item workflow.

### Specify a commitment or focus layer distinct from organisation

Labels answer categorisation; Status answers progress; neither cleanly answers “which few options am I considering now?” The recurring Library → shortlist/current goal → today pattern suggests a small commitment layer. It might be a persistent shortlist, goal membership plus priority, a daily focus set, or some combination. The model should avoid turning every target date or active status into a hard promise.

This requirement is not currently explicit in [ADR-0014](../adr/0014-next-gen-surface-model-and-navigation.md), whose exact surface model is Library, Trails, Labels, and global Capture. The evidence does not yet prove a new top-level destination, but it does reopen the assumption that those two organisational axes completely cover choosing and resuming work.

### Model a learning goal around intent, not Type

Finite, intentional learning is organised around a question, outcome, project, or module, with mixed material playing roles such as essential, optional, reference, or alternative. This supports a goal/plan concept with simple ordering and priority. It does not support presenting separate book, course, video, and article plans.

The evidence is compatible with Trails at a high level, but does not validate the current Trail/Stop abstraction or a dependency graph. [ADR-0004](../adr/0004-organization-model.md)'s concern about maintenance-heavy structures is reinforced. The map should prototype a shallow mixed-Type plan—ordered essentials plus parallel/optional material—against the current Trail model before deciding whether Trail and Stop survive.

### Treat daily selection as a workflow

Sorting the whole Library by target date is not equivalent to choosing today. Daily selection operates on a deliberately reduced option set and depends on goal, time, energy, device, and context. A prototype should compare at least:

- explicit Today/Next selection;
- a persistent shortlist with quick pick-up;
- goal-scoped “next” Items; and
- gentle resurfacing that can be dismissed and does not imply obligation.

[ADR-0005](../adr/0005-soft-target-and-completion-dates-on-the-item.md)'s soft, passive dates fit the evidence. Overdue styling, streak pressure, and cross-Type completion scores do not. Resurfacing is also distinct from the outbound notifications deferred by [ADR-0006](../adr/0006-reminders-revision-deferred-seam-complete.md); it can be tested in-product without reopening email or push reminders.

### Support several active Items and low-cost resumption

Learners adapt paths and keep multiple resources active for different contexts. Unshelf should not enforce one current Item per learner or goal. It should test a minimal generic resume cue plus Type-appropriate position:

- Book: page, chapter, or named section;
- Course: lesson/module and perhaps next activity;
- Video: timestamp;
- Article: unread/partial/done may be enough;
- Goal: a short “what next/why” cue independent of any one Item.

This can remain compatible with the map's exclusion of in-app consumption, notes, and highlights. Unshelf records the pointer and intention; the source remains where learning happens.

### Make progress calm and closure truthful

Progress is useful when it helps a learner resume or reflect. It is harmful when it judges, compares unlike Types, or makes sunk cost look virtuous. Defaults should avoid quotas, streaks, and universal percentages. Learners need to be able to finish, abandon, replace, archive for reference, or decide they learned enough without corrupting progress history.

### Keep Capture lightweight and channel-aware

The evidence makes the map's capture-context fog more specific. The next research/prototype should distinguish at least desktop browser, mobile share, source-native import, and offline/manual title capture. It should test which context is worth preserving—source, surrounding page, captured-at time, selected text, quick reason—without requiring filing at Capture.

## Questions that are now specifiable

1. **What are the exact semantics of Library, Later, shortlist, active, and Today?** Which are persistent facts, which are views, and which imply commitment? How do they relate to Item Status and target date?
2. **What is a learning goal in the domain model?** Can an Item belong to several goals? Does membership carry order, priority, essential/optional/alternative role, and goal-specific completion? What, if anything, remains of Trail and Stop?
3. **What is the smallest daily-selection workflow?** Is selection manual, goal-derived, periodically reviewed, resurfaced, or context-filtered? What work-in-progress limits are helpful without becoming process enforcement?
4. **What is the minimum useful resume state per Type?** Which positions can be imported from a source and which must be entered? Does the resume cue belong to Item, goal membership, or both?
5. **How should closure be represented?** Distinguish done, learned enough, abandoned, replaced, dismissed before Keep, and retained only as reference. Which distinctions affect product behaviour rather than merely history?
6. **What capture surfaces belong in the next coherent scope?** Browser extension, mobile share, URL/manual capture, source integrations, and offline-title capture have different context and implementation costs.
7. **What are the Candidate lifecycle and retention rules?** Define new/seen/kept/dismissed, source grouping, bulk actions, duplicate handling, retention, and whether Keep is reversible.
8. **How should goal-level progress work without false precision?** Candidate approaches include completed essentials, learner-declared confidence, next milestone, or no roll-up at all.
9. **How should old valuable material compete with new arrivals?** Compare search-only, review, random resurfacing, goal relevance, and age-balanced suggestions. Test timing and dismissal burden explicitly.
10. **Which behaviours differ enough by Type to deserve per-Type details?** Position is clearly a candidate; selection, closure, and goal membership may remain shared.

## Conclusion

The research narrows the product problem. Unshelf is not principally a better folder tree for learning links. It is a system for preserving a large, heterogeneous field of options while helping the learner make a few commitments, choose sensibly today, and return without reconstructing context.

The smallest coherent next scope should therefore test three connected seams:

1. **intake without debt**—manual Items plus a separate Candidate/feed boundary for continuous sources;
2. **commitment without over-organisation**—a small focus layer and a simple mixed-Type goal/plan; and
3. **progress without pressure**—multiple active Items, lightweight resume state, and truthful closure.

That direction preserves the strongest existing decisions—the shared Item spine, flat Library, optional Labels, and calm dates—while reopening manual-only ingestion, the sufficiency of the Library/Trails/Labels surface model, and the current Trail/Stop representation. Within this map, prototypes and Rajat's live fit-check should now decide those reopened seams; direct Power Learner interviews remain useful follow-on validation outside the map, and more broad desk research is unlikely to resolve the seams by itself.

## References and source notes

[^bruce]: Harry Bruce, William Jones & Susan Dumais, [“Information behaviour that keeps found things found”](https://informationr.net/ir/10-1/paper207.html), *Information Research* 10(1), 2004. The delayed-refinding portion found 93% first-method success; successful first methods were direct URL (42%), bookmark (18%), search (18%), and another website (16%). In 76% of cases no explicit keeping action had been taken. These figures describe a small observed task sample, not all keeping behaviour.
[^abrams]: David Abrams, Ron Baecker & Mark Chignell, [“Information Archiving with Bookmarks”](https://www.dgp.toronto.edu/public_user/RMB/papers/p23.pdf), CHI 1998.
[^boardman]: Richard Boardman & M. Angela Sasse, [“Stuff goes into the computer and doesn't come out”](https://discovery.ucl.ac.uk/id/eprint/13438/), CHI 2004.
[^bergman]: Ofer Bergman et al., [“The project fragmentation problem in personal information management”](https://doi.org/10.1145/1124772.1124812), CHI 2006. In their prior-day task material, an average 55.57% of items had related information in another format; the exact rate is context-specific, but the cross-format problem is material.
[^obendorf]: Hartmut Obendorf et al., [“Web page revisitation revisited”](https://vsis-www.informatik.uni-hamburg.de/getDoc.php/publications/280/chi2007-newformat.pdf), CHI 2007. In the logged sample, 72.6% of revisits occurred within an hour; 7.6% occurred after more than a week. Long-term returns were rare but important.
[^reaccess]: Ofer Aljukhadar, Sylvain Sénécal & Charles-Étienne Daoust, [“Out of sight and out of mind: Bookmarks are created but not used”](https://doi.org/10.1177/0961000620949652), *Journal of Librarianship and Information Science*, 2021.
[^tabs]: Amy X. Zhang & Justin Cranshaw, [“When the Tab Comes Due: Challenges in the Cost Structure of Browser Tab Usage”](https://doi.org/10.1145/3411764.3445585), CHI 2021.
[^mozilla]: Alex Limi et al., [“Save for Later”](https://blog.mozilla.org/ux/2012/10/save-for-later/), Mozilla UX, 2012. Product research: three-day diary and walkthroughs with ten participants, follow-up with five, and a bookmark survey with more than 5,000 responses.
[^veletsianos]: George Veletsianos, Justin Reich & Laura Pasquini, [“The Life Between Big Data Log Events”](https://doi.org/10.1177/2332858416657002), *AERA Open*, 2016.
[^mooc-learning]: Allison Littlejohn et al., [“Learning in MOOCs: Motivations and self-regulated learning in MOOCs”](https://www.sciencedirect.com/science/article/pii/S1096751615300099), *The Internet and Higher Education*, 2016.
[^mooc-health]: Colin Milligan & Allison Littlejohn, [“How health professionals regulate their learning in massive open online courses”](https://pmc.ncbi.nlm.nih.gov/articles/PMC5125435/), *The Internet and Higher Education*, 2016.
[^kizilcec]: René F. Kizilcec, Mar Pérez-Sanagustín & Jorge J. Maldonado, [“Self-regulated learning strategies predict learner behavior and goal attainment in Massive Open Online Courses”](https://www.rene.kizilcec.com/wp-content/uploads/2016/11/kizilcec2017srl.pdf), *Computers & Education*, 2017. The authors explicitly caution that the findings are correlational.
[^time-bottleneck]: T. Eriksson, T. Adawi & C. Stöhr, [“Time is the bottleneck: a qualitative study exploring why learners drop out of MOOCs”](https://link.springer.com/article/10.1007/s12528-016-9127-8), *Journal of Computing in Higher Education*, 2017.
[^parnin]: Chris Parnin & Robert DeLine, [“Evaluating Cues for Resuming Interrupted Programming Tasks”](https://www.microsoft.com/en-us/research/publication/evaluating-cues-for-resuming-interrupted-programming-tasks/), CHI 2010.
[^search-interrupted]: Eugene Agichtein et al., [“Search, Interrupted: Understanding and Predicting Search Task Continuation”](https://www.microsoft.com/en-us/research/publication/search-interrupted-understanding-and-predicting-search-task-continuation/), SIGIR 2012.
[^reader-backlog]: [“Tips for managing Reader backlog?”](https://www.reddit.com/r/readwise/comments/1dh5w18/tips_for_managing_reader_backlog/), r/readwise. Used as a set of public accounts, not a representative sample.
[^readlater-hn]: [“How do you deal with read-it-later services?”](https://news.ycombinator.com/item?id=11149329), Hacker News, 2016.
[^bookmarking-hn]: [“What are you using for bookmarking?”](https://news.ycombinator.com/item?id=42648006), Hacker News, 2025.
[^rss-hn]: [“How do you manage all your RSS feeds?”](https://news.ycombinator.com/item?id=248623), Hacker News, 2008.
[^rss-reddit]: [“RSS is not the solution to staying informed with hundreds of sources”](https://www.reddit.com/r/rss/comments/1f4s23q/rss_is_not_the_solution_to_staying_informed_with/), r/rss, 2024.
[^reader-feed]: [“How do you use feeds on Reader?”](https://www.reddit.com/r/readwise/comments/18kbzlp/how_do_you_use_feeds_on_reader/), r/readwise, 2023.
[^reader-lifecycle]: [“Post lifecycle diagram for Readwise Reader”](https://www.reddit.com/r/readwise/comments/15cvv2g/post_lifecycle_diagram_for_readwise_reader/), r/readwise, 2023.
[^self-study]: [“Ask HN: How do you self-study?”](https://news.ycombinator.com/item?id=23057411), Hacker News, 2020.
[^now-soon]: [“Ask HN: How do you organize your Now, Soon, and Later?”](https://news.ycombinator.com/item?id=31471127), Hacker News, 2022.
[^gtd-inboxes]: [“Inboxes everywhere”](https://www.reddit.com/r/gtd/comments/zslvpw/inboxes_everywhere/), r/gtd, 2022.
[^book-progress]: [“Do you guys enjoy tracking your book progress as you read?”](https://www.reddit.com/r/books/comments/g6boxa/do_you_guys_enjoy_tracking_your_book_progress_as_you_read/), r/books, 2020.
[^book-goals]: [“Setting reading goals and tracking progress can be counterproductive…”](https://www.reddit.com/r/books/comments/12gd4jb/setting_reading_goals_and_tracking_progress_can_be_counterproductive_because_it_turns_reading_into_a_task/), r/books, 2023.
[^book-count-goals]: [“What are your reading goals?”](https://www.reddit.com/r/books/comments/yri45m/what_are_your_reading_goals/), r/books, 2022.
[^book-multiple]: [“People who read multiple books at a time: how?”](https://www.reddit.com/r/books/comments/9dj06x/people_who_read_multiple_books_at_a_time_how/), r/books, 2018.
[^book-next]: [“How do you decide which book on your backlog to read next?”](https://www.reddit.com/r/books/comments/slwh62/how_do_you_decide_which_book_on_your_backlog_to_read_next/), r/books, 2022.
[^phd-workflow]: [“PhD workflow: Obsidian, Zettelkasten, Zotero, Pandoc”](https://www.reddit.com/r/ObsidianMD/comments/m5ou2h/phd_workflow_obsidian_zettelkasten_zotero_pandoc/), r/ObsidianMD, 2021.
[^memorymate]: Xinru Yan et al., [“MemoryMate: Supporting self-regulated learning in the wild through intelligent resurfacing”](https://doi.org/10.1080/0144929X.2024.2366985), *Behaviour & Information Technology*, 2024. The study comprised a focus group of seven, a three-week field deployment with 23, and five follow-up interviews.
