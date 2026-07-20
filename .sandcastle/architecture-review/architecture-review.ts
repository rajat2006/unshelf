import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { architectureReviewOutputSchema } from "../architecture-review-output";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { requireEnv } from "../require-env";
import { resolveAgent } from "../resolve-agent";
import { runWithExtraction } from "../run-with-extraction";

/**
 * The `architecture-review` capability: sweep the codebase on `main` for the
 * single freshest **deepening opportunity** and propose it as a PRD — the
 * autonomous, GitHub-native analogue of CVM's interactive
 * `/improve-codebase-architecture`.
 *
 * Invoked by `.github/workflows/agent-architecture-review.yml` on a weekday cron
 * and via `workflow_dispatch` — NOT by a label, so unlike the other capabilities
 * there is no originating issue/PR. It therefore reads its own minimal env (the
 * past proposals to dedupe against, an optional provider label set, `OUTPUT_DIR`)
 * instead of {@link import("../capability-context").loadCapabilityContext},
 * which is issue-shaped.
 *
 * A **two-phase** capability ({@link runWithExtraction}): the produce pass
 * surveys the tree in prose (read-only — it commits nothing), the resumed
 * extraction pass emits the `proposed | skipped` decision. It does NOT drive the
 * interactive `/improve-codebase-architecture` skill (that one is
 * `disable-model-invocation` and needs an HTML report + a human to grill through
 * candidates); the survey is described directly in the prompt using the
 * `/codebase-design` deep-module vocabulary.
 *
 * Per invariant H the runner only writes output files: `architecture_status.txt`
 * (`proposed`/`skipped`) and `architecture_summary.txt` (the `oneLineSummary` when
 * proposed, the `reason` when skipped). When `proposed` it also writes
 * `architecture_candidates.txt` (the candidates weighed, one per line, for the
 * Actions summary), `prd_title.txt`, and `prd_body.txt`. The workflow opens the
 * PRD, labels it, and writes the run summary.
 */

const outputDir = requireEnv("OUTPUT_DIR");
// No issue ⇒ no label set of its own; the provider defaults to Claude Code
// (absence *is* Claude). A manual `workflow_dispatch` can still opt into Codex,
// which the workflow serialises into AGENT_LABELS just like the issue flows.
const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];
const { agent, model, effort } = resolveAgent(labels, "architecture-review");
console.log(`Resolved provider model: ${model} (effort: ${effort})`);

// The titles of every past `source:architecture-review` proposal — OPEN and
// CLOSED — so the agent proposes something genuinely fresh and never re-raises an
// opportunity already accepted, completed, or explicitly rejected (CVM dedupes
// against the full history, not just the open backlog).
const pastProposals = JSON.parse(
  process.env.EXISTING_PROPOSALS ?? "[]",
) as string[];
const proposalList =
  pastProposals.length > 0
    ? pastProposals.map((t) => `- ${t}`).join("\n")
    : "_(none yet — nothing has been proposed before)_";

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
  promptArgs: { EXISTING_PROPOSALS: proposalList },
  extractionPrompt: fs.readFileSync(
    path.join(import.meta.dirname, "extraction.md"),
    "utf8",
  ),
  output: sandcastle.Output.object({
    tag: "output",
    schema: architectureReviewOutputSchema,
  }),
});

const out = result.output;
fs.writeFileSync(path.join(outputDir, "architecture_status.txt"), out.status);

if (out.status === "proposed") {
  fs.writeFileSync(
    path.join(outputDir, "architecture_summary.txt"),
    out.oneLineSummary,
  );
  fs.writeFileSync(
    path.join(outputDir, "architecture_candidates.txt"),
    out.candidatesConsidered.join("\n"),
  );
  fs.writeFileSync(path.join(outputDir, "prd_title.txt"), out.title);
  fs.writeFileSync(path.join(outputDir, "prd_body.txt"), out.body);
  console.log(
    `\nProposed a PRD (${out.candidatesConsidered.length} candidate(s) considered): ${out.title}`,
  );
  console.log(`  ${out.oneLineSummary}`);
} else {
  fs.writeFileSync(path.join(outputDir, "architecture_summary.txt"), out.reason);
  console.log(`\nSkipped — ${out.reason}`);
}
