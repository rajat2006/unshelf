# Learning-plan stage models

Researched 2026-08-09 against current product documentation and original
research papers.

## Question

Does a goal-oriented **Learning Plan** need a mandatory **Stage** between the
plan and each Item placement, or should the plan sequence Items directly and
make grouping optional? How should **Daily Focus** relate to that longer-term
plan?

## Recommendation

Use **direct Item placements with optional Stages**.

- A Learning Plan is a durable commitment toward an outcome. It owns the Item
  placements and their sequencing or prerequisite relationships.
- A Stage is an optional, named grouping within one Learning Plan. It earns its
  place when it communicates a meaningful phase, sub-outcome, prerequisite
  boundary, or progress checkpoint. It should not exist merely to satisfy a
  storage invariant.
- Daily Focus is a date-scoped execution view over existing whole Items.
  Selecting an Item for today must not move it out of its Learning Plan or
  Library context.

Renaming the current **Stop** to **Stage** is a coherent transition, but a rename
alone should not settle the destination model. The current model makes every
Item pass through an unordered Stop while the Trail sequences Stops
([domain language](../../CONTEXT.md),
[organisation ADR](../adr/0004-organization-model.md)). Preserving that rule
under the new names would make Stage mandatory and would still require a
one-Item Stage whenever the User wants precise Item-level sequencing.

The recommended destination is therefore:

```text
Learning Plan -> Item placement -> Item
                       |
                       +-> optional Stage

Daily Focus --date-scoped reference--> the same whole Item
```

This recommendation does **not** decide whether plan topology should connect
Item placements, Stages, or a heterogeneous set of both. That is a separate
interaction and persistence decision; Stage optionality should not decide it by
accident.

## What current products establish

These are product conventions, not evidence that one structure causes better
learning.

