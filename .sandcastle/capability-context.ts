import { resolveAgent, type ResolvedAgent } from "./resolve-agent";
import { requireEnv } from "./require-env";

/**
 * Everything a capability run() script needs from the workflow-supplied
 * environment — the issue coordinates, the output directory, and the provider
 * resolved from the issue's label set — assembled once. Extends
 * {@link ResolvedAgent} so `agent`/`model` sit alongside the rest.
 */
export interface CapabilityContext extends ResolvedAgent {
  readonly issueNumber: string;
  readonly issueTitle: string;
  readonly branch: string;
  /** Directory the workflow reads output files back from (`runner.temp`). */
  readonly outputDir: string;
  /** The issue's full label set. */
  readonly labels: readonly string[];
  /** Ready to spread into `run()`'s `promptArgs` for `{{ISSUE_NUMBER}}` etc. */
  readonly promptArgs: {
    readonly ISSUE_NUMBER: string;
    readonly ISSUE_TITLE: string;
    readonly BRANCH: string;
  };
}

/**
 * Assemble the {@link CapabilityContext} from `process.env`. Every `agent-*.yml`
 * workflow sets the same env contract before invoking a capability script, so
 * this is the one place that reads it.
 *
 * The provider is resolved from the issue's FULL label set (`AGENT_LABELS`, a
 * JSON array), not just the just-added trigger label — that is what lets the
 * `agent:codex` provider label be applied independently of `agent:implement`.
 *
 * Required vars (`ISSUE_NUMBER`, `ISSUE_TITLE`, `BRANCH`, `OUTPUT_DIR`) throw via
 * {@link requireEnv} when missing — a missing one is a workflow wiring bug that
 * should land the issue in `agent:blocked`, not run against a silent default.
 */
export function loadCapabilityContext(): CapabilityContext {
  const issueNumber = requireEnv("ISSUE_NUMBER");
  const issueTitle = requireEnv("ISSUE_TITLE");
  const branch = requireEnv("BRANCH");
  const outputDir = requireEnv("OUTPUT_DIR");
  const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];

  return {
    issueNumber,
    issueTitle,
    branch,
    outputDir,
    labels,
    ...resolveAgent(labels),
    promptArgs: {
      ISSUE_NUMBER: issueNumber,
      ISSUE_TITLE: issueTitle,
      BRANCH: branch,
    },
  };
}
