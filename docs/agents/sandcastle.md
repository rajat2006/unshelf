# Sandcastle autonomous-agent platform — operations

The `.sandcastle/` runner seam and `.github/workflows/agent-*.yml` workflows let
autonomous coding agents work ready issues into reviewed draft PRs inside GitHub
Actions. This doc is the operator's control surface: the `agent:*` label taxonomy
and the one-time secrets provisioning checklist. The build spec is **#52**; the
runner seam is documented in [`.sandcastle/README.md`](../../.sandcastle/README.md).

The maintainer's only two touch-points are **applying the trigger label** and
**merging**. Everything between is machine-driven.

## Label taxonomy

Three orthogonal layers. Triage and wayfinder labels are unchanged
(see [`triage-labels.md`](triage-labels.md)).

### 1. Triage (existing)

`ready-for-agent` marks fully-specified work safe to hand to an agent — it is **not
a trigger**, just a signal. `ready-for-human` is **human-applied only** and pulls an
issue out of the agent lane; it is never applied by a machine.

### 2. Provider

| Label | Meaning |
| --- | --- |
| `agent:codex` | Optional. Present ⇒ run on Codex (`gpt-5.6-sol`). **Absent ⇒ Claude Code (`claude-opus-4-8`)** — a default needs no label, so there is deliberately **no `agent:claude`**. Applied to an issue, it is **propagated onto the PR** by `agent-implement` so the review runs on the same provider (each workflow resolves its provider from its own subject's label set). |

### 3. Agent state machine

| Label | Applied by | Meaning |
| --- | --- | --- |
| `agent:implement` | **human** | Trigger on an issue → the workflow removes it and adds `agent:in-progress`. |
| `agent:in-progress` | machine | A run is active. Added on start, removed on finish (`if: always()`). |
| `agent:review` | machine (via `AGENT_PAT`) | An implement run finished → fires the review workflow. |
| `agent:implement-pr` | human | Address review comments on an open PR. |
| `agent:update-branch` | human | Refresh a stale PR branch against `main`. |
| `agent:to-issues` | human | Expand a PRD issue into child issues. |
| `agent:queued` | machine | Blocked by another open issue; `promote-queued` flips it to `agent:implement` when the blocker closes. |
| `agent:blocked` | machine | A run stopped (crash, timeout, or the agent explicitly asked for a human). Carries a run-URL comment. |

**Why machine label-adds use `AGENT_PAT`:** a label applied by the default
`GITHUB_TOKEN` does not trigger a downstream workflow. The implement → review → ready
chain only fires because `agent:review` is added with the PAT (see secrets below).

**Retry is manual.** Any stop lands the subject in `agent:blocked` with a run link. A
human clears `agent:blocked` and re-applies the **originating trigger label** (the one
that fired the run — `agent:implement`, `agent:implement-pr`, `agent:update-branch`, or
`agent:to-issues`) to retry — there is no automatic loop. (Sandcastle's within-run
resume-session retry is internal to a single run, not a label transition.)

### 4. Provenance

`source:architecture-review` (machine) marks a PRD **proposed by the scheduled
`agent-architecture-review`** run — not a trigger. It is the dedupe key each run
checks (so it never re-raises an open opportunity) and the backlog the open-proposal
cap counts (ten open ⇒ the next run skips). A human triages it like any PRD, then
applies `agent:to-issues` to expand it.

### Provisioning the labels

Idempotent — creates or reconciles the nine `agent:*` labels plus the
`source:architecture-review` provenance label (spec #70), touching nothing else:

```bash
./.sandcastle/provision-labels.sh            # current repo
./.sandcastle/provision-labels.sh owner/repo # explicit repo
```

## Secrets provisioning checklist

Both providers authenticate via **flat subscription seats, not metered API keys**, so
marginal per-issue agent cost is ~$0 — the only metered cost is Actions minutes. Create
these **three** repository secrets once
(`Settings → Secrets and variables → Actions → New repository secret`):

### 1. `CLAUDE_CODE_OAUTH_TOKEN`

Mint from a Claude Pro/Max seat and paste the token as the secret value:

```bash
claude setup-token
```

The workflow feeds it to the same-named env var; the runner's `@anthropic-ai/claude-code`
picks it up. This is CVM's proven path.

### 2. `CODEX_AUTH_JSON`

The **contents** of `~/.codex/auth.json` produced by a local `codex login` (Codex uses a
file-based credential store, not an API key). The workflow materialises it into
`$CODEX_HOME/auth.json` on the runner **before** `sandcastle.run()` — Sandcastle fails
fast if `auth.json` is missing.

```bash
codex login            # once, locally
cat ~/.codex/auth.json # paste the whole file as the secret value
```

**Codex CI requirements — read before wiring the Codex path:**

- `~/.codex/config.toml` must set `cli_auth_credentials_store = "file"` — the OS keyring
  is unreachable in CI. The runner writes this automatically (`prepareCodexAuth`).
- **`OPENAI_KEY` / `OPENAI_API_KEY` must NOT be set** anywhere the runner can see them. If
  either is present, Codex bills against the metered Platform API and can fail
  `Quota exceeded` even with a valid subscription. Do not add them as secrets.
- **The secret needs a periodic (~weekly) re-paste.** Codex refreshes the ChatGPT
  tokens *in place* during a run, and its refresh token is **single-use** (rotated on
  every refresh, with server-side reuse detection — see
  [`codex-rs/login/src/auth/manager.rs`](https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/manager.rs)).
  Within a job the runner seeds `auth.json` only when it is **absent**, so a later phase
  never restores the stale seed over a fresh refresh. But an ephemeral runner discards
  the refreshed file at job end — so once a run actually refreshes, the copy still in
  `CODEX_AUTH_JSON` is burned. A run only refreshes when the seeded access token is near
  expiry, which is on the order of **~8 days** (codex's `TOKEN_REFRESH_INTERVAL`; OpenAI
  recommends a [weekly maintenance schedule](https://learn.chatgpt.com/docs/auth/ci-cd-auth)).
  So a pasted secret runs cleanly for about a week, then a codex run fails with
  *"refresh token was already used"* — at which point re-run `codex login` and repaste
  `CODEX_AUTH_JSON`. Fully hands-off operation (writing the refreshed `auth.json` back to
  the secret + serialising codex runs) is deferred to a follow-up; Codex is opt-in and
  Claude Code (the no-label default) has no such lifecycle.

### 3. `AGENT_PAT`

A **fine-grained personal access token**, scoped to this repo, with:

- **Contents** — Read and write
- **Pull requests** — Read and write
- **Workflows** — Read and write

Needed because the default `GITHUB_TOKEN` lacks the `workflows` scope and cannot trigger a
downstream workflow when it adds a label — so the implement → review → ready chain would
stall without it. It is also the preferred checkout token (`fetch-depth: 0`), falling back
to `GITHUB_TOKEN` when absent.

### `GITHUB_TOKEN` (auto-provided — do not create)

GitHub injects this automatically. It is only the checkout fallback when `AGENT_PAT` is
absent, and it is deliberately **not** used for chain-triggering label adds.

### Not used — and one that must stay unset

`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` / `OPENAI_KEY` are **not** part of this setup
(subscription auth replaces them). As above, setting `OPENAI_KEY`/`OPENAI_API_KEY` actively
breaks the Codex subscription path — leave them unset.

## Workflows

Each capability is one `.github/workflows/agent-*.yml` on top of the `.sandcastle/`
seam; the runner-side scripts + prompts are documented in
[`.sandcastle/README.md`](../../.sandcastle/README.md).

| Workflow | Trigger | Does |
| --- | --- | --- |
| `agent-implement.yml` | `agent:implement` on a leaf issue | Cuts `agent/issue-<N>-<slug>` from `main`, runs the `implement` + `write-pr` capabilities, pushes, opens a **draft** PR, copies `agent:codex` onto the PR when the issue had it (so the review runs on the same provider), and adds `agent:review` via `AGENT_PAT`. PRDs (issues with sub-issues) are **silently skipped** for the PRD flow to handle; sub-issues (with a parent) and issues that already have an open PR are refused. A sub-issue shape that can't be read (transient API failure) fails **closed** — refused with `agent:blocked`, never implemented as if it were a leaf. |
| `agent-implement-prd.yml` | `agent:implement` on a **PRD-shaped** issue | The PRD variant, mirroring CVM's incremental lifecycle. Listens for the **same** `agent:implement` event and disambiguates purely by shape: it proceeds only when the issue **has** native sub-issues (a leaf is silently skipped for `agent-implement.yml`; an unreadable shape fails **closed**), so exactly one path runs per issue. It processes **one sub-issue per run**: it resumes the accumulating `agent/prd-<N>-<slug>` branch (creating it on the first run), runs `implement-prd` for the first still-open sub-issue, pushes (no force — commits accumulate), **closes that sub-issue**, and opens the auto-reviewed **draft** PR via `write-prd-pr` if one isn't open yet (the body describes the whole PRD and `Closes #<PRD>`). Then it re-adds `agent:implement` via `AGENT_PAT` to chain the next sub-issue, and only once **every** sub-issue is closed does it hand off to review (`agent:review`). Same `agent:in-progress` / `agent:blocked` / `agent:codex`-propagation behaviour as the normal path. Nested PRDs, sub-issues with their own sub-issues, and all-closed PRDs are refused. |
| `agent-review.yml` | `agent:review` on a PR (`pull_request_target`) | Checks out the PR branch and runs the `review` capability (the repo's local `/code-review`, no external skills registry): it reviews both axes, **fixes what it safely can and commits**, and re-reviews. The workflow pushes the fix commits, posts one review (summary + inline comments for unresolved findings), and marks the PR **ready** via `gh pr ready`. Swaps `agent:review` → `agent:in-progress` on start; a failure lands the PR in `agent:blocked` with a run-URL comment (left a draft) and always removes `agent:in-progress`. Shares a per-PR concurrency group with the other PR-mutating capabilities (`queue: max`, `cancel-in-progress: false` — queues, never cancels). Fork PRs are refused (it runs under `pull_request_target` with secrets in scope). This closes the implement → review → ready chain. |
| `agent-architecture-review.yml` | weekday cron (09:00 UTC) + `workflow_dispatch` (**no label**) | The autonomous analogue of CVM's interactive `/improve-codebase-architecture`. Checks out `main` and runs the `architecture-review` capability to survey the tree for the **single freshest deepening opportunity** and propose it as a **PRD** labelled `source:architecture-review` (a human later expands it with `agent:to-issues`). Does **not** run the interactive `/improve-codebase-architecture` skill — it's `disable-model-invocation` and needs an HTML report + a human; the survey is described directly with the `/codebase-design` vocabulary. Read-only — the agent commits nothing (`permissions: contents: read`). Before running it **dedupes** against the open `source:architecture-review` proposals (their titles are fed to the agent so it proposes something fresh) and **skips the run entirely once ten are open**, so an un-triaged backlog doesn't grow. One PRD per run (or a `skipped` no-op). A manual dispatch can opt into Codex via the `provider` input; the cron path always uses the Claude default. Serialised by a single concurrency group (`cancel-in-progress: false`). |
| `agent-implement-pr.yml` | `agent:implement-pr` on an **open** PR (`pull_request_target`) | Checks out the PR branch and runs the `implement-pr` capability: it reads the PR's review threads (via GraphQL, so resolved threads are skipped reliably), **changes what it safely can and commits**, running the repo's typecheck/test on what it touches, and marks each comment `addressed` or `deferred`. The workflow pushes the fix commits, **replies on each answered thread** — addressed (the fix) or deferred (why it was left), CVM-style, reply only; resolution stays the reviewer's call — after validating each thread id against the PR's real **unresolved** threads, and posts one summary comment. It does **not** flip the PR's draft/ready state — that belongs to `agent-review`. Refuses a closed/merged PR up front, refuses cleanly (no `agent:blocked`) when the PR has no unresolved threads, comments, or non-approval review bodies to address before spending an agent run, and a runtime guard still blocks a run that produced nothing. Swaps `agent:implement-pr` → `agent:in-progress` on start; a failure lands the PR in `agent:blocked` with a run-URL comment and always removes `agent:in-progress`. Shares the same per-PR concurrency group as `agent-review` (`queue: max`, `cancel-in-progress: false`), so the two never mutate a PR concurrently. Fork PRs are refused. |
| `agent-update-branch.yml` | `agent:update-branch` on a PR (`pull_request_target`) | Brings a stale or conflicted branch current with `main`. Resolves the common cases **deterministically, no agent**: an already-current branch is a no-op, and a conflict-free merge is done with `git merge` in a shell step (matching CVM — the agent is spent only when there are real conflicts). On a conflicted merge it runs the `update-branch` capability, which re-merges, resolves the conflicts, runs the repo's checks, and **commits the merge**; the runner then cross-checks the agent's claim against the real git state (origin/main is now an ancestor of HEAD, HEAD advanced, no unresolved paths, no lingering merge state) before the workflow pushes. The workflow pushes the refreshed branch (a plain, non-force push — merge, never rebase) and posts a summary comment. Fires on the labeled event even when the PR head **conflicts with base** — `pull_request_target` is not gated on mergeability, which is the whole point. Swaps `agent:update-branch` → `agent:in-progress` on start; a failure — a failed postcondition, or an agent that reports `blocked` because a conflict needs a human — lands the PR in `agent:blocked` with the reason and a run-URL comment (the branch is left unchanged — the merge is only pushed on success) and always removes `agent:in-progress`. Shares the per-PR concurrency group with the other PR-mutating capabilities (`queue: max`, `cancel-in-progress: false`). Fork PRs are refused. |
| `agent-to-issues.yml` | `agent:to-issues` on a PRD issue | Runs the `to-issues-prd` capability (the agent reads the PRD and emits a **structured** decomposition; it creates nothing), the runner deterministically renders each child's body, then the **workflow** does the `gh issue create` for each child and links it as a sub-issue of the PRD — a **failed link fails the run** (no orphaned, unlinked child reported as done). Swaps `agent:to-issues` → `agent:in-progress` on start; comments the created sub-issue list (in build order) on the PRD on success; a failure lands the PRD in `agent:blocked` with a run-URL comment that **inventories any children already created** and says to detach them before retrying, and always removes `agent:in-progress`. The parent PRD is never closed and its body is never edited. Refuses (with `agent:blocked`) a sub-issue (a leaf, not a PRD) and a PRD that already has sub-issues (already decomposed). Applies **no** state label to the children — a human triages them. Per-PRD concurrency (`queue: max`, `cancel-in-progress: false`). |

## Cost model

Two flat subscription seats (~$0 marginal per issue, usage-capped) plus metered Actions
minutes on this **private** repo (~$0.12–0.48 per job; a realistic 15–30 min run is
$0.12–0.24; worst case at the 60-min cap is $0.48).
