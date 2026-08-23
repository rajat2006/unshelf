# PROTOTYPE — same-session Product CI repair

This throwaway prototype answers whether a Sandcastle capability can stop its
agent process, wait for Product CI, then resume the same Claude Code or Codex
session with bounded failure evidence and reach one of three explicit outcomes:
`repair-commit`, `rerun`, or `blocked`.

Open `same-session-ci-repair.html` directly in a browser to exercise the state
machine. The guided walkthroughs cover exact-head success, a repair commit, a
transient rerun, stale/cancelled checks, and attempt exhaustion.

`live-session-proof.mts` is the companion live probe. It creates a disposable
git repository under the OS temporary directory, starts an agent, lets that
process exit, runs a deterministic failing check while no agent is alive, then
starts a second process that resumes the captured session and repairs + commits
the fixture.

```bash
pnpm --dir .sandcastle exec tsx prototypes/issue-471/live-session-proof.mts claude
pnpm --dir .sandcastle exec tsx prototypes/issue-471/live-session-proof.mts codex
```

The probe uses the repository's configured Build-tier provider/model and local
subscription authentication. It prints a JSON verdict and removes its temporary
fixture. It never edits the real checkout.

## Live result — 2026-08-19

| Provider | CLI | Separate start/repair processes | Repair commit | Final check |
| --- | --- | --- | --- | --- |
| Codex | `codex-cli 0.148.0` | Passed | One commit | Passed, tracked tree clean |
| Claude Code | `2.1.235` | Passed | One commit | Passed, tracked tree clean |

Both runs used `@ai-hero/sandcastle` 0.12.0 and the Provider returned a session
id after each phase. The first process terminated before the deterministic
check ran. The second process received only a 512-character-capped excerpt plus
check name, exact head SHA, conclusion, and attempt budget.

## Provisional verdict

The current pinned Sandcastle integration can preserve and resume both Provider
sessions across process boundaries within one Actions job. A workflow can
therefore let the LLM exit while Product CI runs, then resume the originating
Provider session for repair.

The production design still needs a shared orchestration module that persists
the opaque session id between steps and deterministically owns exact-head
selection, evidence bounding, the two-attempt budget, rerun requests, and the
blocked/draft fallback. The prototype supports that seam; it does not validate
cross-job or cross-runner resume, which is not required by the map.
