const CANDIDATE_RELEVANCE_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;

/** Return the inclusive start of the rolling Candidate intake window. */
export function candidateRelevanceStart(now: Date): Date {
  return new Date(now.getTime() - CANDIDATE_RELEVANCE_MILLISECONDS);
}
