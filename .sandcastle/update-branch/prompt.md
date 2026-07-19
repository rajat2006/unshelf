# TASK

Bring branch `{{BRANCH}}` — the branch for issue #{{ISSUE_NUMBER}}:
{{ISSUE_TITLE}} — current with `main` by **merging `origin/main` into it** and
resolving any conflicts. The branch is stale or conflicts with its base; your job
is to make it merge cleanly again without losing either side's intent.

# CONTEXT

You are already on branch `{{BRANCH}}`, and `origin/main` has been fetched, so
the base to merge in is:

```
origin/main
```

See what the branch adds over its base, and how far it has drifted:

```
git log origin/main..HEAD --oneline
git log HEAD..origin/main --oneline
git diff origin/main...HEAD --stat
```

Read the originating issue so a conflict resolution honours what the branch is
trying to do:

```
gh issue view {{ISSUE_NUMBER}} --comments
```

Also read `CONTEXT.md` and any relevant `docs/adr/` when a conflict touches a
domain rule — a resolution must not silently contradict a decision recorded
there.

# LIFECYCLE

Work in this order:

### 1. Merge main in

```
git merge origin/main
```

**Merge — do not rebase.** The workflow pushes your branch with a plain
(non-force) push, so history must only ever grow: a rebase that rewrites the
branch's existing commits would be rejected on push. If `git merge` reports
`Already up to date`, the branch is already current — make no commit and skip to
reporting (`alreadyCurrent`).

### 2. Resolve every conflict

For each conflicted file, reconcile the two sides so **both** the branch's change
and main's change are preserved wherever they don't genuinely contradict. When
they do contradict, keep the branch's intent (that is the work under review) but
carry over any mechanical change from main it depends on (a rename, a moved
import, a changed signature). Never resolve a conflict by blindly discarding one
side, and never leave conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in a
file.

If a conflict needs a product decision you cannot make safely, **stop** — abort
the merge (`git merge --abort`) and explain why in your final message rather than
committing a guessed resolution. Leaving the branch unmerged is the correct
signal for "a human needs to look at this"; the workflow will mark the PR
blocked.

### 3. Validate

Run the repo's checks and make sure the merged tree still builds and passes:

```
turbo run typecheck
turbo run test
```

If the merge left the build broken and you cannot fix it cleanly and in scope,
abort the merge and stop (as above) — do not commit a broken merge.

### 4. Commit the merge

Complete the merge commit (`git commit` with the default merge message is fine,
or `git commit -m "Merge main into {{BRANCH}}"`). If you had to hand-edit files
to resolve conflicts, `git add` them first.

**Commit only — do not push, do not force, do not rebase, and do not touch PR
labels, comments, or `gh` state.** The workflow pushes your branch and posts the
summary; your job is the merge commit and the report.

# REPORTING

Reason in prose throughout — do **not** emit any JSON or `<output>` block yet. A
separate follow-up turn will ask you to emit the structured summary: whether the
branch was already current, and one entry per conflict you resolved (the file and
how you reconciled it).
