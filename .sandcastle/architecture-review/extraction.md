# EMIT THE ARCHITECTURE-REVIEW DECISION

You have finished surveying the codebase. Now emit your decision as **exactly
one** `<output>` JSON block, as the last thing in your response. Do not survey or
change anything further — only serialise the decision you already reached.

The block must match **one** of these two shapes exactly — no extra fields.

**Proposed** — you found one fresh deepening opportunity and wrote it up:

<output>
{
  "status": "proposed",
  "oneLineSummary": "one-line headline of the deepening you are proposing",
  "title": "PRD title — imperative, ≤256 chars, names the module and the deepening",
  "body": "The full PRD as Markdown, with ALL of these sections in order: ## Problem Statement / ## Solution / ## User Stories / ## Implementation Decisions / ## Testing Decisions / ## Out of Scope / ## Further Notes. Use /codebase-design and CONTEXT.md vocabulary; reference modules and ADRs by name.",
  "candidatesConsidered": ["short label of each deepening candidate you seriously weighed, including the one you chose"]
}
</output>

**Skipped** — nothing fresh worth proposing this run:

<output>
{
  "status": "skipped",
  "oneLineSummary": "one-line reason nothing was proposed (clean on this axis, or every candidate already proposed)",
  "candidatesConsidered": ["short label of each candidate you weighed and rejected (may be empty if none surfaced)"]
}
</output>

Rules:

- `status` — `"proposed"` or `"skipped"`.
- `oneLineSummary` — required in both, one line.
- `title` / `body` — **both required for `proposed`**, and **must NOT appear for
  `skipped`** (the block is validated as a strict discriminated union — a stray
  field is rejected). `title` ≤ 256 chars. `body` must contain all seven sections.
- `candidatesConsidered` — required in both, an array of short strings (may be
  `[]` only when a clean sweep surfaced no candidate at all).
- Propose **at most one** opportunity — one PRD per run. Never bundle several.
- Emit nothing after the closing `</output>` tag.
