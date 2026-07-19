# TASK

Implement PRD issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

This is a **PRD-shaped issue** — a parent that owns a set of sub-issues. Your job
is to land the whole PRD as one coherent change on branch `{{BRANCH}}` (already
cut from `main`), not to pick off a single ticket.

Pull the PRD in full, then enumerate and read every sub-issue it owns:

```
gh issue view {{ISSUE_NUMBER}} --comments
gh api "repos/$GH_REPO/issues/{{ISSUE_NUMBER}}/sub_issues" --jq '.[].number'
```

For each number the second command prints, read that sub-issue in full
(`gh issue view <N> --comments`). Together the PRD body and its sub-issues are
the spec you implement — treat each sub-issue as an acceptance criterion the
change must satisfy.

# CONTEXT

Before writing any code, read `CONTEXT.md` and the relevant ADRs under
`docs/adr/` — they carry the domain model and the decisions you must not
contradict. Then explore the parts of the repo this PRD touches, especially the
test files around the code you will change.

# EXECUTION

Drive the repo's own skills — do not improvise a workflow:

- Follow the **`/implement`** skill (`.agents/skills/implement/SKILL.md`) to work
  the PRD.
- Follow **`/tdd`** (`.agents/skills/tdd/SKILL.md`) at every seam it calls for:
  write a failing test, make it pass, repeat, then refactor.

Work the sub-issues in a sensible dependency order and keep each commit focused,
so the single PR reads as a reviewable progression rather than one opaque blob.

Validate before you commit — both run through turbo:

```
pnpm run typecheck
pnpm run test
```

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional-commit messages
(`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).

**Commit only.** Do not push, do not open a PR, and do not edit labels or the
issue — the workflow owns every git, `gh`, and label mutation. Do **not** close
the PRD or any sub-issue.

If you cannot complete the whole PRD — it is ambiguous, blocked on a decision, or
some sub-issue needs a human — stop and explain why in your final message instead
of committing a half-finished change. Leaving the branch with no commits is the
correct signal for "a human needs to look at this"; the workflow will mark the
PRD blocked.
