# TASK

Address the **review comments** on pull request #{{PR_NUMBER}} — the PR on branch
`{{BRANCH}}` implementing issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}. Change what you
safely can to satisfy each comment, run the repo's checks, and commit your fixes.

# CONTEXT

Read the review threads first — that is the work list:

```
gh pr view {{PR_NUMBER}} --comments
gh api repos/{owner}/{repo}/pulls/{{PR_NUMBER}}/comments   # inline review comments (file + line)
gh api repos/{owner}/{repo}/pulls/{{PR_NUMBER}}/reviews    # review summaries + state
```

(`gh api` expands the `{owner}`/`{repo}` placeholders from the current clone's
remote — run those commands verbatim.)

The branch was cut from `origin/main`, so the change under review is:

```
git diff origin/main...HEAD
git log origin/main..HEAD --oneline
```

Read the originating spec and any references in the commit messages, so a fix
lands in line with what the issue actually asked for:

```
gh issue view {{ISSUE_NUMBER}} --comments
```

Also read `CONTEXT.md` and any relevant `docs/adr/` for the domain rules a fix
must respect.

# LIFECYCLE

Work in this order:

### 1. Collect the comments

Gather every actionable review comment — inline (file + line) and top-level.
Ignore resolved/outdated threads and pure approvals. For each, decide the
reviewer's actual ask.

### 2. Address what you safely can

For each comment, decide: can you satisfy it correctly and in scope, right now,
without guessing at intent? If yes, **edit the code and fix it**. If it is risky,
ambiguous, needs a product decision, contradicts another comment, or you disagree
on technical grounds, **defer it for a human** — do not force a speculative or
argumentative change.

Keep each change tight and on-topic for the comment it answers. Run the repo's
checks on what you touch:

```
turbo run typecheck
turbo run test
```

Do not break the build. If a fix would fail typecheck/test and you can't make it
pass cleanly, revert that fix and defer the comment instead.

### 3. Commit your changes

Commit the fixes in focused commits with clear messages (e.g.
`Address review: extract duplicated distance calc`). **Commit only — do not push,
do not touch PR labels, comments, review threads, or `gh` state.** The workflow
pushes your commits and posts a summary; your job is the commits and the report.

If you addressed nothing (every comment was deferred), make no commits — that is a
valid outcome, and the summary will explain why.

### 4. Re-check

Re-diff after your commits and confirm your changes actually resolve the comments
they targeted and introduce nothing new:

```
git diff origin/main...HEAD
```

# REPORTING

Reason in prose throughout — do **not** emit any JSON or `<output>` block yet. A
separate follow-up turn will ask you to emit the structured record, where each
comment is marked either `addressed` (you edited + committed a change for it) or
`deferred` (left for a human). Be honest: only mark `addressed` what you actually
committed.
