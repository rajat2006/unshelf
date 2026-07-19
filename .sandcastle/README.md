# `.sandcastle/` — autonomous-agent runner seam

Dev infrastructure, **not a product workspace** (distinct from the reserved
`apps/agent` slot in ADR-0009). This is the foundation for running coding agents
autonomously in GitHub Actions via [Sandcastle](https://github.com/mattpocock/sandcastle);
see spec **#52**. It joins the pnpm workspace and turbo graph as its own project,
so `turbo run test` / `turbo run typecheck` cover it.

## The testable seam

The control flow around `sandcastle.run()`, extracted so it is unit-testable by
mocking `run()` — no database, no network, no real agent. Ported from
course-video-manager's runner (the Sandcastle reference), reconciled to the
pinned Sandcastle version and Unshelf's provider set:

- **`run-with-retry.ts`** — `runWithRetry`: a single call that both does the work
  and emits structured `output`, retrying the *same session* on a
  `StructuredOutputError` (up to 3 attempts). For **side-effect-free** capabilities
  where the output *is* the work (`write-pr`, `to-issues-prd`).
- **`run-with-extraction.ts`** — `runWithExtraction`: the **two-phase** wrapper —
  a *produce* run with no `output` (keeps the resumable `sessionId`, never throws
  on extraction), then a resumed *extract* pass via `runWithRetry`. Returns the
  produce run's commits with the extraction's output, so side effects (commits,
  issue creation) are never repeated. For capabilities with a side-effectful
  produce phase (`review`, `implement-pr`, `update-branch`, `architecture-review`).
- **`retry-feedback.ts`** — `buildRetryFeedback`: the retry prompt built from a
  `StructuredOutputError`, echoing what the agent emitted and why it failed.
- **`resolve-agent.ts`** — `resolveAgent(labels)` (Unshelf-specific): `agent:codex`
  present ⇒ Codex on `gpt-5.6-sol`; absent ⇒ Claude Code on `claude-opus-4-8`
  (absence *is* Claude). Reads the issue's full label set.
- **`review-output.ts`** — `reviewOutputSchema` (Zod): the `review` capability's
  `<output>` contract — a `summary` plus `findings[]` (each `axis` ∈
  standards/spec, `severity`, `status` ∈ fixed/unresolved, `file`, optional
  `line`, `title`, `detail`). The extraction wrapper validates the emitted block
  against it, so a malformed block self-corrects via same-session retry before
  anything is posted.
- **`parse-diff-lines.ts`** — `parseDiffLines(diff)`: pure unified-diff parser
  returning the new-side line numbers each file adds/changes. The `review`
  capability uses it to anchor unresolved findings to real changed lines when
  building the inline PR-review comments, so a comment can't point at a line the
  change never touched — and so the reviews API (which 422s the whole review on a
  single off-diff anchor) is never handed a bad line.
- **`prepare-codex-auth.ts`** — `prepareCodexAuth(providerName)` (Unshelf-specific):
  the runner-side half of the Codex path. When the resolved provider is Codex it
  seeds `CODEX_AUTH_JSON` → `$CODEX_HOME/auth.json` **only if that file is absent**
  (Codex refreshes the tokens in place mid-run, so a later phase must not clobber
  them), forces `cli_auth_credentials_store = "file"` in `config.toml` (the OS
  keyring is unreachable in CI), and strips `OPENAI_KEY`/`OPENAI_API_KEY` so Codex
  uses the `gpt-5.6-sol` subscription seat, not the metered API. A no-op for the
  Claude default. Every capability calls it immediately before `run()`, so the
  setup is uniform across phases. (The seeded secret needs a periodic re-paste —
  Codex's refresh token is single-use; see `docs/agents/sandcastle.md`.)
- **`require-env.ts`** — `requireEnv(name)`: read a required env var or throw a
  named error. The capability scripts run under a fixed workflow-supplied env; a
  missing var is a wiring bug, so failing fast lands the issue in `agent:blocked`.
- **`capability-context.ts`** — `loadCapabilityContext()`: the one reader of the
  env contract every `agent-*.yml` sets (issue coordinates, output dir, and the
  provider resolved from the full label set). Returns the `promptArgs` ready to
  spread into `run()`.

Later workflow tickets add each capability as a thin `run()` script + YAML on top
of these helpers.

## Capabilities

Each capability is a self-contained directory — a `run()` script + its `prompt.md`
— driven by one `.github/workflows/agent-*.yml`. The workflow owns every git,
`gh`, and label mutation; the script only produces commits and/or output files.

- **`implement/`** — the core spine (workflow `agent-implement.yml`). Calls
  `run()` directly (no structured output — the *work is the commits*), guards on a
  non-zero commit count, and relies on the built-in `idleTimeoutSeconds` watchdog
  inside the workflow's 60-min job timeout. Provider resolved from the full label
  set via `resolveAgent`.
- **`write-pr/`** — authors the draft PR's title + body via `runWithRetry`
  (structured output *is* the work), writing flat text files the workflow feeds to
  `gh pr create --body-file`. Runs after the branch is pushed; reads and
  summarises, never commits.
- **`implement-prd/`** — the PRD variant of the spine (workflow
  `agent-implement-prd.yml`), mirroring CVM's incremental lifecycle. Implements
  **one** sub-issue per run: the workflow resumes the accumulating PRD branch and
  passes the first still-open sub-issue (`SUB_ISSUE_NUMBER`) via the label-derived
  provider seam (`resolveAgent` + `prepareCodexAuth`). Like `implement/` it calls
  `run()` directly (the *work is the commits*) with the same idle watchdog — but
  it has **no commit-count guard**: a sub-issue already satisfied by an earlier
  run legitimately produces zero new commits, and the workflow must still close it
  and advance. The prompt reads the whole PRD for context but changes only the one
  sub-issue.
- **`write-prd-pr/`** — the PRD variant of `write-pr/`, run **only when opening
  the PR** (the first sub-issue run; later runs reuse the PR). Same `runWithRetry`
  single-prompt shape and label-derived provider, but frames the body around the
  **whole PRD** and schema-enforces a single `Closes #<PRD>` line — sub-issues are
  closed by the workflow per-run, not by the PR body.
- **`review/`** — drives the repo's **local `/code-review`** over the PR branch
  (workflow `agent-review.yml`) via `runWithExtraction`. The produce pass reviews
  along both axes, **fixes what it safely can and commits** the fixes, and
  re-reviews; the resumed extraction pass emits the findings as one `<output>`
  block (`extraction.md`), each marked `fixed` or `unresolved`, validated against
  `reviewOutputSchema` with same-session retry. Per invariant H the runner only
  commits + writes files: fix commits land on the branch (the workflow pushes
  them) and a ready-to-POST GitHub *reviews* payload (`review_payload.json` — a
  summary body plus inline comments for unresolved findings, anchored to the diff
  via `parseDiffLines`) goes to `OUTPUT_DIR`. The workflow pushes, posts the
  review, then `gh pr ready`. Uses no external skills registry.

## Pinned version

`@ai-hero/sandcastle` is pinned to **0.12.0** (current latest), reconciling the
0.12-vs-`^0.10` drift the spec flagged. The helpers rely on `run()`'s structured
`output` + `StructuredOutputError.sessionId` resume path, verified against 0.12.0's
type definitions. Two 0.12 behaviours the wrappers depend on:

- `run()` rejects an inline `prompt` alongside any `promptArgs`
  (`validateNoArgsWithInlinePrompt`), so both wrappers drop `promptArgs` (and
  `promptFile`) when switching to an inline retry/extraction prompt.
- `StructuredOutputError` carries `sessionId`/`rawMatched`/`cause`, which is what
  makes same-session resume-with-feedback possible.

Models follow spec §C (`claude-opus-4-8`, not CVM's `claude-opus-4-6`).
