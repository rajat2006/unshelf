# EMIT THE ARCHITECTURE-REVIEW DECISION

You have finished surveying the codebase. Now emit your decision as **exactly
one** `<output>` JSON block, as the last thing in your response. Do not survey or
change anything further — only serialise the decision you already reached.

The block must match **one** of these two shapes.

**Proposed** — you found one fresh deepening opportunity and wrote it up:

<output>
{
  "outcome": "proposed",
  "summary": "one-line headline of the deepening you are proposing",
  "prdTitle": "PRD title — imperative, ≤256 chars, names the module and the deepening",
  "prdBody": "The full PRD as Markdown: ## Problem / ## Solution / ## Acceptance criteria, in /codebase-design and CONTEXT.md vocabulary, referencing modules and ADRs by name."
}
</output>

**Skipped** — nothing fresh worth proposing this run:

<output>
{
  "outcome": "skipped",
  "summary": "one-line headline of why you are skipping",
  "reason": "why nothing was proposed — the codebase is clean on this axis, or every candidate is already an open proposal"
}
</output>

Rules:

- `outcome` — `"proposed"` or `"skipped"`.
- `summary` — required in both, one line.
- `prdTitle` / `prdBody` — **both required for `proposed`**, and **omitted for
  `skipped`**. `prdTitle` ≤ 256 chars.
- `reason` — **required for `skipped`**.
- Propose **at most one** opportunity — one PRD per run. Never bundle several.
- Emit nothing after the closing `</output>` tag.
