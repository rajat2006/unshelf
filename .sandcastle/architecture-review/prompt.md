# TASK

Survey this repository at its current `main` checkout and find the **single
freshest deepening opportunity** — one shallow module that could become a deep
one — then write it up as a **PRD proposal** a maintainer can later expand into
child issues. If there is nothing fresh worth proposing, say so and skip.

This is the autonomous, GitHub-native form of an architecture review. It runs on
a schedule with no human in the loop, so it is a **read-only survey**: do **not**
edit code, do **not** commit, do **not** produce an HTML report, do **not** open
or wait on anything interactive, and do **not** touch any `gh` or label state.
Your entire job is to reason about the codebase and, in a later turn, emit one
structured decision.

**Do not run the `/improve-codebase-architecture` skill** — it is built for an
interactive session (HTML report + grilling a human through candidates) and does
not fit an autonomous run. Instead do the analysis directly, using the
**`/codebase-design` deep-module vocabulary** as your reference for the terms
(*module*, *interface*, *depth*, *seam*, *adapter*, *leverage*, *locality*) and
the principles (the deletion test; "the interface is the test surface"). You may
read `.claude/skills/codebase-design/` for those definitions; do not invoke it as
an interactive flow.

# CONTEXT

This is a whole-tree sweep on `main`, not a diff review. Orient yourself:

```
git log --oneline -20
git ls-files | sed -n '1,200p'
```

Read the domain model and the recorded decisions first — a good proposal names
real seams and does not re-litigate settled calls:

- `CONTEXT.md` — the ubiquitous language. Name modules by their real domain names
  (if `CONTEXT.md` defines "Stop", talk about "the Stop intake module").
- `docs/adr/` — the ADRs record decisions this review **must not re-propose**. A
  proposal that contradicts an accepted ADR is out of bounds.

## Already-open proposals — do NOT re-propose these

These architecture-review PRDs are already open in the backlog. Your proposal
must be **materially different** from every one of them; if the only opportunity
you can find is already covered here, that is a **skip**, not a duplicate.

{{EXISTING_PROPOSALS}}

# LIFECYCLE

### 1. Survey

Use the `Explore` sub-agent to walk the codebase organically and note where you
feel friction. Look for **shallow modules** (interface nearly as complex as the
implementation), concepts that force bouncing between many small modules, pure
functions extracted only for testability where the real bugs hide in how they're
called (no **locality**), and tightly-coupled modules leaking across a seam.

Apply the **deletion test** to anything you suspect is shallow: would deleting it
*concentrate* complexity, or just move it? A "concentrates" is the signal.

### 2. Pick the single best fresh opportunity

Choose the **one** opportunity with the most leverage that is **not** already an
open proposal above. Prefer one high-signal, load-bearing candidate over a list
of shallow ones. If nothing clears that bar this run — the codebase is clean, or
every candidate is already proposed — that is a valid, honest **skip**.

### 3. Write it up as a PRD

For the chosen opportunity, draft a PRD body a maintainer could hand straight to
`agent:to-issues`. Follow this repo's issue conventions — **Problem** (the
friction, in `/codebase-design` and `CONTEXT.md` vocabulary), **Solution** (the
deepening: what moves behind which interface, at which seam), and **Acceptance
criteria** (a checklist). Reference the modules and ADRs by name. Keep it scoped
to this one deepening — not a grab-bag.

# REPORTING

Reason in prose throughout — do **not** emit any JSON or `<output>` block yet. A
separate follow-up turn will ask you to emit the structured decision (the PRD, or
the skip reason).
