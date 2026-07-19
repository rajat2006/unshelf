import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadCapabilityContext } from "../capability-context";
import { parseDiffLines } from "../parse-diff-lines";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { reviewOutputSchema, type ReviewOutput } from "../review-output";
import { runWithExtraction } from "../run-with-extraction";

/**
 * The `review` capability: drive the repo's local `/code-review` over the PR
 * branch and emit its findings as one structured `<output>` block.
 *
 * Invoked by `.github/workflows/agent-review.yml` when a PR gets `agent:review`.
 * This is a **two-phase** capability ({@link runWithExtraction}): the produce
 * pass runs `/code-review` (a heavy, sub-agent-spawning analysis) reasoning in
 * prose, then a resumed extraction pass emits the findings JSON — so the agent
 * never has to both review and serialise rigid JSON in one turn, and a malformed
 * block self-corrects via same-session retry (≤3×) before anything is posted.
 *
 * The runner emits ONLY files (spec invariant H — no git/gh/label mutation):
 * `review_comment.md` (the findings, ready to post) is written to `OUTPUT_DIR`;
 * the workflow posts it and runs `gh pr ready`.
 */

const REVIEW_BASE = "origin/main";

const ctx = loadCapabilityContext();
console.log(`Resolved provider model: ${ctx.model}`);

// Same subscription-seat setup as the other agent phases — a no-op on the Claude
// Code default.
prepareCodexAuth(ctx.agent.name);

const result = await runWithExtraction({
  name: `review-#${ctx.issueNumber}`,
  agent: ctx.agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  // Idle watchdog inside the workflow's 60-min job timeout, matching implement.
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: ctx.promptArgs,
  extractionPrompt: fs.readFileSync(
    path.join(import.meta.dirname, "extraction.md"),
    "utf8",
  ),
  output: sandcastle.Output.object({ tag: "output", schema: reviewOutputSchema }),
});

// Cross-check each finding's line anchor against the lines the PR actually
// touched, so the posted comment can't point at a line the change never changed.
const diff = execSync(`git diff ${REVIEW_BASE}...HEAD`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const changed = parseDiffLines(diff);

const { markdown, anchored, dropped } = renderReviewComment(result.output, changed);
fs.writeFileSync(path.join(ctx.outputDir, "review_comment.md"), markdown);

console.log(
  `\nReview complete: ${result.output.findings.length} finding(s) ` +
    `(${anchored} line-anchored, ${dropped} anchor(s) dropped as out-of-diff).`,
);
console.log(`  ${result.output.summary}`);

/**
 * Render the findings as the Markdown comment the workflow posts. Findings are
 * grouped by axis and each renders `file:line` only when its line is genuinely a
 * changed line in the diff; an anchor outside the diff is dropped to `file`
 * (never silently rewritten to a wrong line). Returns the counts for logging.
 */
function renderReviewComment(
  review: ReviewOutput,
  changedLines: Map<string, Set<number>>,
): { markdown: string; anchored: number; dropped: number } {
  let anchored = 0;
  let dropped = 0;

  const lines: string[] = ["## 🤖 Automated review", "", review.summary, ""];

  if (review.findings.length === 0) {
    lines.push("No standards or spec findings — the branch is clean.");
    return { markdown: `${lines.join("\n")}\n`, anchored, dropped };
  }

  for (const axis of ["standards", "spec"] as const) {
    const axisFindings = review.findings.filter((f) => f.axis === axis);
    if (axisFindings.length === 0) {
      continue;
    }

    const heading = axis === "standards" ? "Standards" : "Spec";
    lines.push(`### ${heading} (${axisFindings.length})`, "");

    for (const f of axisFindings) {
      const inDiff = f.line !== undefined && changedLines.get(f.file)?.has(f.line);
      if (f.line !== undefined) {
        if (inDiff) {
          anchored += 1;
        } else {
          dropped += 1;
        }
      }
      const location = inDiff ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
      lines.push(
        `- **[${f.severity}]** ${location} — ${f.title}`,
        `  ${f.detail}`,
      );
    }
    lines.push("");
  }

  return { markdown: `${lines.join("\n")}\n`, anchored, dropped };
}
