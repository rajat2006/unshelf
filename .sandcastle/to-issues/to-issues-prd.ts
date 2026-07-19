import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { loadCapabilityContext } from "../capability-context";
import { prepareCodexAuth } from "../prepare-codex-auth";
import { runWithRetry } from "../run-with-retry";
import {
  type ChildIssue,
  renderChildIssueBody,
  toIssuesOutputSchema,
} from "../to-issues-output";

/**
 * The `to-issues-prd` capability: decompose a PRD issue into agent-sized child
 * issues.
 *
 * Invoked by `.github/workflows/agent-to-issues.yml` when a human applies
 * `agent:to-issues` to a PRD. The agent only *reads* the PRD and *emits* the
 * decomposition — it creates nothing. Because the structured output IS the work
 * (no branch, no commits, no files touched), this uses {@link runWithRetry} (not
 * the two-phase extraction wrapper): one combined prompt reads and emits,
 * retrying the same session on a malformed or non-conforming `<output>` block.
 *
 * The children are written to `outputDir` as JSON for the workflow's
 * `gh issue create` + sub-issue-link steps, keeping every `gh` and label
 * mutation in the workflow (invariant H).
 */

const ctx = loadCapabilityContext();
console.log(`Resolved provider model: ${ctx.model}`);

// Same subscription-seat setup as every other capability — this phase runs the
// agent, so it authenticates identically (a no-op on the Claude Code default).
prepareCodexAuth(ctx.agent.name);

const result = await runWithRetry({
  name: `to-issues-#${ctx.issueNumber}`,
  agent: ctx.agent,
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: ctx.promptArgs,
  output: sandcastle.Output.object({
    tag: "output",
    schema: toIssuesOutputSchema,
  }),
});

// Deterministically render each child's body from its structured fields — the
// agent supplies the content, the runner owns the shape (parent back-reference +
// acceptance checklist), so a malformed body can never be published verbatim.
const rendered = result.output.children.map((child: ChildIssue) => ({
  title: child.title,
  body: renderChildIssueBody(child, ctx.issueNumber),
}));

fs.writeFileSync(
  path.join(ctx.outputDir, "child_issues.json"),
  JSON.stringify(rendered, null, 2),
);
fs.writeFileSync(
  path.join(ctx.outputDir, "to_issues_summary.txt"),
  result.output.summary,
);

console.log(`\nWrote ${rendered.length} child issue(s) to ${ctx.outputDir}`);
for (const c of rendered) {
  console.log(`  - ${c.title}`);
}
