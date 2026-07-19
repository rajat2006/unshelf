# EMIT THE REVIEW FINDINGS

You have finished reviewing the branch. Now emit your findings as **exactly one**
`<output>` JSON block, as the last thing in your response. Do not review anything
further, do not re-run the skill, and do not change any files — only serialise the
findings you already have.

The block must match this shape:

<output>
{
  "summary": "one-line headline: total findings and the worst per axis",
  "findings": [
    {
      "axis": "standards",
      "severity": "high",
      "file": "apps/web/src/trail/geometry.ts",
      "line": 42,
      "title": "short imperative title",
      "detail": "what's wrong and how to fix it, in a sentence or two"
    }
  ]
}
</output>

Rules:

- `summary` — required, one line. Even for a clean review (e.g. `"No standards or
  spec findings; branch is clean."`).
- `findings` — an array. Use `[]` when the branch is clean; otherwise one entry
  per finding from **both** axes.
- `axis` — `"standards"` or `"spec"`.
- `severity` — one of `"blocking"`, `"high"`, `"medium"`, `"low"`, `"nit"`.
- `file` — the repo-relative path (e.g. `apps/web/src/trail/geometry.ts`).
- `line` — the **new-side** line number in the `origin/main...HEAD` diff, when the
  finding is about a specific added or changed line. **Omit `line` entirely** for a
  file- or change-level finding — never guess a number. Anchors are cross-checked
  against the real diff, and a line that isn't in the diff is dropped.
- `title` / `detail` — both required and non-empty.

Emit nothing after the closing `</output>` tag.
