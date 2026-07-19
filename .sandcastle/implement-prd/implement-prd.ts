import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import * as path from "node:path";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { requireEnv } from "../require-env";
import { resolveAgent } from "../resolve-agent";

/**
 * The `implement-prd` capability: implement ONE still-open sub-issue of a PRD
 * onto its accumulating branch.
 *
 * Invoked by `.github/workflows/agent-implement-prd.yml` once per sub-issue. The
 * workflow drives the PRD forward incrementally — it resumes the branch, runs
 * this for the first open sub-issue, closes that sub-issue, then re-labels the
 * PRD so the next run picks up the next one; review is requested only when every
 * sub-issue is closed. So this script's job is deliberately narrow: work exactly
 * `SUB_ISSUE_NUMBER`, commit on top of whatever earlier sub-issue runs left on
 * the branch, and never touch GitHub state (the workflow owns that).
 *
 * Like `implement`, it calls `run()` directly — the *work is the commits*, which
 * the workflow pushes; there is nothing to extract. Unlike `implement`, there is
 * **no commit-count guard**: a sub-issue may already have been satisfied by an
 * earlier run (e.g. a retry after a mid-chain failure), so zero new commits is a
 * legitimate outcome and must still let the workflow close the sub-issue and
 * advance. A genuine failure surfaces as a non-zero exit (crash or the idle
 * watchdog), which the workflow's `failure()` path turns into `agent:blocked`.
 *
 * Provider (Claude Code vs Codex) is resolved from the PRD's full label set, the
 * same seam every other capability uses.
 */

const prdNumber = requireEnv("PRD_NUMBER");
const prdTitle = requireEnv("PRD_TITLE");
const subIssueNumber = requireEnv("SUB_ISSUE_NUMBER");
const subIssueTitle = requireEnv("SUB_ISSUE_TITLE");
const branch = requireEnv("BRANCH");
const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];

const { agent, model } = resolveAgent(labels);
console.log(`Resolved provider model: ${model}`);

// Materialise the Codex subscription seat (auth.json + file credential store,
// OPENAI_* stripped) before the run — a no-op on the Claude Code default.
prepareCodexAuth(agent.name);

const result = await sandcastle.run({
  name: `implement-prd-#${prdNumber}-sub-#${subIssueNumber}`,
  agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  // Idle watchdog: fail the run if the agent produces no output for 10 minutes,
  // nested inside the workflow's outer 60-minute job timeout.
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: {
    PRD_NUMBER: prdNumber,
    PRD_TITLE: prdTitle,
    SUB_ISSUE_NUMBER: subIssueNumber,
    SUB_ISSUE_TITLE: subIssueTitle,
    BRANCH: branch,
  },
});

console.log(`\nImplementation finished for sub-issue #${subIssueNumber}.`);
console.log(`  commits this run: ${result.commits.length}`);
