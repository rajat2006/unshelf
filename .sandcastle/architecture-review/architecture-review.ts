import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { requireEnv } from "../require-env";
import { resolveAgent } from "../resolve-agent";
import { runWithExtraction } from "../run-with-extraction";
import {
  ARCHITECTURE_SEVERITIES,
  type ArchitectureReviewOutput,
  type ArchitectureSeverity,
  architectureReviewOutputSchema,
} from "../architecture-review-output";

/**
 * The `architecture-review` capability: sweep the whole codebase on `main` for
 * structural drift and deepening opportunities, and emit them as one structured
 * `<output>` block.
 *
 * Invoked by `.github/workflows/agent-architecture-review.yml` on a cron
 * schedule and via `workflow_dispatch` — NOT by a label, so unlike the other
 * capabilities there is no originating issue/PR. It therefore reads its own
 * minimal env (an optional label set for the provider + `OUTPUT_DIR`) instead of
 * {@link import("../capability-context").loadCapabilityContext}, which is
 * issue-shaped.
 *
 * A **two-phase** capability ({@link runWithExtraction}): the produce pass drives
 * the repo's local `/improve-codebase-architecture` skill and reasons in prose;
 * the resumed extraction pass emits the findings JSON — so a malformed block
 * self-corrects via same-session retry (≤3×) before anything is posted.
 *
 * Read-only by design: it surveys and reports, it does NOT commit. Per invariant
 * H the runner only writes output files — `architecture_report.md` (the durable
 * tracking-issue body) and `architecture_summary.txt` (the one-line headline) go
 * to `OUTPUT_DIR`; the workflow opens or refreshes the tracking issue from them.
 */

const outputDir = requireEnv("OUTPUT_DIR");
// No issue ⇒ no label set of its own; the provider defaults to Claude Code
// (absence *is* Claude). A manual `workflow_dispatch` can still opt into Codex,
// which the workflow serialises into AGENT_LABELS just like the issue flows.
const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];
const { agent, model } = resolveAgent(labels);
console.log(`Resolved provider model: ${model}`);

// Same subscription-seat setup as the other agent phases — a no-op on the Claude
// Code default.
prepareCodexAuth(agent.name);

const result = await runWithExtraction({
  name: "architecture-review",
  agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  // Idle watchdog inside the workflow's 60-min job timeout, matching the other
  // capabilities.
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  extractionPrompt: fs.readFileSync(
    path.join(import.meta.dirname, "extraction.md"),
    "utf8",
  ),
  output: sandcastle.Output.object({
    tag: "output",
    schema: architectureReviewOutputSchema,
  }),
});

const report = renderReport(result.output);
fs.writeFileSync(path.join(outputDir, "architecture_report.md"), report);
fs.writeFileSync(
  path.join(outputDir, "architecture_summary.txt"),
  result.output.summary,
);

console.log(
  `\nArchitecture review complete: ${result.output.findings.length} finding(s).`,
);
console.log(`  ${result.output.summary}`);

/**
 * Render the findings as the Markdown body of the durable tracking issue,
 * grouped worst-severity-first so a maintainer scanning the issue sees the high
 * findings before the low ones. The workflow prepends a provenance header (ref,
 * SHA, run link) before posting, so this returns the findings section only.
 */
function renderReport(review: ArchitectureReviewOutput): string {
  const lines: string[] = [review.summary, ""];

  if (review.findings.length === 0) {
    lines.push(
      "No architectural drift or deepening opportunities surfaced this run — " +
        "the codebase is clean against `CONTEXT.md` and the ADRs.",
      "",
    );
    return `${lines.join("\n")}\n`;
  }

  for (const severity of ARCHITECTURE_SEVERITIES) {
    const bucket = review.findings.filter((f) => f.severity === severity);
    if (bucket.length === 0) continue;
    lines.push(`## ${severityHeading(severity)} (${bucket.length})`, "");
    for (const f of bucket) {
      lines.push(`- **[${f.category}]** \`${f.area}\` — ${f.title}`, `  ${f.detail}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

/** Human heading for a severity bucket. */
function severityHeading(severity: ArchitectureSeverity): string {
  return { high: "🔴 High", medium: "🟠 Medium", low: "🟡 Low" }[severity];
}