| Area | Primary-source observation | What it implies |
| --- | --- | --- |
| Personal learning paths | LinkedIn distinguishes ordered Learning Paths from unordered Collections without documenting an intermediate hierarchy ([LinkedIn Learning](https://www.linkedin.com/help/learning/answer/a9361058)). Udemy paths directly combine courses, course portions, assessments, labs, links, and other resources; skill section headings are added only “if you'd like” ([path creation](https://business-support.udemy.com/hc/en-us/articles/360037244553-How-to-create-a-learning-path), [optional headings](https://business-support.udemy.com/hc/en-us/articles/360037246233--How-to-Find-Recommended-Courses-for-Learning-Paths)). Pluralsight says **most**, rather than all, paths use Beginner/Intermediate/Advanced levels ([Pluralsight Paths](https://help.pluralsight.com/hc/en-us/articles/24418811505044-Paths)). | Direct sequencing is sufficient for a valid learning path; levels or sections are common aids for longer paths, not a universal prerequisite. |
| Authored curricula | Open edX Studio uses a fixed section -> subsection -> unit -> component hierarchy ([Open edX course structure](https://docs.openedx.org/en/latest/educators/references/course_content_development.html)). Canvas Modules group heterogeneous learning materials, order them, and can carry prerequisites and completion requirements ([Canvas Modules API](https://www.canvas.instructure.com/doc/api/modules.html)). Moodle deliberately offers different formats: custom sections for objective-based scaffolding, weekly sections for synchronized pacing, and a single-activity format with one section ([Moodle course formats](https://docs.moodle.org/502/en/Course_formats)). | Mandatory hierarchy is a reasonable curriculum-authoring convention when groups also own release, assessment, navigation, or gating semantics. Those institutional concerns are broader than Unshelf's personal plan. |
| Project and planning tools | Todoist tasks belong to a project while `section_id` is nullable; its help presents sections as a way to break a **big** project into phases ([API](https://developer.todoist.com/api/v1/), [sections](https://www.todoist.com/help/articles/introduction-to-sections-rOrK0aEn)). Linear projects require only a name; milestones can later group issues and roll up progress ([projects](https://linear.app/docs/projects), [milestones](https://linear.app/docs/project-milestones)). GitHub Projects directly collect items and make grouping one configurable view over fields ([GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)). | Optional grouping is the prevailing fit when work ranges from tiny lists to long efforts. The item remains the stable execution and progress unit. |
| Read-later tools | Readwise Reader describes one flat document database, with tags and query-based Filtered Views providing groups ([Reader Filtered Views](https://docs.readwise.io/reader/docs/faqs/filtered-views)). Raindrop requires every bookmark to live in one collection and therefore needs a built-in **Unsorted** collection when the User does not choose one ([Raindrop collections](https://help.raindrop.io/collections)). | A forced parent tends to produce a fallback bucket. That can be useful for triage, but it is not a meaningful learning stage. A durable Library already gives Unshelf a home for unplanned Items. |
| Daily focus | Todoist Today presents scheduled tasks from every project ([Todoist Today](https://www.todoist.com/help/articles/plan-your-day-with-the-today-view-UVUXaiSs)). Microsoft To Do's My Day resets nightly, while unfinished tasks remain in their original list and can be suggested again ([Microsoft My Day](https://support.microsoft.com/en-US/ToDo/my-day-and-suggestions)). Microsoft Planner likewise leaves unfinished My Day tasks in their original Plan ([Planner My Day](https://support.microsoft.com/en-US/Planner/training/manage-your-tasks-with-my-tasks-and-my-day)). | “Today” is consistently an ephemeral projection across durable containers, not another owner or a stage inside each plan. |

The products also show when a Stage deserves more than a name. Canvas Modules
can own prerequisites and completion requirements, and Linear milestones expose
their own progress. If an Unshelf Stage never gains a sub-outcome, boundary,
rollup, or navigation role, it is only a visual heading and should remain cheap.

## What learning research does—and does not—support

There is relevant evidence for **meaningful intermediate goals**, but no located
study compares mandatory versus optional grouping in a personal learning-plan
data model.

- In Bandura and Schunk's experiment with children doing self-directed maths
  learning, proximal subgoals produced better progress, mastery, self-efficacy,
  and interest than a distant goal or no goal
  ([original paper](https://libres.uncg.edu/ir/uncg/f/D_Schunk_Cultivating_1981.pdf),
  [DOI](https://doi.org/10.1037/0022-3514.41.3.586)). This supports making
  attainable sub-outcomes expressible in a long plan. It does not show that
  every plan or Item requires a Stage record.
- Across three worked-example experiments, Catrambone found that emphasizing a
  functional subgoal improved transfer to novel problems
  ([original paper](https://bpb-us-e1.wpmucdn.com/sites.gatech.edu/dist/b/1555/files/2020/09/Catrambone1994.pdf),
  [DOI](https://doi.org/10.3758/BF03198399)). This supports labels that explain
  why several steps belong together. The cautious product inference is that a
  Stage should name such a purposeful unit, not a catch-all or sequencing
  wrapper; the study's setting—worked problem solutions—is much narrower than a
  mixed-media personal plan.
- Gollwitzer and Brandstätter distinguished a goal intention from a concrete
  implementation intention about when and where to act. Across three studies,
  the latter improved initiation or completion of difficult goals
  ([original paper](https://sparq.stanford.edu/sites/g/files/sbiybj19021/files/media/file/gollwitzer_brandstatter_1997_-_implementation_intentions_effective_goal_pursuit.pdf),
  [DOI](https://doi.org/10.1037/0022-3514.73.1.186)). This supports a seam between
  durable commitment and near-term action selection. It does not validate any
  particular Daily Focus UI or imply that a daily selection is itself a Stage.

The evidence-backed claim is therefore modest: Users benefit from being able to
express useful intermediate goals and concrete next actions. The research does
not justify imposing an intermediate container on every plan.

## Option and edge-case evaluation

| Case | Mandatory Stage | Optional Stage | No Stage |
| --- | --- | --- | --- |
| Small plan (1-5 Items) | Adds a title and entity with little information; often becomes one generic or one-Item Stage. | Stays a direct sequence unless a real phase exists. | Best simple case. |
| Long curriculum | Gives a scannable outline and natural rollups. | Gives the same outline where it is useful, while permitting a few ungrouped entries during planning. | Becomes a long, hard-to-scan sequence. |
| Parallel branches | Can make branches legible at phase level, but forces all branching through groups and hides fine-grained dependencies inside unordered groups. | Can label meaningful workstreams while leaving Item-level branch semantics available. | Precise, but large graphs can become visually noisy. |
| Mixed media | A phase can unite books, videos, courses, and articles around an outcome. | Same benefit without forcing an arbitrary group for every resource. | Type does not obstruct sequencing, but there is no outcome-level chunk. |
| One Item per Stage | Works mechanically but doubles objects and exposes that Stage is being used as a sequencing wrapper. | Allowed as an exceptional meaningful checkpoint, not required for Item order. | No duplication. |
| Reordering | Moving a Stage is efficient; reordering within today's unordered Stop shape is impossible without another model change. | Supports both block moves and precise Item moves, at the cost of defining mixed grouped/ungrouped behavior. | Simplest precise ordering. |
| Progress | Always offers Stage rollups, including uninformative `1/1` rollups. | Plan progress derives from all placements; Stage progress appears only where a Stage exists. | Plan progress only; no intermediate checkpoints. |

Optional Stages have one real cost: the UI and model must define how grouped and
ungrouped placements coexist. That cost is smaller and more honest than forcing
every small plan to manufacture structure, and it preserves a route to rich
curricula without making that complexity the entry price.

## Boundary surfaced by the research

“Daily Focus is what I will do today” is distinct from “Learning Plan is the
long-term commitment,” but research alone could not determine whether Daily
Focus should select a whole Item, a Structured Item's Part, or a separately
modelled learning action such as “read 20 pages.”

The subsequent Wayfinder decision selected **whole Items** for the current model.
Daily Focus may retain an originating Learning Plan placement for context, but it
does not create a separate task or make Parts independently selectable. A future
Part selection remains a separate decision rather than part of Stage optionality.

## Limitations

- Product documentation exposes supported concepts and interactions, not every
  internal schema rule or the reasons a product team chose them.
- Institutional course-authoring systems solve publishing, grading, release,
  and cohort-pacing problems that Unshelf may never own.
- The cited experiments concern particular maths tasks, worked examples, and
  goal-initiation situations. None tested Unshelf-like software or compared the
  three candidate data models.
- The product observations are current as of the research date and may change.
