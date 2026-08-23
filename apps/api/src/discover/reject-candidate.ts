import { and, eq } from "drizzle-orm";
import {
  CandidateState,
  type DiscoverCandidateId,
  type DiscoverCandidate,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { discoverCandidates } from "../schema";
import { candidateDecisionTransition } from "./candidate-decision";
import { readDiscoverCandidate } from "./read-workspace";

export type RejectCandidateResult =
  | { ok: true; response: DiscoverCandidate }
  | { ok: false; error: "candidate_not_found" | "candidate_conflict" };

/** Resolve one owned pending Candidate without crossing into the Library. */
export async function rejectCandidate({
  db,
  userId,
  candidateId,
  now,
}: {
  db: Database;
  userId: UserId;
  candidateId: DiscoverCandidateId;
  now: Date;
}): Promise<RejectCandidateResult> {
  const result = await db.transaction(async (tx) => {
    // Lock before reading state so opposing Keep and Reject requests cannot both
    // observe a pending Candidate and apply different terminal decisions.
    const rows = await tx
      .select({ state: discoverCandidates.state })
      .from(discoverCandidates)
      .where(
        and(
          eq(discoverCandidates.id, candidateId),
          eq(discoverCandidates.userId, userId),
        ),
      )
      .for("update");
    const candidate = rows[0];
    if (!candidate) {
      return { ok: false as const, error: "candidate_not_found" as const };
    }
    const transition = candidateDecisionTransition({
      current: candidate.state,
      requested: CandidateState.Rejected,
    });
    if (transition === "conflict") {
      return { ok: false as const, error: "candidate_conflict" as const };
    }
    if (transition === "apply") {
      await tx
        .update(discoverCandidates)
        .set({
          state: CandidateState.Rejected,
          rejectedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(discoverCandidates.id, candidateId),
            eq(discoverCandidates.userId, userId),
          ),
        );
    }
    return { ok: true as const };
  });
  if (!result.ok) return result;
  const candidate = await readDiscoverCandidate({ db, userId, candidateId });
  if (!candidate) throw new Error("rejected Candidate response is unavailable");
  return { ok: true, response: candidate };
}
