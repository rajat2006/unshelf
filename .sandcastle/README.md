# `.sandcastle/` — autonomous-agent runner seam

Dev infrastructure, **not a product workspace** (distinct from the reserved
`apps/agent` slot in ADR-0009). This is the foundation for running coding agents
autonomously in GitHub Actions via [Sandcastle](https://github.com/mattpocock/sandcastle);
see spec **#52**. It joins the pnpm workspace and turbo graph as its own project,
so `turbo run test` / `turbo run typecheck` cover it.

## The testable seam (`lib/`)

The control flow at the `sandcastle.run()` boundary, extracted as pure functions
so it is unit-testable with an injected fake `run()` — no database, no network,
no real agent (style: `apps/web/src/trail/geometry.test.ts`):

- **`resolve-agent.ts`** — `resolveAgent(labels)`: `agent:codex` present ⇒ Codex on
  `gpt-5.6-sol`; absent ⇒ Claude Code on `claude-opus-4-8` (absence *is* Claude).
- **`run-with-retry.ts`** — `runWithRetry`: the generic resume-on-error loop
  (one attempt + up to two resumes = `MAX_ATTEMPTS` of 3).
- **`retry-feedback.ts`** — `retryFeedback`: the token-efficient resume prompt
  built from a `StructuredOutputError`.
- **`run-with-extraction.ts`** — `runWithExtraction`: structured-output capabilities
  with same-session retry — on a `StructuredOutputError` that carries a resumable
  `sessionId`, resume with feedback and re-extract, up to 3×, else surface the failure.

Later workflow tickets add each capability as a thin `run()` script + YAML on top
of this seam.

## Pinned version

`@ai-hero/sandcastle` is pinned to **0.12.0** (current latest), reconciling the
0.12 vs `^0.10` drift the spec flagged. The `run()` option shapes were verified
against 0.12.0's type definitions: `RunOptions` (`agent`, `sandbox`, `promptFile`,
`promptArgs`, `logging`, `maxIterations`, `resumeSession`, `output`), `Output.object`
/ `Output.string`, and `StructuredOutputError` (`.sessionId`, `.tag`, `.rawMatched`,
`.commits`, `.branch`) — the resume-with-feedback recovery this seam implements is
the pattern documented on that class. Models follow spec §C (`claude-opus-4-8`,
not CVM's `claude-opus-4-6`).
