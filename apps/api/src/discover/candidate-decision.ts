import { CandidateState } from "@unshelf/shared";

type CandidateDecision = CandidateState.Kept | CandidateState.Rejected;

/** Keep and Reject share this policy so replay and conflict semantics cannot drift. */
export function candidateDecisionTransition({
  current,
  requested,
}: {
  current: CandidateState;
  requested: CandidateDecision;
}): "apply" | "replay" | "conflict" {
  if (current === CandidateState.Pending) return "apply";
  return current === requested ? "replay" : "conflict";
}
