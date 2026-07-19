# TASK

Decompose the PRD issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}} into agent-sized
child issues.

You are **not** implementing anything and **not** creating any issues — the
workflow creates the child issues from the output you emit. Your job is to read
the PRD and produce a clean decomposition.

This run is **non-interactive**: there is no one to ask. Resolve any ambiguity in
the PRD with a reasonable interpretation and proceed — never block for a
clarification.

# CONTEXT

Read the PRD in full, including comments and any parent it references:

```
gh issue view {{ISSUE_NUMBER}} --comments
```

Read `CONTEXT.md` and the relevant ADRs under `docs/adr/` — they carry the
domain model and the decisions the child issues must not contradict. Then
explore the parts of the repo the PRD touches, enough to slice the work
sensibly. Look at how existing issues in this repo are written (`gh issue list`,
`gh issue view <n>`) so your children match the house style.

# HOW TO SLICE

Slice into **vertical tracer bullets**, not horizontal layers:

- **Vertical, end-to-end slices.** Each child cuts through every layer it needs
  to deliver one thin, working piece of user- or system-visible behaviour — never
  a horizontal "build all the scaffolding / schemas / plumbing" ticket that
  produces nothing observable on its own. A foundational-only slice is the
  anti-pattern; fold the scaffolding a slice needs into that slice.
- **Independently verifiable and flat.** Each child must be implementable,
  testable, and landable **on its own**, with a flat scope (no sub-tasks, no
  nested phases). If it can't be verified without another child's code, it isn't
  sliced right — merge or re-cut.
- **Order is the dependency signal.** Emit the children in the order they should
  be built: earlier children land first, later ones may build on them. There is
  **no dependency field** — the list order carries it, so put a child after
  everything it relies on.
- **Every child carries a testing acceptance criterion.** At least one entry in
  each child's `acceptanceCriteria` must be about how the slice is *verified* —
  the test, check, or observable behaviour that proves it works (e.g. "a unit
  test covers X", "`turbo run test` passes with the new case").
- Cover the PRD's acceptance criteria across the children with **no gaps and no
  overlap** — every requirement lands in exactly one child.

# CHILD ISSUE FIELDS

You emit **structured fields per child, not a rendered issue body**. The runner
deterministically renders the `## Parent` back-reference, the `## What to build`
section, and the `## Acceptance criteria` checklist from your fields — so supply
the content, not the Markdown scaffolding:

- `whatToBuild` — one or two paragraphs describing the vertical slice in terms of
  behaviour and intent. Plain prose; no headings. **Do not include file paths or
  code snippets** — name the behaviour and let the implementing agent choose the
  files and code.
- `acceptanceCriteria` — a list of testable outcomes, each a single line with no
  leading `- [ ]` (the runner adds the checkbox). At least one, and at least one
  of them must be the slice's **testing/verification** criterion.

# OUTPUT

Once you have read everything and sliced the work, emit a single `<output>`
block as the **last thing** in your response, with `children` **in build order**:

<output>
{
  "summary": "One line: what the PRD was split into.",
  "children": [
    {
      "title": "Imperative, specific child title",
      "whatToBuild": "One or two paragraphs describing the vertical slice.",
      "acceptanceCriteria": [
        "A testable outcome",
        "A unit test covers the new behaviour"
      ]
    }
  ]
}
</output>

- `title` — a single line under 256 characters, imperative and specific. It is an
  **issue** title, not a commit message: **no** conventional-commit prefix
  (`feat:`, `fix:`, `refactor:`, `docs:`, …).
- `children` — at least one; each an independently verifiable, vertical slice of
  the PRD, ordered so dependencies come first.
- Do **not** pre-render Markdown or a parent reference into any field, do **not**
  add a dependency field — the runner owns the body shape and the list order is
  the dependency signal — and do **not** add a `Closes #…` (or `Fixes`/`Resolves`)
  directive anywhere: these are child issues, not PRs.
