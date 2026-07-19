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
 * open proposals to dedupe against, an optional provider label set, `OUTPUT_DIR`)
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
 * Per invariant H the runner only writes output files: `architecture_outcome.txt`
 * (`proposed`/`skipped`), `architecture_summary.txt`, and — when `proposed` —
 * `prd_title.txt` + `prd_body.txt`. The workflow opens the PRD and labels it.
 */

const outputDir = requireEnv("OUTPUT_DIR");
// No issue ⇒ no label set of its own; the provider defaults to Claude Code
// (absence *is* Claude). A manual `workflow_dispatch` can still opt into Codex,
// which the workflow serialises into AGENT_LABELS just like the issue flows.
const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];
const { agent, model } = resolveAgent(labels);
console.log(`Resolved provider model: ${model}`);

// The titles of the currently-open `source:architecture-review` proposals — the
// workflow gathers them so the agent proposes something *fresh* rather than
// re-raising an opportunity already sitting in the backlog (CVM's dedupe step).
const openProposals = JSON.parse(
  process.env.EXISTING_PROPOSALS ?? "[]",
) as string[];
const proposalList =
  openProposals.length > 0
    ? openProposals.map((t) => `- ${t}`).join("\n")
    : "_(none yet — the backlog is empty)_";

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

fs.writeFileSync(
  path.join(outputDir, "architecture_outcome.txt"),
  result.output.outcome,
);
fs.writeFileSync(
  path.join(outputDir, "architecture_summary.txt"),
  result.output.summary,
);

if (result.output.outcome === "proposed") {
  // The refinement guarantees both are present when proposed.
  fs.writeFileSync(
    path.join(outputDir, "prd_title.txt"),
    result.output.prdTitle ?? "",
  );
  fs.writeFileSync(
    path.join(outputDir, "prd_body.txt"),
    result.output.prdBody ?? "",
  );
  console.log(`\nProposed a PRD: ${result.output.prdTitle}`);
} else {
  console.log(`\nSkipped — ${result.output.reason ?? result.output.summary}`);
}
console.log(`  ${result.output.summary}`);
