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

/**
 * The env contract shared by the PRD-mode capabilities. Both read the PRD
 * coordinates, the output dir, and the provider resolved from the PRD's full
 * label set; {@link PrdImplementContext} extends it with the one sub-issue being
 * worked. Kept in this module so PRD scripts route through the same seam as the
 * single-issue capabilities rather than each re-parsing `process.env`.
 */
export interface PrdPrContext extends ResolvedAgent {
  readonly prdNumber: string;
  readonly prdTitle: string;
  /** Directory the workflow reads output files back from (`runner.temp`). */
  readonly outputDir: string;
  /** The PRD's full label set. */
  readonly labels: readonly string[];
  readonly promptArgs: {
    readonly PRD_NUMBER: string;
    readonly PRD_TITLE: string;
  };
}

/**
 * Everything the `implement-prd` capability needs: the PRD coordinates plus the
 * single sub-issue this run works (the PRD workflow advances one sub-issue per
 * run), all on the resumed accumulating branch.
 */
export interface PrdImplementContext extends PrdPrContext {
  readonly subIssueNumber: string;
  readonly subIssueTitle: string;
  readonly branch: string;
  readonly promptArgs: {
    readonly PRD_NUMBER: string;
    readonly PRD_TITLE: string;
    readonly SUB_ISSUE_NUMBER: string;
    readonly SUB_ISSUE_TITLE: string;
    readonly BRANCH: string;
  };
}

/**
 * Assemble the {@link PrdPrContext} for `write-prd-pr` from `process.env`. Reads
 * only the PRD coordinates (the PR body describes the whole PRD, not a single
 * sub-issue) and resolves the provider from the PRD's full label set. Required
 * vars throw via {@link requireEnv}.
 */
export function loadPrdPrContext(): PrdPrContext {
  const prdNumber = requireEnv("PRD_NUMBER");
  const prdTitle = requireEnv("PRD_TITLE");
  const outputDir = requireEnv("OUTPUT_DIR");
  const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];

  return {
    prdNumber,
    prdTitle,
    outputDir,
    labels,
    ...resolveAgent(labels),
    promptArgs: {
      PRD_NUMBER: prdNumber,
      PRD_TITLE: prdTitle,
    },
  };
}

/**
 * Assemble the {@link PrdImplementContext} for `implement-prd` from
 * `process.env` — the PRD coordinates plus the single sub-issue this run works
 * (`SUB_ISSUE_NUMBER`/`SUB_ISSUE_TITLE`) and the accumulating `BRANCH`. Provider
 * is resolved from the PRD's full label set, the same seam every other capability
 * uses. Required vars throw via {@link requireEnv}.
 */
export function loadPrdImplementContext(): PrdImplementContext {
  const prdNumber = requireEnv("PRD_NUMBER");
  const prdTitle = requireEnv("PRD_TITLE");
  const subIssueNumber = requireEnv("SUB_ISSUE_NUMBER");
  const subIssueTitle = requireEnv("SUB_ISSUE_TITLE");
  const branch = requireEnv("BRANCH");
  const outputDir = requireEnv("OUTPUT_DIR");
  const labels = JSON.parse(process.env.AGENT_LABELS ?? "[]") as string[];

  return {
    prdNumber,
    prdTitle,
    subIssueNumber,
    subIssueTitle,
    branch,
    outputDir,
    labels,
    ...resolveAgent(labels),
    promptArgs: {
      PRD_NUMBER: prdNumber,
      PRD_TITLE: prdTitle,
      SUB_ISSUE_NUMBER: subIssueNumber,
      SUB_ISSUE_TITLE: subIssueTitle,
      BRANCH: branch,
    },
  };
}
