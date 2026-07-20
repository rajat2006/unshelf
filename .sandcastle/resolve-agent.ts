import * as os from "node:os";
import * as path from "node:path";
import { claudeCode, codex } from "@ai-hero/sandcastle";
import type { AgentProvider } from "@ai-hero/sandcastle";

/**
 * The one provider label. Its presence opts an issue into Codex; its absence is
 * Claude Code. There is deliberately no `agent:claude` label — a default needs
 * no label, and absence *is* Claude (spec §C).
 */
export const CODEX_LABEL = "agent:codex";

/**
 * The reasoning-effort levels each provider accepts, derived from Sandcastle's
 * own factory-option types rather than restated literal unions — a Sandcastle
 * upgrade that drops or renames a level breaks this typecheck rather than the
 * runner (US-17). Claude Code accepts `low | medium | high | xhigh | max`
 * (`max` is Opus-only); Codex accepts `low | medium | high | xhigh` (no `max`).
 */
type ClaudeEffort = NonNullable<
  NonNullable<Parameters<typeof claudeCode>[1]>["effort"]
>;
type CodexEffort = NonNullable<
  NonNullable<Parameters<typeof codex>[1]>["effort"]
>;

/**
 * The closed set of Sandcastle capabilities. Every entry has one row in
 * {@link CAPABILITY_POLICY}; a `Record<Capability, …>` makes a missing policy
 * entry a compile-time error, and a capability not in this union cannot be
 * resolved — so adding a runner forces a deliberate model choice (US-7, US-16)
 * rather than inheriting a silent global default.
 */
export type Capability =
  | "implement"
  | "write-pr"
  | "implement-prd"
  | "write-prd-pr"
  | "review"
  | "implement-pr"
  | "update-branch"
  | "to-issues"
  | "architecture-review"
  | "explore";

/** One provider's model + reasoning effort for a capability. */
interface ProviderPolicy<Effort> {
  readonly model: string;
  readonly effort: Effort;
}

/** A capability's full policy: how each provider runs it. */
interface CapabilityPolicy {
  readonly claude: ProviderPolicy<ClaudeEffort>;
  readonly codex: ProviderPolicy<CodexEffort>;
}

/** The one Codex model, uniform across every capability. */
export const CODEX_MODEL = "gpt-5.6-sol";

/**
 * Build tier — the model for capabilities that write code. They run lean on
 * Claude Code's strongest coding model and let `review`'s Spec axis carry the
 * completeness check (US-8). A capability belongs to this tier iff its policy
 * entry names this constant.
 */
export const BUILD_CLAUDE_MODEL = "claude-opus-4-8";

/**
 * Think tier — the model for judgement-dense capabilities (reviewing,
 * decomposing, surveying, exploring, PR-authoring). They carry the stronger
 * reasoning model; the effort is layered per capability in the policy below.
 */
export const THINK_CLAUDE_MODEL = "claude-fable-5";

/**
 * The capability policy (issue #88). Every capability names its Claude and Codex
 * model and effort independently; the tier a capability belongs to is legible
 * from which model constant its entry references. Build-tier capabilities stay
 * at `medium`; the four judgement-dense capabilities that most change downstream
 * outcomes (`review`, `to-issues`, `architecture-review`, `explore`) carry the
 * higher effort each provider offers (`high` for Claude, `xhigh` for Codex —
 * the top level both providers share).
 */
const CAPABILITY_POLICY: Record<Capability, CapabilityPolicy> = {
  implement: {
    claude: { model: BUILD_CLAUDE_MODEL, effort: "medium" },
    codex: { model: CODEX_MODEL, effort: "medium" },
  },
  "implement-prd": {
    claude: { model: BUILD_CLAUDE_MODEL, effort: "medium" },
    codex: { model: CODEX_MODEL, effort: "medium" },
  },
  "implement-pr": {
    claude: { model: BUILD_CLAUDE_MODEL, effort: "medium" },
    codex: { model: CODEX_MODEL, effort: "medium" },
  },
  "update-branch": {
    claude: { model: BUILD_CLAUDE_MODEL, effort: "medium" },
    codex: { model: CODEX_MODEL, effort: "medium" },
  },
  "write-pr": {
    claude: { model: THINK_CLAUDE_MODEL, effort: "medium" },
    codex: { model: CODEX_MODEL, effort: "medium" },
  },
  "write-prd-pr": {
    claude: { model: THINK_CLAUDE_MODEL, effort: "medium" },
    codex: { model: CODEX_MODEL, effort: "medium" },
  },
  review: {
    claude: { model: THINK_CLAUDE_MODEL, effort: "high" },
    codex: { model: CODEX_MODEL, effort: "xhigh" },
  },
  "to-issues": {
    claude: { model: THINK_CLAUDE_MODEL, effort: "high" },
    codex: { model: CODEX_MODEL, effort: "xhigh" },
  },
  "architecture-review": {
    claude: { model: THINK_CLAUDE_MODEL, effort: "high" },
    codex: { model: CODEX_MODEL, effort: "xhigh" },
  },
  explore: {
    claude: { model: THINK_CLAUDE_MODEL, effort: "high" },
    codex: { model: CODEX_MODEL, effort: "xhigh" },
  },
};

export interface ResolvedAgent {
  /** The Sandcastle agent provider to hand to `run({ agent })`. */
  readonly agent: AgentProvider;
  /** The model string the provider was built with (surfaced for logging/tests). */
  readonly model: string;
  /** The reasoning effort the provider was built with (surfaced for logging/tests). */
  readonly effort: ClaudeEffort | CodexEffort;
}

/**
 * Resolve which coding agent works a subject, and with what model and effort,
 * from its full label set and the capability being executed.
 *
 * The label set chooses the provider — `agent:codex` present → Codex, absent →
 * Claude Code (absence *is* Claude, the only provider switch, read from the
 * whole label set rather than a single just-added label). The capability then
 * chooses that provider's model and effort from {@link CAPABILITY_POLICY}, so a
 * read-only exploration, an implementation, and a review can each carry the
 * reasoning profile they need without changing a provider-wide constant.
 */
export function resolveAgent(
  labels: readonly string[],
  capability: Capability,
): ResolvedAgent {
  const policy = CAPABILITY_POLICY[capability];

  if (labels.includes(CODEX_LABEL)) {
    const { model, effort } = policy.codex;
    return {
      agent: codex(model, {
        effort,
        // Codex writes sessions below CODEX_HOME. Sandcastle otherwise searches
        // ~/.codex/sessions when resuming the produce pass for extraction, which
        // differs from the Actions runner's temporary CODEX_HOME.
        sessionStorage: {
          hostSessionsDir: path.join(
            process.env.CODEX_HOME ??
              path.join(process.env.HOME ?? os.homedir(), ".codex"),
            "sessions",
          ),
        },
      }),
      model,
      effort,
    };
  }

  const { model, effort } = policy.claude;
  return {
    agent: claudeCode(model, { effort }),
    model,
    effort,
  };
}
