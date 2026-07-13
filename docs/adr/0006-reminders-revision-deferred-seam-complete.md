# Reminders, revision & backlog stay deferred — and the deferral is seam-complete

Unshelf v1 ships **no Reminder** of any kind — nothing that reaches *out* to the
User. The whole "reaches out" family stays deferred: due-nudges, **backlog /
staleness** nudges ("untouched for 3 weeks"), and **revision** prompts on a
finished Item. This confirms ADR-0002's cut and ADR-0005's line (anything that
reaches out is delivery, owned by #7), but it adds the decision that made #7 worth
resolving rather than rubber-stamping: **we checked whether deferring silently
forfeits data v1 can never rebuild — and it doesn't.** No new v1 field is needed
beyond the `completed_at` that ADR-0005 already banked. We chose to resolve it this
way because the one thing a deferral genuinely can't buy back later is *history*,
and the precedent for guarding against that (ADR-0005's `completed_at` as
write-now-read-later "dark data") demanded we ask the same question of every other
trigger before closing the door.

## The seam check — the four fire triggers, against "can v1 rebuild this later?"

The issue named four things that might fire a reminder. Three are already covered
by fields on the Item spine; the fourth turns out not to need one.

- **A time** (target date reached) → reads `target_date`. Already in v1 (ADR-0005). ✓
- **A schedule slot** → there is no Schedule entity (ADR-0005 rejected it). A
  scheduled reminder is *configured* when the feature is built; it needs no
  pre-existing history. ✓
- **Finishing an Item → revision** → reads `completed_at`. Already banked as dark
  data precisely so this feature isn't blocked (ADR-0005). ✓
- **Staleness / backlog** ("untouched for 3 weeks") → needs "when was this last
  touched." This is the one that *looked* exposed — and isn't. See below.

## The asymmetry: bank completion, don't bank last-activity

`completed_at` and a hypothetical `last_activity` feel similar — both are "dark
data" a future feature would read — but they are different *kinds* of fact, and
only one is unbackfillable:

- **`completed_at` is a point-in-time historical fact.** Revision (spaced
  repetition) needs the *actual* date an Item was finished to schedule the next
  review; "you finished this 90 days ago" cannot be reconstructed after the fact,
  and reset-to-launch-day would compute the wrong interval. Genuine, permanent,
  per-Item loss if not captured. → **Bank it now.**
- **Staleness is a rolling signal**, not a stored fact — "no activity in the last N
  weeks." A future backlog reminder simply starts *observing* activity from
  launch-day forward. The worst case is a one-time N-week warm-up where it can't yet
  fire for Items last touched before launch — which is behaviour we'd *want* anyway
  (nagging about every pre-existing Item on launch-day would be obnoxious). → **No
  banking required; observe it live.**

So the deferral is **seam-complete**: no v1 column is owed to the deferred feature.

## Considered options

- **Add a `last_activity` / `last_touched_at` field now, mirroring `completed_at`.**
  Rejected: staleness is a rolling window that self-heals from launch, so there is
  no unbackfillable history to protect — the parallel to `completed_at` is
  superficial. Adding the column later, *if* precise "last engaged" semantics are
  ever wanted, is additive and non-breaking.
- **Model "Backlog" as its own concept, as #5 parked it to do here.** Rejected: the
  brief's "backlog" collapses into things we already have. Backlog-*as-a-nudge* is
  just the staleness flavour of Reminder — deferred with the rest. Backlog-*as-a-pile*
  is "not-started Items in **All**" (Status + the catch-all folder) — no new noun.

## Consequences

- **v1 adds no field for reminders.** The Item spine is unchanged by this decision;
  `target_date` and `completed_at` (ADR-0005) are the whole of what the deferred
  "reaches out" family will read.
- **`Reminder` and `Revision` enter `CONTEXT.md` as deferred terms**, so the model
  stops referencing a "Reminder" it never defines (Target date's _Avoid_ note leaned
  on it). Pinning the language now keeps it stable for the fast-follow.
- **The "Backlog" thread parked by ADR-0004 / #5 is closed here**, resolved into the
  Reminder family and **All** rather than a new primitive.
- **If precise last-activity semantics are ever wanted**, that field is added at
  build time — additive, non-breaking, the same deferral discipline as ADR-0003/0004/0005.
