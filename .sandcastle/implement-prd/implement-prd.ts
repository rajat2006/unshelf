import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadCapabilityContext } from "../capability-context";
import { prepareCodexAuth } from "../prepare-codex-auth";

/**
 * The `implement-prd` capability: work a PRD-shaped issue (a parent with
 * sub-issues) into commits on its branch — the whole spec landed as one coherent
 * change rather than issue-by-issue.
 *
 * Invoked by `.github/workflows/agent-implement-prd.yml` AFTER the branch is cut
 * from `main`. Structurally identical to `implement` — it calls `run()` directly
 * (no structured output; the *work is the commits*, which the workflow pushes)
 * and guards on a non-zero commit count — the only difference is the PRD-aware
 * prompt, which pulls the parent plus every sub-issue before writing code. The
 * disambiguation from the normal `implement` path is the workflow's shape-guard
 * (sub-issue presence), so exactly one of the two runs per issue.
 */

const ctx = loadCapabilityContext();
console.log(`Resolved provider model: ${ctx.model}`);

// Materialise the Codex subscription seat (auth.json + file credential store,
// OPENAI_* stripped) before the run — a no-op on the Claude Code default.
prepareCodexAuth(ctx.agent.name);

const result = await sandcastle.run({
  name: `implement-prd-#${ctx.issueNumber}`,
  agent: ctx.agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  // Idle watchdog: fail the run if the agent produces no output for 10 minutes,
  // nested inside the workflow's outer 60-minute job timeout (spec §guardrails).
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: ctx.promptArgs,
});

const commitsAhead = Number(
  execSync("git rev-list --count main..HEAD", { encoding: "utf8" }).trim(),
);
if (!Number.isFinite(commitsAhead) || commitsAhead === 0) {
  fail("Agent finished but made no commits on the branch.");
}

console.log(
  `\nPRD implementation produced ${commitsAhead} commit(s) on ${ctx.branch}.`,
);
console.log(`  commits captured this run: ${result.commits.length}`);

/**
 * Fail the run: write the reason where the workflow's `failure()` step reads it
 * (to comment on the issue) and exit non-zero.
 */
function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  fs.writeFileSync(path.join(ctx.outputDir, "failure_reason.txt"), message);
  process.exit(1);
}
