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

# CHILD ISSUE SHAPE

Write each child the way this repo writes issues:

```
## Parent

#{{ISSUE_NUMBER}}

## What to build

<one or two paragraphs>

## Acceptance criteria

- [ ] <testable outcome>
- [ ] <testable outcome>

## Blocked by

- <sibling title, if any>
```

# OUTPUT

Once you have read everything and sliced the work, emit a single `<output>`
block as the **last thing** in your response:

<output>
{
  "summary": "One line: what the PRD was split into.",
  "children": [
    {
      "title": "Imperative, specific child title",
      "body": "## Parent\n\n#{{ISSUE_NUMBER}}\n\n## What to build\n\n...\n\n## Acceptance criteria\n\n- [ ] ...\n"
    }
  ]
}
</output>

- `title` — a single line under 256 characters, imperative and specific.
- `body` — Markdown following the shape above; it **must** reference the parent
  as `#{{ISSUE_NUMBER}}` so a reader can trace it back (the workflow also links
  it as a real sub-issue).
- `children` — at least one; each a distinct, agent-sized slice of the PRD.
