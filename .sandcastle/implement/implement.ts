import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadCapabilityContext } from "../capability-context";

/**
 * The `implement` capability: work a ready issue into commits on its branch.
 *
 * Invoked by `.github/workflows/agent-implement.yml` AFTER the branch is cut
 * from `main`. This is the one capability that calls `run()` directly — no
 * structured output, neither wrapper — because the *work is the commits*, which
 * the workflow (not the agent) pushes. There is nothing to extract.
 *
 * The only post-run guard is a commit-count check: a run that finished without
 * committing anything fails loudly (writing the reason for the workflow's
 * blocked path) rather than pushing an empty branch and opening an empty PR.
 */

const ctx = loadCapabilityContext();
console.log(`Resolved provider model: ${ctx.model}`);

const result = await sandcastle.run({
  name: `implement-#${ctx.issueNumber}`,
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
  `\nImplementation produced ${commitsAhead} commit(s) on ${ctx.branch}.`,
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
