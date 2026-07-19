import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadCapabilityContext } from "../capability-context";
import {
  implementPrOutputSchema,
  type ImplementPrOutput,
} from "../implement-pr-output";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { requireEnv } from "../require-env";
import { runWithExtraction } from "../run-with-extraction";

/**
 * The `implement-pr` capability: address the review comments on an open PR.
 *
 * Invoked by `.github/workflows/agent-implement-pr.yml` when a PR gets
 * `agent:implement-pr`. A **two-phase** capability ({@link runWithExtraction}):
 * the produce pass reads the PR's review threads, changes what it safely can,
 * runs the repo's checks, and commits the fixes (reasoning in prose); the resumed
 * extraction pass emits one structured `<output>` block recording what it
 * addressed vs deferred — so the agent never has to both do the work and
 * serialise rigid JSON in one turn, and a malformed block self-corrects via
 * same-session retry (≤3×) before anything is posted.
 *
 * Per invariant H the runner emits ONLY commits + output files: the fix commits
 * land on the branch (the workflow pushes them) and `pr_comment.md` — a
 * Markdown summary of what was addressed/deferred — is written to `OUTPUT_DIR`.
 * The workflow pushes the commits and posts that summary as a PR comment. It
 * does NOT flip the PR's draft/ready state — implement-pr only answers review
 * comments; the ready transition belongs to review.
 */

const ctx = loadCapabilityContext();
// The PR whose review comments we are addressing. Its number is the subject; the
// prompt reads its threads via `gh`. Kept separate from ISSUE_NUMBER (the
// originating spec issue) so the prompt can reference both.
const prNumber = requireEnv("PR_NUMBER");
console.log(`Resolved provider model: ${ctx.model}`);

// Same subscription-seat setup as the other agent phases — a no-op on the Claude
// Code default.
prepareCodexAuth(ctx.agent.name);

const result = await runWithExtraction({
  name: `implement-pr-#${prNumber}`,
  agent: ctx.agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  // Idle watchdog inside the workflow's 60-min job timeout, matching implement.
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  // PR_NUMBER augments the shared promptArgs (ISSUE_NUMBER/ISSUE_TITLE/BRANCH) so
  // the prompt can point the agent at the PR's own review threads.
  promptArgs: { ...ctx.promptArgs, PR_NUMBER: prNumber },
  extractionPrompt: fs.readFileSync(
    path.join(import.meta.dirname, "extraction.md"),
    "utf8",
  ),
  output: sandcastle.Output.object({
    tag: "output",
    schema: implementPrOutputSchema,
  }),
});

const { body, addressed, deferred } = buildSummaryComment(result.output);
fs.writeFileSync(path.join(ctx.outputDir, "pr_comment.md"), body);

console.log(
  `\nimplement-pr complete: ${result.output.items.length} comment(s) — ` +
    `${addressed} addressed, ${deferred} deferred.`,
);
console.log(`  ${result.output.summary}`);

/**
 * Build the Markdown the workflow posts as a single PR comment. Groups the items
 * into what was fixed-and-committed vs what was left for a human, so the reviewer
 * can see at a glance which threads the push resolved. Returns the body and the
 * counts for logging.
 */
function buildSummaryComment(review: ImplementPrOutput): {
  body: string;
  addressed: number;
  deferred: number;
} {
  const addressed = review.items.filter((i) => i.status === "addressed");
  const deferred = review.items.filter((i) => i.status === "deferred");

  const lines: string[] = [
    "## 🤖 Addressed review comments",
    "",
    review.summary,
    "",
  ];

  if (review.items.length === 0) {
    lines.push("No actionable review comments were found on the PR.");
  }

  if (addressed.length > 0) {
    lines.push(`### ✅ Addressed (${addressed.length})`, "");
    for (const i of addressed) {
      const where = i.file ? ` \`${i.file}\`` : "";
      lines.push(`-${where} **${i.comment}**`, `  ${i.action}`);
    }
    lines.push("");
  }

  if (deferred.length > 0) {
    lines.push(`### 🔎 Deferred for a human (${deferred.length})`, "");
    for (const i of deferred) {
      const where = i.file ? ` \`${i.file}\`` : "";
      lines.push(`-${where} **${i.comment}**`, `  ${i.action}`);
    }
    lines.push("");
  }

  return {
    body: `${lines.join("\n")}\n`,
    addressed: addressed.length,
    deferred: deferred.length,
  };
}
