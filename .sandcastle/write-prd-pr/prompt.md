# TASK

Write the title and description for a pull request that lands PRD issue
#{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}.

This PRD is a parent that owns a set of sub-issues, and the whole spec has
already been implemented — the commits sit on branch `{{BRANCH}}`. You are
**not** implementing anything and **not** running tests. You are summarising work
that already exists.

# CONTEXT

Read the PRD and enumerate its sub-issues:

```
gh issue view {{ISSUE_NUMBER}} --comments
gh api "repos/$GH_REPO/issues/{{ISSUE_NUMBER}}/sub_issues" --jq '.[].number'
```

Read what changed on the branch:

```
git log main..{{BRANCH}} --reverse
git diff main..{{BRANCH}} --stat
git diff main..{{BRANCH}}
```

If the diff is large, lean on the commit messages and the `--stat` summary; only
`git diff` a specific file when a commit message is unclear.

Draft the title and description from what you read. Frame the description around
the PRD as a whole, and note which sub-issues the change satisfies.

# OUTPUT

Once you have read everything, emit a single `<output>` block as the **last
thing** in your response:

<output>
{
  "prTitle": "feat: short imperative summary of the PRD",
  "prDescription": "## Summary\n\n- what the PRD delivers, in a few bullets\n\n## Sub-issues landed\n\n- #<n> — one line each\n\n## Notes for the reviewer\n\n- anything worth flagging\n\nCloses #{{ISSUE_NUMBER}}\nCloses #<each sub-issue>"
}
</output>

- `prTitle` — a single line, conventional-commit style (`feat:`, `fix:`,
  `refactor:`, `test:`, `docs:`), under 70 characters.
- `prDescription` — Markdown. It **must** contain `Closes #{{ISSUE_NUMBER}}` so
  the PR closes the PRD on merge, and it should carry a `Closes #<n>` line for
  **each** sub-issue the branch fully implements, so those close on merge too.
  Only list a sub-issue's `Closes` line if the branch actually satisfies it.
