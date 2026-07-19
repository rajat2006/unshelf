/**
 * `agent-promote-queued` decision logic (spec #52 / #71) — pure, so the promotion
 * rule is unit-tested here and mirrored in `agent-promote-queued.yml`'s bash (the
 * same pure-helper-plus-workflow-mirror shape `resolveAgent` uses). This module
 * invokes nothing: the workflow does every `gh` call and label mutation.
 *
 * When a blocking issue closes, any dependent that was waiting on it should chain
 * straight into `agent-implement` — but only once *every* blocker is closed, so a
 * dependent with a second, still-open blocker stays `agent:queued`.
 */

/** Machine label marking an issue as blocked by another open issue. */
export const QUEUED_LABEL = "agent:queued";

/** The trigger label a promotion adds (via `AGENT_PAT`) to chain into implement. */
export const IMPLEMENT_LABEL = "agent:implement";

/**
 * Human-only label that pulls an issue out of the agent lane. A human who added
 * it to a queued issue must not have the machine drag it back to `agent:implement`.
 */
export const HUMAN_LABEL = "ready-for-human";

/** A blocker of the dependent, as returned by the `blocked_by` dependencies API. */
export interface BlockerState {
  readonly number: number;
  /** GitHub issue state — only `"open"` blockers still gate the dependent. */
  readonly state: "open" | "closed";
}

export interface PromoteDecision {
  /** Whether the dependent should flip `agent:queued` → `agent:implement`. */
  readonly promote: boolean;
  /** Human-readable why, for the workflow log (and test assertions). */
  readonly reason: string;
}

/**
 * Decide whether one dependent of a just-closed blocker should be promoted.
 *
 * Promotes iff the dependent is `agent:queued`, has not been pulled out of the
 * lane with `ready-for-human`, and has **no open blockers left** — where the
 * just-closed blocker is treated as closed even if the dependencies API still
 * reports it `open` (eventual consistency between the close event and the
 * dependency summary). A dependent with any *other* open blocker stays queued.
 */
export function decidePromotion(input: {
  readonly labels: readonly string[];
  readonly blockers: readonly BlockerState[];
  readonly closedBlockerNumber: number;
}): PromoteDecision {
  const { labels, blockers, closedBlockerNumber } = input;

  if (!labels.includes(QUEUED_LABEL)) {
    return { promote: false, reason: `not ${QUEUED_LABEL} — nothing to promote` };
  }

  if (labels.includes(HUMAN_LABEL)) {
    return {
      promote: false,
      reason: `${HUMAN_LABEL} present — a human pulled it out of the agent lane`,
    };
  }

  // The closing blocker counts as closed regardless of what the summary reports.
  const openBlockers = blockers
    .filter((b) => b.state === "open" && b.number !== closedBlockerNumber)
    .map((b) => b.number);

  if (openBlockers.length > 0) {
    return {
      promote: false,
      reason: `still blocked by open issue(s): ${openBlockers.map((n) => `#${n}`).join(", ")}`,
    };
  }

  return { promote: true, reason: `all blockers closed — promoting to ${IMPLEMENT_LABEL}` };
}
