# TASK

Run a **codebase-level architecture review** of this repository at its current
`main` checkout, using **this repo's own `/improve-codebase-architecture`
skill**, and surface where the codebase has **drifted** from its recorded
decisions or has **deepening opportunities** worth acting on.

Use only the local skills defined in this repository
(`.claude/skills/improve-codebase-architecture/` and its companion
`.claude/skills/codebase-design/`). Do not use any external or third-party
architecture skill. This is a **read-only survey** — do **not** edit code, do
**not** commit, do **not** touch any `gh` or label state. Your entire job is to
find and describe; a later turn serialises what you find.

# CONTEXT

This is a scheduled/on-demand sweep of the **whole tree** on `main`, not a diff
review — there is no branch or PR under review. Orient yourself:

```
git log --oneline -20
git ls-files | sed -n '1,200p'
```

Read the domain model and every recorded decision first — the review holds the
codebase to *these*, so drift is measured against them:

- `CONTEXT.md` — the ubiquitous language. A term used in code to mean something
  the model doesn't say, or a documented rule the code no longer honours, is
  **drift**.
- `docs/adr/` — every ADR. Code that contradicts an accepted decision is
  **drift**; if a decision is genuinely obsolete, that's a finding too (the ADR,
  not the code, may be what's stale — say so).

Use the **`/codebase-design` vocabulary** exactly — *module*, *interface*,
*depth*, *seam*, *adapter*, *leverage*, *locality* — and the **`CONTEXT.md`
vocabulary** for the domain. Name real modules by their real names (if
`CONTEXT.md` defines "Stop", talk about "the Stop intake module", not "the
FooHandler").

# LIFECYCLE

### 1. Survey

Run the `/improve-codebase-architecture` skill over the tree. It surfaces
**deepening opportunities** — shallow modules whose interface exposes more than
it hides — and design smells. Cross that against `CONTEXT.md`/ADR drift.

### 2. Judge each candidate

For every candidate the survey turns up, decide whether it is a *real*,
*load-bearing* finding a maintainer would want to act on — not a stylistic
nitpick and not speculative. Prefer a few high-signal findings over a long list
of shallow ones. A clean sweep (no findings) is a valid and honest outcome —
don't invent problems to have something to report.

### 3. Locate and characterise each finding

For each finding you keep, pin down:

- **category** — `drift` (diverged from an ADR / `CONTEXT.md`), `deepening` (a
  shallow module that could hide more behind a smaller interface), `duplication`
  (the same knowledge repeated — a missing seam), `coupling` (modules entangled
  across what should be a clean seam), or `other`.
- **area** — where it lives: a repo-relative path (`apps/web/src/trail`), a
  module name, or the `CONTEXT.md` term / ADR id it drifts from.
- **why it matters** — the concrete friction it causes, and the direction a fix
  would take (not a full design — just the seam or deepening it points at).

# REPORTING

Reason in prose throughout — do **not** emit any JSON or `<output>` block yet. A
separate follow-up turn will ask you to emit the structured findings. If the
codebase is clean on an axis, say so — an axis with no findings is a valid
outcome.
