# EMIT THE ADDRESSED-COMMENTS RECORD

You have finished addressing the PR's review comments, made and committed the
changes you could, and re-checked. Now emit your record as **exactly one**
`<output>` JSON block, as the last thing in your response. Do not change anything
further — only serialise what you already did.

The block must match this shape:

<output>
{
  "summary": "one-line headline: how many comments, how many addressed vs deferred",
  "items": [
    {
      "comment": "short gist of the reviewer's point (not the full quote)",
      "status": "addressed",
      "file": "apps/web/src/trail/geometry.ts",
      "action": "what you changed to satisfy it; for deferred, why you left it"
    }
  ]
}
</output>

Rules:

- `summary` — required, one line. Even when there was nothing to do (e.g. `"No
  actionable review comments on the PR."`).
- `items` — an array with one entry per review comment you considered, including
  the ones you deferred. Use `[]` only if the PR truly had no actionable comments.
- `comment` — required, non-empty: a short gist of the reviewer's ask.
- `status` — `"addressed"` if you edited the code and committed a change for it,
  or `"deferred"` if you left it for a human. Be honest: only mark `addressed`
  what you actually committed.
- `file` — the repo-relative path the comment is about (e.g.
  `apps/web/src/trail/geometry.ts`). **Omit `file` entirely** for a PR-level
  comment that isn't tied to one path.
- `action` — required, non-empty: what you changed (for `addressed`) or why you
  deferred it (for `deferred`).

Emit nothing after the closing `</output>` tag.
