# Sandcastle in course-video-manager — a container-free AFK-agent inventory

**What this is.** A primary-source inventory of how `mattpocock/course-video-manager` (CVM)
runs the [Sandcastle](https://github.com/mattpocock/sandcastle) agent runner autonomously in
GitHub Actions **without any Docker/Podman container — the GitHub runner itself is the
sandbox** — and what an "unshelf" repo would copy. Everything below traces to files read in
two shallow clones:

- **Sandcastle library** — `github.com/mattpocock/sandcastle` @ `e99f832f26dc9d245c019a9ddd19fa5dee792427` (package `@ai-hero/sandcastle`, `package.json` `version: 0.12.0`).
- **course-video-manager** — `github.com/mattpocock/course-video-manager` @ `80a8f30cb3e665bd3826170d4335229e81d3563e` (pins `@ai-hero/sandcastle: ^0.10.0` as a devDependency; `cvm package.json:126`).

Citations are `repo path:Lnn`, where `repo` is `cvm` or `sandcastle`. This is a faithful
record of what the sources say; it deliberately does not make adoption decisions.

> **Headline nuance up front — the "Sandcastle" label.** The issue's premise ("the
> ready-for-agent label is spelled `Sandcastle`") is correct *as a triage label* but is
> **not** what gates the workflows. `Sandcastle` is CVM's spelling of the canonical
> `ready-for-agent` triage role (`cvm docs/agents/triage-labels.md:9`) — a human-facing "this
> issue is fully specified, ready for an AFK agent" marker. The GitHub Actions jobs that
> actually invoke Sandcastle gate on the **`agent:*` state labels** instead (`agent:implement`,
> `agent:review`, `agent:to-issues`, `agent:update-branch`). No workflow or doc I read maps
> `Sandcastle` → `agent:implement` automatically; that hop appears to be manual. See
> [Open questions](#open-questions--gaps).

---

## 1. CVM's GitHub Actions workflows that invoke Sandcastle

CVM has **eight** workflow files, all under `cvm .github/workflows/`. Seven invoke a Sandcastle
runner script; one (`agent-promote-queued.yml`) is pure label plumbing.

| Workflow file | Trigger (`on:`) | Job `if:` label gate | Runner script invoked |
| --- | --- | --- | --- |
| `agent-implement.yml` | `issues: [labeled]` | `github.event.label.name == 'agent:implement'` (`:9`) | `.sandcastle/implement/implement.ts` (+ `write-pr/write-pr.ts`) |
| `agent-implement-prd.yml` | `issues: [labeled]` | `== 'agent:implement'` (`:9`) | `.sandcastle/implement-prd/implement-prd.ts` (+ `write-prd-pr`) |
| `agent-implement-pr.yml` | `pull_request_target: [labeled]` | `== 'agent:implement'` (`:11`) | `.sandcastle/implement-pr/implement-pr.ts` |
| `agent-review.yml` | `pull_request_target: [labeled]` | `== 'agent:review'` (`:14`) | `.sandcastle/review/review.ts` |
| `agent-update-branch.yml` | `pull_request_target: [labeled]` | `== 'agent:update-branch'` (`:14`) | `.sandcastle/update-branch/update-branch.ts` |
| `agent-to-issues-prd.yml` | `issues: [labeled]` | `== 'agent:to-issues'` (`:9`) | `.sandcastle/to-issues-prd/to-issues-prd.ts` |
| `architecture-review.yml` | `schedule` (cron `0 9 * * 1-5`) + `workflow_dispatch` | (backlog gate, not a label) | `.sandcastle/architecture-review/architecture-review.ts` |
| `agent-promote-queued.yml` | `issues: [closed]` | `state_reason != 'not_planned'` | (no runner — flips `agent:queued`→`agent:implement`) |

Workflows 2 and 3 (`agent-implement.yml` vs `agent-implement-prd.yml`) share the `agent:implement`
trigger and disambiguate by issue **shape** (does it have native sub-issues?) — see the "Detect"
steps in each (`cvm agent-implement.yml:27-51`, `cvm agent-implement-prd.yml:27-90`).

### The label gate, concretely

Every label-triggered job gates in the job-level `if:` on `github.event.label.name`:

```yaml
# cvm .github/workflows/agent-implement.yml:8-9
  implement:
    if: github.event.label.name == 'agent:implement'
```

```yaml
# cvm .github/workflows/agent-review.yml:13-14
  review:
    if: github.event.label.name == 'agent:review'
```

`pull_request_target` (not `pull_request`) is used for all PR-triggered workflows deliberately —
the comment explains the standard `pull_request` trigger depends on a generated merge commit that
GitHub fails to produce when the PR is out-of-date/conflicting, whereas `pull_request_target` runs
in the base context and fires reliably on the labeled event (`cvm agent-review.yml:3-8`,
`cvm agent-update-branch.yml:4-9`).

### Standard job scaffolding (identical across the invoking workflows)

Using `agent-implement.yml` as the archetype (`cvm agent-implement.yml`):

- `runs-on: ubuntu-latest`, `timeout-minutes: 60` (`:10-11`).
- **`concurrency`** groups per work item, `cancel-in-progress: false` (`:12-14`):
  `group: agent-implement-issue-${{ github.event.issue.number }}`. PR-mutating workflows share
  one group `agent-mutate-pr-${{ github.event.pull_request.number }}` so review + implement-pr +
  update-branch never push concurrently (`cvm agent-review.yml:17-19`, `agent-implement-pr.yml:15-17`,
  `agent-update-branch.yml:17-19`).
- **`permissions`**: `contents: write`, `pull-requests: write`, `issues: write` (`:15-18`).
- **Env**: `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, `GH_REPO: ${{ github.repository }}` (`:20-24`).
- **Checkout**: `actions/checkout@v4` with `ref: main`, `fetch-depth: 0`, and
  `token: ${{ secrets.AGENT_PAT || secrets.GITHUB_TOKEN }}` (`:98-108`). AGENT_PAT is preferred so
  the push may include changes under `.github/workflows/` (GITHUB_TOKEN lacks the `workflow` scope).
- **Node/pnpm**: `pnpm/action-setup@v4`, then `actions/setup-node@v4` with `node-version: "22"`,
  `cache: pnpm`, then `pnpm install --frozen-lockfile` (`:130-143`).
- **Agent CLI install**: `npm install -g @anthropic-ai/claude-code` (`:145-147`).
- **git identity**: `claude-code[bot]` / `claude-code[bot]@users.noreply.github.com` (`:126-127`).

### How Sandcastle is actually invoked

The runner is a **plain TypeScript entry script run with `tsx`** — not the `sandcastle` CLI:

```yaml
# cvm .github/workflows/agent-implement.yml:149-156
      - name: Run implement.ts
        id: implement
        env:
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          OUTPUT_DIR: ${{ runner.temp }}
        run: pnpm --dir .sandcastle exec tsx implement/implement.ts
```

All invoking workflows follow this shape: `pnpm --dir .sandcastle exec tsx <workflow>/<script>.ts`,
passing `CLAUDE_CODE_OAUTH_TOKEN` (the agent credential) and `OUTPUT_DIR: ${{ runner.temp }}` (the
file drop the orchestrator reads afterward). Work-item context is passed via env (e.g. `BRANCH`,
`PR_NUMBER`, `SUB_ISSUE_NUMBER`).

### How it runs with NO container — the runner IS the sandbox

Two pieces make this container-free:

1. **No `container:` key anywhere.** No CVM workflow declares a job `container:`, and no step
   calls `docker`/`podman`. The `tsx` script runs directly on the `ubuntu-latest` runner.

2. **`noSandbox()` + the default `head` branch strategy.** Every per-workflow runner script imports
   and passes Sandcastle's no-sandbox provider:

   ```ts
   // cvm .sandcastle/implement/implement.ts:5,12-27
   import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

   const result = await sandcastle.run({
     name: `implement-#${ISSUE_NUMBER}`,
     agent: sandcastle.claudeCode("claude-opus-4-6", {
       env: { CLAUDE_CODE_OAUTH_TOKEN: required("CLAUDE_CODE_OAUTH_TOKEN") },
     }),
     sandbox: noSandbox(),
     logging: { type: "stdout" },
     promptFile: path.join(import.meta.dirname, "prompt.md"),
     promptArgs: { ISSUE_NUMBER, ISSUE_TITLE, BRANCH },
   });
   ```

   `noSandbox()` "runs the agent directly on the host with no container isolation… the agent
   executes on the host" (`sandcastle src/sandboxes/no-sandbox.ts:1-12`). It `spawn`s the agent as
   an ordinary child process (`sandcastle src/sandboxes/no-sandbox.ts:78-88`).

**Which branch strategy makes that safe: `head`.** None of the CVM scripts pass `branchStrategy`, so
they take the documented default for no-sandbox providers, `{ type: "head" }` — "agent writes
directly to host working directory" (`sandcastle src/SandboxProvider.ts:245-248`;
`sandcastle src/sandboxes/no-sandbox.ts:38-44` confirms the default is `head`). The container-free
flow is therefore: **the orchestrator checks out the right branch on the runner → the agent commits
directly onto that checked-out working tree (head) → the orchestrator's own `git push` publishes it.**
The runner script only verifies work happened (`git rev-list --count main..HEAD`,
`cvm implement.ts:29-34`); the workflow does the push (`git push --force origin "$BRANCH"`,
`cvm agent-implement.yml:158-166`).

> Contrast: `cvm .sandcastle/main.ts` (the `pnpm sandcastle` local orchestrator, `cvm package.json:31`)
> uses `sandbox: docker()` and a plan→implement→review→merge loop (`cvm main.ts:1-16, 61-69`). That
> containerized path is **not** what Actions runs — it is a separate local-dev harness. The Actions
> path is exclusively the `noSandbox()` per-workflow scripts.

---

## 2. CVM's `.sandcastle/` directory contents

`cvm .sandcastle/` holds both the local docker orchestrator and the per-workflow (no-sandbox)
runners plus shared output helpers.

**Top-level helpers & the local orchestrator**

| File | Role |
| --- | --- |
| `main.ts` | Local `pnpm sandcastle` orchestrator — `docker()` sandbox, `MAX_ITERATIONS=10`, `MAX_PARALLEL=4`, plan/implement/review/merge (`cvm main.ts:1-158`). **Not used by Actions.** |
| `run-with-retry.ts` | Single-pass structured-output wrapper: run prompt WITH `output`; on `StructuredOutputError` resume the *same session* with feedback, up to `maxAttempts` (default 3) (`cvm run-with-retry.ts:49-97`). |
| `run-with-extraction.ts` | Two-pass wrapper: **produce** (no `output`, keep resumable `sessionId`) then **extract** (resume + `output` via `runWithRetry`). Commits come from produce, output from extract (`cvm run-with-extraction.ts:63-97`). |
| `retry-feedback.ts` | Builds the retry feedback block showing what the agent emitted and why it failed validation (`cvm retry-feedback.ts:15-46`). |
| `plan-prompt.md`, `implement-prompt.md`, `review-prompt.md`, `merge-prompt.md` | Prompts for the **docker** `main.ts` orchestrator (distinct from the per-workflow prompts). |
| `CODING_STANDARDS.md` | Repo coding standard fed to the review agent. |
| `Dockerfile` | Image for the docker sandbox (node:22, gh, pnpm, Claude Code). Used by `main.ts`, **not** by Actions (`cvm .sandcastle/Dockerfile:1-37`). |
| `.env.example` | `ANTHROPIC_API_KEY=` / `GH_TOKEN=` — for the local docker run (`cvm .sandcastle/.env.example:1-2`). |
| `.gitignore` | ignores `.env`, `logs`, `worktrees`. |

**Per-workflow runner directories** (each = a `*.ts` entry + `prompt.md` [+ `extraction.md`] [+ a Zod `*-output.ts` schema]):

- `implement/` — `implement.ts` + `prompt.md`
- `implement-prd/` — `implement-prd.ts` + `prompt.md`
- `implement-pr/` — `implement-pr.ts` + `prompt.md` + `extraction.md` + `implement-pr-output.ts`
- `review/` — `review.ts` + `prompt.md` + `extraction.md` + `review-output.ts` + `parse-diff-lines.ts`
- `update-branch/` — `update-branch.ts` + `prompt.md` + `extraction.md`
- `to-issues-prd/` — `to-issues-prd.ts` + `prompt.md`
- `architecture-review/` — `architecture-review.ts` + `prompt.md` + `extraction.md`
- `write-pr/` — `write-pr.ts` + `prompt.md`
- `write-prd-pr/` — `write-prd-pr.ts` + `prompt.md`

### Prompt template structure

Prompts are Markdown with `{{VAR}}` substitution (from `promptArgs`) and `` !`cmd` `` command
substitution for embedding fetched context. `implement/prompt.md` is representative
(`cvm .sandcastle/implement/prompt.md:1-31`):

```md
# TASK
Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}
You are on branch `{{BRANCH}}`, already created from `main`. Pull in the
issue with `gh issue view {{ISSUE_NUMBER}} --comments`. ...
# CONTEXT
Read `CONTEXT.md` and any relevant ADRs under `docs/adr/` ...
# EXECUTION
Use red-green-refactor ... Before committing, run `pnpm run typecheck` and `pnpm run test`.
# COMMIT
Make one or more git commits on `{{BRANCH}}` ... Do not close the issue yourself.
```

`review/prompt.md` embeds live context via command substitution — `` !`gh issue view {{ISSUE_NUMBER}} --comments` ``
and `` !`git diff main..HEAD --stat` `` — plus a pre-serialised `{{PR_COMMENTS_JSON}}`, and instructs the
agent to drive Matt's `code-review` skill as the single source of truth
(`cvm .sandcastle/review/prompt.md:11-53`). `extraction.md` is the "emit one `<output>` JSON block,
change nothing" pass with a field-reference table (`cvm .sandcastle/review/extraction.md:1-56`).

### Branch → PR → review → merge flow

The **runner script never touches GitHub state**; the workflow owns every mutation
(the spec calls this "the orchestrator owns every tracker/VCS mutation", `cvm docs/agents/afk-agent-platform-spec.md:42-45`).

1. **Branch naming** — deterministic slug from the issue: `agent/issue-${ISSUE_NUMBER}-${slug}`
   (`cvm agent-implement.yml:110-119`); PRD variant `agent/prd-${PRD_NUMBER}-${slug}`
   (`cvm agent-implement-prd.yml:124-133`).
2. **Create/resume branch** — single-issue creates fresh (`git checkout -b`, `:121-128`); PRD
   resumes if the remote branch exists, else creates, accumulating commits across sub-issue runs
   (`cvm agent-implement-prd.yml:145-161`).
3. **Push** — single-issue force-pushes (`git push --force`, safe because a preflight refuses when
   an open PR already targets the issue, `cvm agent-implement.yml:62-89, 158-166`). PR-mutating
   workflows push with `--force-with-lease` against the checked-out head SHA to detect races
   (`cvm agent-review.yml:88-107`).
4. **PR open** — `gh pr create --draft --base main --head "$BRANCH" --title … --body-file …`
   (`cvm agent-implement.yml:176-191`). Title/body come from the `write-pr` runner's output files.
5. **Review hand-off** — after opening the PR the implement workflow adds the `agent:review`
   label (preferring AGENT_PAT so the labeled event fires `agent-review.yml`; GITHUB_TOKEN
   label-adds don't trigger downstream workflows) (`cvm agent-implement.yml:193-214`).
6. **Merge** — human-gated; not automated in any workflow (the spec calls merge "the only
   human-gated step", `cvm docs/agents/afk-agent-platform-spec.md:1043-1044`).
7. **Ready** — review marks the PR ready (`gh pr ready`, `cvm agent-review.yml:119-121`).

Label state machine (`cvm docs/agents/triage-labels.md:19-28`): trigger label removed →
`agent:in-progress` added → on success handed to the next label, on failure `agent:blocked` +
comment with the run URL, and `agent:in-progress` always removed in an `if: always()` step.

---

## 3. Agent provider selection (Claude Code + Codex)

**In CVM: Claude Code only. Codex is never wired.** Every Sandcastle run — both the docker
`main.ts` orchestrator and all seven no-sandbox runners — uses:

```ts
sandcastle.claudeCode("claude-opus-4-6", {
  env: { CLAUDE_CODE_OAUTH_TOKEN: required("CLAUDE_CODE_OAUTH_TOKEN") },
})
```

(`cvm .sandcastle/implement/implement.ts:14-18`; identical in `review.ts:162-166`,
`implement-pr.ts:162-166`, `update-branch.ts:50-54`, `to-issues-prd.ts:24-28`,
`architecture-review.ts:26-30`, `implement-prd.ts:13-17`, `write-pr.ts:20-24`,
`write-prd-pr.ts:19-23`; and `main.ts:14,73,85,145`). The model is hard-coded `claude-opus-4-6`;
there is **no** provider-selection branch, no `codex()` call, and no `OPENAI_API_KEY` in any
`.sandcastle` or workflow file. A repo-wide grep found `codex`/`openai` only in the *course-video
domain* (Whisper transcription in `app/services/video-processing-service.ts`, and the root
`openai: ^6.25.0` dep) — unrelated to Sandcastle.

- **Secret used:** `CLAUDE_CODE_OAUTH_TOKEN` (passed only into the runner step,
  e.g. `cvm agent-implement.yml:153`).
- **One provider per issue/PR** — a single `claudeCode` agent per run.

**Codex exists in the Sandcastle library but CVM doesn't use it.** Sandcastle exports six providers —
`claudeCode, codex, copilot, cursor, opencode, pi` (`sandcastle src/index.ts:55-62`). The `codex`
provider (`sandcastle src/AgentProvider.ts:773-825`) builds `codex exec --json …` commands, supports
`effort`, `env`, `captureSessions`, and an `approvalsReviewer` option; its auth is whatever env you
inject (there is no hard-coded `OPENAI_API_KEY` in the provider). So "Claude Code + Codex" is a
*library capability*, but the **reference repo picks Claude Code exclusively**. Swapping to Codex in
unshelf would mean `sandcastle.codex(model, { env: { … } })` and supplying the matching credential —
not demonstrated by CVM.

---

## 4. Skills / prompts to lift

### Under CVM's `.claude/skills/`
These are general CVM dev skills, **not** Sandcastle-specific, and are only loosely relevant:

- `do-work/SKILL.md` + `DB-TDD.md` + `FRONTEND-TDD.md` — explore→implement→typecheck/test→commit
  workflow (`cvm .claude/skills/do-work/SKILL.md:1-29`).
- `to-issues-project/`, `to-prd-project/`, `improve-codebase-architecture-project/`,
  `optimize-loader/`, `install-effect-package/`, `document-ai-hero-api/` — domain/project skills.
- `cvm .claude/settings.json` wires one `PreToolUse` Bash hook (`block-npx-tsc.sh`).

The **review workflow does not vendor a skill into the repo** — it installs Matt's `code-review`
skill globally at run time: `pnpm dlx skills@latest add mattpocock/skills -g -s code-review -a claude-code -y --copy`
(`cvm agent-review.yml:73-74`). So the reusable review logic lives in `mattpocock/skills`, external to CVM.

### Living in the Sandcastle repo itself (the cleaner reference to copy)
The Sandcastle repo ships its **own** parallel AFK setup — a minimal reference implementation:

- `sandcastle .github/workflows/agent-{implement,review,implement-pr,update-branch,explore}.yml`
  — same shape as CVM's, gated on `agent:*` labels (`sandcastle agent-implement.yml:9`), invoked
  with `npx tsx .sandcastle/agent-workflows/<wf>/<wf>.ts` (`:153`), git identity
  `sandcastle-agent[bot]`.
- `sandcastle .sandcastle/agent-workflows/{implement,review,implement-pr,update-branch,explore}/`
  plus `shared/{common,run-with-extraction,review-context,review-output,diff-lines}.ts`. The
  runner is the same `noSandbox()` + `claudeCode` pattern (`sandcastle .sandcastle/agent-workflows/implement/implement.ts:3,15-27`),
  with a shared `claudeAgent()` helper pinning `claude-opus-4-8` + `CLAUDE_CODE_OAUTH_TOKEN`
  (`sandcastle .sandcastle/agent-workflows/shared/common.ts:55-60`).
- `sandcastle .factory/` and `sandcastle .agents/skills/pre-release/SKILL.md` — additional agent
  harness variants (Factory daemon, a pre-release skill).

### The single highest-value artifact: CVM's AFK platform spec + prompt skeletons
`cvm docs/agents/afk-agent-platform-spec.md` is a **complete, repo-agnostic specification** for this
exact system ("You should be able to re-implement the whole system in a fresh repository from this
spec alone", `:8-10`). It documents the four pillars (GitHub Actions / Issues+PRs / git / pluggable
runner, `:20-25`), the eight workflows, the label state machine, the AGENT_PAT chaining pattern
(`:260-269`), and **§3.8 the agent-runner contract** (env vars in, files out, orchestrator does all
mutations, `:344-420`). It ships runner-neutral prompt skeletons under `cvm docs/agents/prompts/`
(`architecture-review`, `implement`, `implement-pr`, `implement-prd`, `review`, `to-issues`,
`update-branch`, `write-pr`, `write-prd-pr` — Appendix B). Appendix A explicitly names the
container-free reference stack: "`@ai-hero/sandcastle` driving `claudeCode("claude-opus-4-6")` in a
`noSandbox()` sandbox. `OUTPUT_DIR` = the GitHub Actions `runner.temp`" (`:1050-1058`).

---

## 5. Sandcastle library API surface (relevant to a no-container Actions run)

Package `@ai-hero/sandcastle`, `version 0.12.0` at the cloned HEAD (`sandcastle package.json:1-3`);
CVM pins `^0.10.0`. Subpath export `@ai-hero/sandcastle/sandboxes/no-sandbox` is published
(`sandcastle package.json:29-32`).

### `run()` — signature & options
`run(options)` with overloads that thread `output` typing through (`sandcastle src/run.ts:481-489`).
`RunOptions` (`sandcastle src/run.ts:332-427`), fields relevant here:

| Option | Type / default | Notes |
| --- | --- | --- |
| `agent` | `AgentProvider` | e.g. `claudeCode("claude-opus-4-6")` (`:333-334`). |
| `sandbox` | `SandboxProvider` | `noSandbox()` for container-free (`:335-336`). |
| `prompt` / `promptFile` | mutually exclusive | `promptFile` resolved against `process.cwd()` (`:347-356`). |
| `promptArgs` | `PromptArgs` | `{{KEY}}` substitution (`:361-362`). |
| `maxIterations` | number, **default 1** (`DEFAULT_MAX_ITERATIONS`, `:90-91`) | must be `1` when `output` is set (`:551-556`); incompatible with `resumeSession` (`:534-540`). |
| `hooks` | `SandboxHooks` | lifecycle hooks grouped host/sandbox (`:359-360`); e.g. `main.ts:64-68` runs `pnpm install` `onSandboxReady`. |
| `branchStrategy` | `BranchStrategy` | default `head` for bind-mount/no-sandbox, `merge-to-head` for isolated (`:384-386`). |
| `resumeSession` | string | resume a prior session by id; the two-pass wrappers rely on this (`:387-388`). |
| `output` | `OutputDefinition` | scans stdout for the configured XML tag post-run; `Output.object({tag,schema})` / `Output.string({tag})` (`:412-426`). |
| `logging` | `LoggingOption` | `{ type: "stdout" }` (used by the runners) or `{ type: "file", path }` (`:222-256`). |
| `completionSignal` | default `"<promise>COMPLETE</promise>"` | substring that stops the iteration loop (`:365-366`). |
| `idleTimeoutSeconds` | default 600 | no-output watchdog (`:367-368`). |

`RunResult` (`sandcastle src/run.ts:442-479`): `iterations`, `stdout`, `commits: {sha}[]`, `branch`,
`completionSignal?`, `logFilePath?`, and optional `resume()` / `fork()` continuations. CVM reads
`result.commits.length` to decide whether to run the reviewer / push (`cvm implement.ts:39`,
`cvm review.ts:187`).

### Branch strategies (the no-container-relevant part)
Defined in `sandcastle src/SandboxProvider.ts:243-289`:

- **`head`** (`{ type: "head" }`, `:245-248`) — "agent writes directly to host working directory."
  This is what the no-sandbox Actions runs use (default).
- **`merge-to-head`** (`:250-253`) — temp branch, merge back to HEAD, delete temp branch.
- **`branch`** (`NamedBranchStrategy`, `:255-266`) — commits land on an explicit named `branch`,
  with optional `baseBranch` start point.

No-sandbox supports **all three** (`NoSandboxBranchStrategy`, `:279-283`); the provider default is
`head` (`sandcastle src/sandboxes/no-sandbox.ts:38-44`). `noSandbox()` itself takes `{ env?, maxOutputTailChars? }`
and `spawn`s the agent as a host child process with no isolation
(`sandcastle src/sandboxes/no-sandbox.ts:24-88`); `close()` is a no-op ("no container to tear down", `:164-166`).

### Structured output, retries, hooks
- `Output.object({ tag, schema })` / `Output.string({ tag })` and `StructuredOutputError`
  are exported from `sandcastle src/index.ts:48-53`. `StructuredOutputError` carries `sessionId`,
  `tag`, `rawMatched`, `cause` — enabling the *resume-the-same-session* retry the CVM wrappers rely on
  (`cvm run-with-retry.ts:44-87`).
- `maxIterations` default is `1`; multi-iteration loops stop on `completionSignal`.
- `SandboxHooks` (host/sandbox lifecycle, e.g. `onSandboxReady`) exported at `src/index.ts:46`.

### Agent providers
`claudeCode(model, options?)` (`sandcastle src/AgentProvider.ts:1181-1267`) → builds
`claude --print --verbose … --output-format stream-json --model <model> …`; `ClaudeCodeOptions`
supports `effort`, `env`, `captureSessions`, `sessionStorage`, `permissionMode` (`:1155-1179`).
`codex(model, options?)` (`:773-825`) with `CodexOptions.{effort,env,captureSessions,approvalsReviewer}`
(`:750-771`). Sessions are captured to the host so runs are resumable — the mechanism the two-pass
extraction wrapper depends on.

---

## What Unshelf would copy

A concrete lift list, grounded in the sources above:

- **Workflow shape (per capability).** One GitHub Actions workflow per agent capability, triggered
  by `issues: [labeled]` or `pull_request_target: [labeled]` (plus a `schedule` one), each gated in
  the job `if:` on an `agent:*` label. Steps: label transition → checkout the target branch
  (`AGENT_PAT || GITHUB_TOKEN`, `fetch-depth: 0`) → setup Node 22 (+ pnpm if used) → install deps →
  `npm install -g @anthropic-ai/claude-code` → `tsx .sandcastle/<wf>/<wf>.ts` with
  `CLAUDE_CODE_OAUTH_TOKEN` + `OUTPUT_DIR: ${{ runner.temp }}` → read the runner's output files and
  do all `gh`/`git` mutations in the workflow. Use `pull_request_target` for PR triggers;
  `--force-with-lease` for PR-branch pushes; shared `concurrency` group for PR-mutating workflows.
  **The Sandcastle repo's own `.github/workflows/agent-*.yml` are the minimal starting point;**
  CVM's are the fuller version (PRD chaining, preflights, race handling).
- **`.sandcastle/` runner scripts.** Per-capability `<wf>.ts` using `sandcastle.run({ agent:
  claudeCode(model,{env:{CLAUDE_CODE_OAUTH_TOKEN}}), sandbox: noSandbox(), logging:{type:"stdout"},
  promptFile, promptArgs })`, writing well-known files to `OUTPUT_DIR`. Plus the two output helpers
  (`run-with-retry.ts`, `run-with-extraction.ts`, `retry-feedback.ts`) and the Zod `*-output.ts`
  schemas + `parse-diff-lines.ts` diff-anchor validation.
- **Prompts.** `prompt.md` (+ `extraction.md`) per capability with `{{VAR}}` and `` !`cmd` ``
  substitution. **Start from `cvm docs/agents/prompts/*.prompt.md` (runner-neutral skeletons)** and
  fill the project-specific half (your `CONTEXT.md`, coding standards, test commands).
- **Container-free mechanism.** `noSandbox()` + default `head` branch strategy → the runner is the
  sandbox; the workflow's own checkout+push handles VCS. No `container:` key, no docker/podman.
- **Secrets.** `CLAUDE_CODE_OAUTH_TOKEN` (agent credential, passed only into the runner step) and
  `AGENT_PAT` (strongly recommended: enables label-triggered chaining and pushing workflow-file
  changes; the system "degrades gracefully" without it — chains stop and need a manual re-label,
  `cvm afk-agent-platform-spec.md:150-153, 260-269`). `GITHUB_TOKEN` for in-workflow `gh` calls.
- **Branch strategy.** `head` (default) — commit onto the branch the workflow already checked out.
- **Labels / state machine.** The `agent:*` state labels + transition/blocked/in-progress plumbing
  (`cvm docs/agents/triage-labels.md:19-28`), and — if desired — the `Sandcastle`/`ready-for-agent`
  triage label. **Decide the `Sandcastle` → `agent:implement` hop** (see gaps).
- **The spec + contract.** `cvm docs/agents/afk-agent-platform-spec.md` (esp. §3.8 the agent-runner
  contract) as the design doc; it is explicitly written to be re-implemented in a fresh repo.
- **Skills.** No Sandcastle-specific skill needs vendoring; the review step installs Matt's
  `code-review` skill from `mattpocock/skills` at run time (`pnpm dlx skills@latest add …`).

---

## Open questions / gaps

- **`Sandcastle` → `agent:implement` mapping (partially answered / flagged).** `Sandcastle` is
  confirmed as CVM's `ready-for-agent` triage label (`cvm docs/agents/triage-labels.md:9`), but **no
  workflow gates on `Sandcastle`** and I found no file that auto-translates `Sandcastle` into the
  `agent:implement` state label that actually fires a run. The likely reality is a manual/triage step,
  but the sources I read do not show the automation. Worth confirming before assuming the label alone
  triggers agents.
- **Codex (partially answered).** The library supports `codex()` (`sandcastle src/AgentProvider.ts:773`),
  but CVM wires **only** Claude Code — there is no reference example of Codex provider selection, dual
  providers, or the exact Codex credential env in the AFK path. Any "Claude Code + Codex" behaviour in
  unshelf would be new work, not a copy.
- **Version drift.** CVM pins `@ai-hero/sandcastle ^0.10.0` (`cvm package.json:126`) while the cloned
  library HEAD is `0.12.0`; the CVM scripts also call the model string `claude-opus-4-6` while the
  Sandcastle repo's own scripts use `claude-opus-4-8`. API details above are read from the `0.12.0`
  source — pin a version deliberately and re-verify option names against the installed version.
- **`sandcastle` CLI vs `run()`.** The library ships a `sandcastle` bin (`sandcastle package.json:34-36`),
  but the Actions path never uses it — it calls `run()` from `tsx` scripts. The CLI surface was not
  inventoried here (out of scope for the no-container Actions question).
- **Secrets provisioning.** How `CLAUDE_CODE_OAUTH_TOKEN` / `AGENT_PAT` are obtained and rotated is a
  human/ops step not covered by any file in these repos.
