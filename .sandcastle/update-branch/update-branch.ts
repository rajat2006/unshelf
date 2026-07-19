import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadCapabilityContext } from "../capability-context";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { runWithExtraction } from "../run-with-extraction";
import {
  updateBranchOutputSchema,
  type UpdateBranchOutput,
} from "../update-branch-output";

/**
 * The `update-branch` capability: bring a stale or conflicted PR branch current
 * with `main` by merging `origin/main` into it, resolving any conflicts, and
 * committing the merge.
 *
 * Invoked by `.github/workflows/agent-update-branch.yml` when a PR gets
 * `agent:update-branch`. A **two-phase** capability ({@link runWithExtraction}):
 * the produce pass merges `origin/main`, resolves conflicts (reasoning in prose),
 * runs the repo's checks, and commits; the resumed extraction pass emits the
 * summary + conflict list as one `<output>` block — so the agent never has to
 * both resolve a merge and serialise rigid JSON in one turn, and a malformed
 * block self-corrects via same-session retry (≤3×) before anything is posted.
 *
 * Per invariant H the runner emits ONLY commits + output files: the merge commit
 * lands on the branch (the workflow pushes it — a plain merge, so the push is
 * NOT a force-push) and `update_branch_comment.md` — a ready-to-post PR comment
 * body — is written to `OUTPUT_DIR`. The workflow pushes the refreshed branch
 * and posts that comment.
 */

const ctx = loadCapabilityContext();
console.log(`Resolved provider model: ${ctx.model}`);

// Same subscription-seat setup as the other agent phases — a no-op on the Claude
// Code default.
prepareCodexAuth(ctx.agent.name);

const result = await runWithExtraction({
  name: `update-branch-#${ctx.issueNumber}`,
  agent: ctx.agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  // Idle watchdog inside the workflow's 60-min job timeout, matching review.
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: ctx.promptArgs,
  extractionPrompt: fs.readFileSync(
    path.join(import.meta.dirname, "extraction.md"),
    "utf8",
  ),
  output: sandcastle.Output.object({
    tag: "output",
    schema: updateBranchOutputSchema,
  }),
});

fs.writeFileSync(
  path.join(ctx.outputDir, "update_branch_comment.md"),
  buildUpdateComment(result.output),
);

console.log(
  `\nUpdate-branch complete: ${result.output.alreadyCurrent ? "already current" : "merged main"}` +
    ` — ${result.output.conflicts.length} conflict(s) resolved.`,
);
console.log(`  ${result.output.summary}`);

/**
 * Build the PR-comment body the workflow posts. Leads with the one-line summary,
 * then lists each resolved conflict so a reviewer can spot-check the merge
 * resolutions. An already-current branch (or a clean merge with no conflicts)
 * gets just the summary — there is nothing to spot-check.
 */
function buildUpdateComment(output: UpdateBranchOutput): string {
  const body: string[] = ["## 🔄 Branch update", "", output.summary, ""];

  if (output.alreadyCurrent) {
    body.push("The branch was already current with `main` — no merge was made.");
  } else if (output.conflicts.length === 0) {
    body.push("Merged `main` in cleanly — no conflicts.");
  } else {
    body.push(`### Conflicts resolved (${output.conflicts.length})`, "");
    for (const c of output.conflicts) {
      body.push(`- \`${c.file}\` — ${c.resolution}`);
    }
  }

  return `${body.join("\n")}\n`;
}
