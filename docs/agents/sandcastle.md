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
| `agent:codex` | Optional. Present ⇒ run on Codex (`gpt-5.6-sol`). **Absent ⇒ Claude Code (`claude-opus-4-8`)** — a default needs no label, so there is deliberately **no `agent:claude`**. |

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

**Retry is manual.** Any stop lands the issue in `agent:blocked` with a run link. A
human clears `agent:blocked` and re-applies `agent:implement` to retry — there is no
automatic loop. (Sandcastle's within-run resume-session retry is internal to a single
run, not a label transition.)

### Provisioning the labels

Idempotent — creates or reconciles the nine `agent:*` labels, touching nothing else:

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
  is unreachable in CI.
- **`OPENAI_KEY` / `OPENAI_API_KEY` must NOT be set** anywhere the runner can see them. If
  either is present, Codex bills against the metered Platform API and can fail
  `Quota exceeded` even with a valid subscription. Do not add them as secrets.

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
| `agent-implement.yml` | `agent:implement` on a leaf issue | Cuts `agent/issue-<N>-<slug>` from `main`, runs the `implement` + `write-pr` capabilities, pushes, opens a **draft** PR, and adds `agent:review` via `AGENT_PAT`. PRDs (issues with sub-issues) are **silently skipped** for the PRD flow to handle; sub-issues (with a parent) and issues that already have an open PR are refused. |

## Cost model

Two flat subscription seats (~$0 marginal per issue, usage-capped) plus metered Actions
minutes on this **private** repo (~$0.12–0.48 per job; a realistic 15–30 min run is
$0.12–0.24; worst case at the 60-min cap is $0.48).
