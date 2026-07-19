# TASK

Decompose the PRD issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}} into agent-sized
child issues.

You are **not** implementing anything and **not** creating any issues — the
workflow creates the child issues from the output you emit. Your job is to read
the PRD and produce a clean decomposition.

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

- Each child is one **agent-sized** unit of work: a single coherent change one
  agent can implement, review, and land as one PR. Not a whole subsystem, not a
  one-line tweak.
- Order matters: foundational work (scaffolding, shared seams, schemas) comes
  before the pieces that build on it. When a child depends on another, say so in
  its body under a `## Blocked by` heading referencing the sibling by its title
  (the numbers don't exist yet).
- Cover the PRD's acceptance criteria across the children with **no gaps and no
  overlap** — every requirement lands in exactly one child.
- Prefer fewer, well-scoped children over many thin ones.

# CHILD ISSUE FIELDS

You emit **structured fields per child, not a rendered issue body**. The runner
deterministically renders the `## Parent` back-reference, the `## What to build`
section, and the `## Acceptance criteria` checklist from your fields — so supply
the content, not the Markdown scaffolding:

- `whatToBuild` — one or two paragraphs describing the change. Plain prose; no
  headings.
- `acceptanceCriteria` — a list of testable outcomes, each a single line with no
  leading `- [ ]` (the runner adds the checkbox). At least one.
- `blockedBy` — optional list of sibling child **titles** this one depends on
  (the sibling issue numbers don't exist yet). Omit it when there are no
  dependencies.

# OUTPUT

Once you have read everything and sliced the work, emit a single `<output>`
block as the **last thing** in your response:

<output>
{
  "summary": "One line: what the PRD was split into.",
  "children": [
    {
      "title": "Imperative, specific child title",
      "whatToBuild": "One or two paragraphs describing the change.",
      "acceptanceCriteria": [
        "A testable outcome",
        "Another testable outcome"
      ],
      "blockedBy": ["Title of a sibling this depends on"]
    }
  ]
}
</output>

- `title` — a single line under 256 characters, imperative and specific.
- `children` — at least one; each a distinct, agent-sized slice of the PRD.
- Do **not** pre-render Markdown or a parent reference into any field — the
  runner owns the issue body's shape.
