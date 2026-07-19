import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadIssueCapabilityContext } from "../capability-context";
import { exploreOutputSchema } from "../explore-output";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { runWithExtraction } from "../run-with-extraction";

/**
 * Investigate one issue without implementing it, then write the structured
 * assessment for the workflow to publish as an issue comment.
 *
 * The produce pass performs the potentially long repository investigation; the
 * resumed extraction pass serialises that completed assessment without asking
 * the agent to repeat its work. The runner mutates no GitHub state and writes no
 * repository files — `comment.md` in `OUTPUT_DIR` is its only artifact.
 */

const ctx = loadIssueCapabilityContext();
console.log(`Resolved provider model: ${ctx.model}`);

prepareCodexAuth(ctx.agent.name);

const result = await runWithExtraction({
  name: `explore-#${ctx.issueNumber}`,
  agent: ctx.agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  idleTimeoutSeconds: 600,
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: ctx.promptArgs,
  extractionPrompt: fs.readFileSync(
    path.join(import.meta.dirname, "extraction.md"),
    "utf8",
  ),
  output: sandcastle.Output.object({
    tag: "output",
    schema: exploreOutputSchema,
  }),
});

fs.writeFileSync(path.join(ctx.outputDir, "comment.md"), result.output.comment);
console.log(`Exploration comment written for issue #${ctx.issueNumber}.`);
