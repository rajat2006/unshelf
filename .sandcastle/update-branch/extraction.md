# EMIT THE UPDATE SUMMARY

You have finished merging `main` into the branch, resolved any conflicts,
validated the tree, and committed the merge (or confirmed the branch was already
current). Now emit that outcome as **exactly one** `<output>` JSON block, as the
last thing in your response. Do not merge or change anything further — only
serialise what already happened.

The block must match this shape:

<output>
{
  "summary": "one-line headline: merged main / already current, and how many conflicts were resolved",
  "alreadyCurrent": false,
  "conflicts": [
    {
      "file": "apps/web/src/trail/geometry.ts",
      "resolution": "how you reconciled the two sides — which side won, or how they were combined"
    }
  ]
}
</output>

Rules:

- `summary` — required, one line. E.g. `"Merged main into the branch, resolving
  2 conflicts."` or `"Branch was already current with main; nothing to do."`
- `alreadyCurrent` — `true` **only** if `git merge origin/main` reported `Already
  up to date` and you made no commit; otherwise `false`.
- `conflicts` — an array with one entry per file you resolved a conflict in. Use
  `[]` for a clean merge (or an already-current branch). When `alreadyCurrent` is
  `true`, `conflicts` **must** be `[]` — an already-current branch merged nothing,
  so nothing could have conflicted.
- `file` — the repo-relative path of the conflicted file (e.g.
  `apps/web/src/trail/geometry.ts`).
- `resolution` — a one-line prose note on how you reconciled that file. Both
  `file` and `resolution` are required and non-empty.

Emit nothing after the closing `</output>` tag.
