# EMIT THE ARCHITECTURE-REVIEW FINDINGS

You have finished surveying the codebase. Now emit your findings as **exactly
one** `<output>` JSON block, as the last thing in your response. Do not review or
change anything further — only serialise the findings you already have.

The block must match this shape:

<output>
{
  "summary": "one-line headline: total findings and the worst by severity/category",
  "findings": [
    {
      "category": "drift",
      "severity": "high",
      "area": "apps/web/src/trail",
      "title": "short imperative title",
      "detail": "the concrete friction it causes and the direction a fix would take (the seam or deepening it points at)"
    }
  ]
}
</output>

Rules:

- `summary` — required, one line. Even for a clean sweep (e.g. `"No
  architectural drift or deepening opportunities found."`).
- `findings` — an array. Use `[]` when the codebase is clean; otherwise one entry
  per finding you decided to keep.
- `category` — one of `"drift"`, `"deepening"`, `"duplication"`, `"coupling"`,
  `"other"`.
- `severity` — one of `"high"`, `"medium"`, `"low"`.
- `area` — where it lives: a repo-relative path (`apps/web/src/trail`), a module
  name, or the `CONTEXT.md` term / ADR id it drifts from. Not a `file:line`
  anchor — these are codebase-level findings.
- `title` / `detail` — both required and non-empty.

Emit nothing after the closing `</output>` tag.
