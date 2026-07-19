# TASK

Review the changes on branch `{{BRANCH}}` — the branch implementing issue
#{{ISSUE_NUMBER}}: {{ISSUE_TITLE}} — using **this repo's own `/code-review`
skill**. You are reviewing work that already exists; you are **not** implementing
anything, **not** running tests, and **not** committing or pushing.

Do not use any external or third-party review skill. Use only the local
`/code-review` skill defined in this repository (`.claude/skills/code-review/`).

# CONTEXT

The fixed point for the review is the mainline the branch was cut from:

```
origin/main
```

So the diff under review is:

```
git diff origin/main...HEAD
git log origin/main..HEAD --oneline
```

(Three-dot diff, against the merge-base — the same form `/code-review` expects.)

The originating spec is issue #{{ISSUE_NUMBER}}. Read it, and follow any spec
references in the commit messages:

```
gh issue view {{ISSUE_NUMBER}} --comments
```

Also read `CONTEXT.md` and any relevant `docs/adr/` for the domain rules the
Standards axis should hold the change to.

# HOW TO REVIEW

Run the `/code-review` skill with `origin/main` as the fixed point. It reviews
along both axes in parallel sub-agents and reports them separately:

- **Standards** — does the code follow this repo's documented coding standards
  (plus the skill's smell baseline)?
- **Spec** — does the change faithfully implement issue #{{ISSUE_NUMBER}}: are any
  requirements missing or partial, is there scope creep, is anything implemented
  but wrong?

Work through the whole diff. For every finding, note the axis, a severity
(`blocking`, `high`, `medium`, `low`, or `nit`), the repo-relative file path,
and — where the finding is about a specific added or changed line — that
new-side line number as it appears in the diff. Reason in prose; do **not** emit
any JSON or `<output>` block yet. A separate follow-up turn will ask you to emit
the structured findings.

If the change is clean on an axis, say so — an axis with no findings is a valid
outcome.
