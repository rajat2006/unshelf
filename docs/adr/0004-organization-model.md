# Stop is the single organising primitive — flat, unordered, and of one kind

> **Superseded in intent by [ADR-0014](0014-next-gen-surface-model-and-navigation.md)
> (2026-07-19, map #53).** The web-UI redesign demotes the Stop to a **per-Trail
> waypoint** and adds a many-to-many **labels** axis over the store — reopening this
> ADR's rejection of tags, since a Stop is no longer the store's cross-cutting
> grouping. This ADR still describes v1 as shipped; the reversal reasoning and its
> downstream build live in ADR-0014 and #74.

Unshelf v1 organises captured Items with exactly one grouping concept, the
**Stop** — a User-formed bag of Items. There are no tags, no nested/sub-Stops, and
no folders beyond **All**; a Stop holds its Items as an **unordered set** (all
sequencing lives on the Trail, #6); and there is **one uniform kind of Stop** —
"project" versus "learning" is how a Stop is *used*, not a type the model carries.
We chose a single primitive because the founder's promise is to take the
*organising* load off the user's mind — a one-time organise, tools not automation
(ADR-0001 addendum, #1). Every additional mechanism — a second place to file, a
hierarchy to maintain, a per-item order to curate — is exactly the fiddling that
made Raindrop + Chrome feel like work. This complements ADR-0002 (which already
ruled out multiple folders) and ADR-0003 (the Item spine and the many-to-many
`StopItem` join).

## Considered options

- **Tags alongside Stops.** Rejected: a Stop is already a many-to-many grouping,
  so a tag `#frontend` and a Stop "Frontend" do the same job — carrying both means
  deciding, for every Item, *which Stop and which tags*, the double-filing that
  makes bookmark managers tiring. If a Stop can be as loose as a tag, it absorbs
  the use case without a second concept.
- **Nested / sub-Stops (a topic tree).** Rejected: nesting is the folder tree
  ADR-0002 walked away from. Structure *between* Stops is carried by the Trail's
  sequence and forks (#6), so hierarchy has a home without containment. A "topic"
  is therefore just a Stop, not a separate layer.
- **Ordered lists within a Stop.** Rejected for v1: it duplicates "ordering" at
  two levels (Items within a Stop, Stops on a Trail) and adds within-Stop
  reordering. Keeping the Stop a set gives one-concept-one-job — Stop groups,
  Trail sequences.
- **A project/learning Stop type.** Rejected: nothing in v1 makes a project behave
  differently (tasks, dates, and reminders are all deferred — #6, #7, ADR-0002),
  so the two flavours are byte-for-byte identical. A distinction with no
  behavioural difference is pure overhead.

## Consequences

- **`StopItem` stays a plain many-to-many join** — `(stop_id, item_id)`, carrying
  no `status` (that lives on the Item, ADR-0003) and no `position`. Default
  display order is a UI concern (e.g. most-recently-added), not a stored sequence.
- **Every rejected option is cheap to add later** if it earns its place: a
  `position` column for ordering, a `parent_stop_id` for nesting, a `kind` for
  types — each is additive and non-breaking, the same deferral discipline as
  ADR-0003's per-type detail tables.
- **"Backlog" is deliberately undefined in v1.** The founding brief names it
  (reminders "for revision, for backlogs") but the concept isn't settled; it is
  left out of the vocabulary and revisited with reminders (#7) rather than
  half-modelled now.
- **"Topic" and "Tag" are not domain terms.** Grouping is always expressed as a
  Stop; the glossary lists both under _Avoid_.

## Update — Stop membership is constrained per Trail (2026-07-30, map “How an Item gets into a Stop”)

[Creating a Stop for an Item from the Item sidebar](https://github.com/rajat2006/unshelf/issues/214)
keeps the core of this ADR: a Stop remains a flat, unordered set and `StopItem`
still carries neither Status nor position. It narrows the old unconstrained
many-to-many reading now that every Stop belongs to exactly one Trail:

- an Item may appear in Stops on different Trails;
- an Item may appear in at most one Stop on any one Trail;
- the membership remains the same bare Item–Stop relationship—Trail identity is
  derived through the Stop rather than stored as another `StopItem` fact.

This is a sequencing invariant, not an ordering within the Stop. One shared Item
has one Status, and one Trail must not present that Status at several points in its
own plan. The database and every Item–Stop read and write boundary enforce the
invariant; the web merely avoids offering invalid same-Trail destinations.
