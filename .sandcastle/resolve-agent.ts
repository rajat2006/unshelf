import { claudeCode, codex } from "@ai-hero/sandcastle";
import type { AgentProvider } from "@ai-hero/sandcastle";

/**
 * The one provider label. Its presence opts an issue into Codex; its absence is
 * Claude Code. There is deliberately no `agent:claude` label — a default needs
 * no label, and absence *is* Claude (spec §C).
 */
export const CODEX_LABEL = "agent:codex";

/** Model for the default (Claude Code) provider — uniform across every capability. */
export const CLAUDE_MODEL = "claude-opus-4-8";

/** Model for the `agent:codex` provider — uniform across every capability. */
export const CODEX_MODEL = "gpt-5.6-sol";

/** Explicit reasoning effort for both provider CLIs. */
export const MODEL_EFFORT = "medium" as const;

export interface ResolvedAgent {
  /** The Sandcastle agent provider to hand to `run({ agent })`. */
  readonly agent: AgentProvider;
  /** The model string the provider was built with (surfaced for logging/tests). */
  readonly model: string;
}

/**
 * Resolve which coding agent works an issue from its full label set.
 *
 * `agent:codex` present → Codex on `gpt-5.6-sol`; absent → Claude Code on
 * `claude-opus-4-8`. This is the only provider switch, and it reads the whole
 * label set rather than a single just-added label, so the provider is resolved
 * the same way whichever action label triggered the run.
 */
export function resolveAgent(labels: readonly string[]): ResolvedAgent {
  if (labels.includes(CODEX_LABEL)) {
    return {
      agent: codex(CODEX_MODEL, { effort: MODEL_EFFORT }),
      model: CODEX_MODEL,
    };
  }
  return {
    agent: claudeCode(CLAUDE_MODEL, { effort: MODEL_EFFORT }),
    model: CLAUDE_MODEL,
  };
}
