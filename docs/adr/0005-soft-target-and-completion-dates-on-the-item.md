# Two soft dates on the Item — a passive target date and a captured completion date; no Timeline entity

Unshelf models "when" as **two nullable date fields on the `Item` spine** — a
soft **`target_date`** ("by when I mean to finish this") and a **`completed_at`**
(when the Item entered _done_) — rather than as a Timeline or Schedule record.
Both ship in v1. `target_date` is **passive**: nothing reaches out about it; when
it is past and the Item is not done, the Item shows a *derived* "past target"
state, which clears once done (the date persists as history). `completed_at` is
set on the transition into _done_ and cleared if the Item is moved back out; **no
v1 screen reads it** — it is captured because completion history cannot be
backfilled and it seeds future revision. We chose this because the founder's
promise is a *calm, organise-once* tool: the useful gap the Trail and Status leave
open is "by when?", and the lightest honest answer is one soft date, not a
scheduling engine. Anything that *reaches out* — due-nudges, revision nudges — is
**delivery**, owned by Reminders (#7) and still deferred. Builds on ADR-0003 (the
Item spine, where Status already lives as one shared value) and refines ADR-0002,
whose #6 line deferred dates wholesale.

## Considered options

- **A Timeline / Schedule entity that points at Items (and sub-items).** Rejected:
  the job reduces to "by when?", which is a *property* of an Item, not a new record.
  Sub-items are deferred (ADR-0002, #4/#9), so half the original framing has nothing
  to point at. Dissolving the noun into a field keeps the glossary honest — Trail
  already lists Timeline/Schedule under _Avoid_.
- **Calendar-slotting ("Tuesday: chapters 3–4") or a start–end range.** Rejected:
  that is a *plan*, and a maintained one — the fiddling that made Raindrop feel like
  work, and it needs the deferred sub-items. A single soft date is the coarsest thing
  that still answers "by when"; if you mean "end of June", you pick June 30.
- **The date on the Stop or the StopItem join.** Rejected for v1: like Status
  (ADR-0003), a date shared across an Item's many Stops belongs on the Item, and
  ADR-0004 deliberately kept the join plain. A Stop- or Trail-level "when" can be
  *derived* (e.g. the soonest date among a Stop's Items) or added later — additive,
  non-breaking.
- **An active nudge when the date arrives.** Rejected: that is the Reminders feature
  (#7), whose delivery infrastructure is the heaviest thing in the brief and whose
  nagging character is what ADR-0002 backed away from. The target date is something
  the User *consults*, never something that consults them.
- **Clear the date on done and record no completion.** Rejected: keeping
  `completed_at` costs one column written on a transition, and completion history is
  *unbackfillable* — capturing it from day one is cheap insurance for the revision
  feature we already know we want. On-time/late *scorekeeping*, by contrast, was
  rejected — a calm tool keeps no tardiness ledger, so `completed_at` exists for
  revision, not for a lateness verdict.

## Consequences

- **`Item` gains two nullable columns** — `target_date` and `completed_at` — beside
  `status` on the spine; both are one shared value across every Stop the Item is in.
- **"Past target" is a pure derived read** — `target_date < today AND status ≠ done`.
  No stored flag, no scheduled job, no delivery.
- **`completed_at` is write-now-read-later "dark data" in v1.** The revision feature
  that consumes it lives with Reminders (#7) and stays deferred; capturing the fact
  now is deliberate.
- **Stop- and Trail-level "when" stay unbuilt** but cheap to add — a derived rollup
  or their own field — the same deferral discipline as ADR-0003/0004.
- **ADR-0002's #6 line is refined, not reversed:** soft dates are *in* v1; the
  scheduling engine, delivery, and revision are what remain deferred.
