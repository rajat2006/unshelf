# TASK

You are implementing **one sub-issue** of a multi-run PRD.

- **PRD:** #{{PRD_NUMBER}} — {{PRD_TITLE}}
- **This sub-issue:** #{{SUB_ISSUE_NUMBER}} — {{SUB_ISSUE_TITLE}}
- **Branch:** `{{BRANCH}}`

The branch may already carry commits from earlier sub-issues. Do **not** rebase
or rewrite that history — add your work on top.

Pull both issues in for context:

```
gh issue view {{PRD_NUMBER}} --comments
gh issue view {{SUB_ISSUE_NUMBER}} --comments
```

You also have the full list of sibling sub-issues, to understand what has already
shipped on this branch and what is still ahead:

```
gh api "repos/$GH_REPO/issues/{{PRD_NUMBER}}/sub_issues"
```

Your implementation of #{{SUB_ISSUE_NUMBER}} must fit the larger PRD plan — but
**only implement #{{SUB_ISSUE_NUMBER}}** in this run. Do not do work that belongs
to a different sub-issue.

# CONTEXT

Before writing any code, read `CONTEXT.md` and the relevant ADRs under
`docs/adr/` — they carry the domain model and the decisions you must not
contradict. Then explore the parts of the repo this sub-issue touches, especially
the test files around the code you will change.

# EXECUTION

Drive the repo's own skills — do not improvise a workflow:

- Follow the **`/implement`** skill (`.agents/skills/implement/SKILL.md`) to work
  the sub-issue.
- Follow **`/tdd`** (`.agents/skills/tdd/SKILL.md`) at every seam it calls for:
  write a failing test, make it pass, repeat, then refactor.

Validate before you commit — both run through turbo:

```
turbo run typecheck
turbo run test
```

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional-commit messages
(`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Include `Part of #{{PRD_NUMBER}}`
in each commit body so the history is linkable from the PRD. Do **not** put
`Closes` in a commit message — closing the sub-issue is the workflow's job, and
closing the PRD is the merged PR's job.

**Commit only.** Do not push, do not open a PR, and do not edit labels, close the
sub-issue, or close the PRD — the workflow owns every git, `gh`, and label
mutation.

If you cannot complete this sub-issue — it is ambiguous, blocked on a decision,
or needs a human — stop and explain why in your final message instead of
committing a half-finished change. Leaving no commits is the correct signal for
"a human needs to look at this"; the workflow will mark the PRD blocked at this
sub-issue.
