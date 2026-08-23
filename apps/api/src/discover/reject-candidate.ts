import { and, eq } from "drizzle-orm";
import {
  CandidateState,
  type DiscoverCandidateId,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { discoverCandidates } from "../schema";

export type RejectCandidateResult =
  | { ok: true }
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
  return db.transaction(async (tx) => {
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
    if (!candidate) return { ok: false, error: "candidate_not_found" };
    if (candidate.state === CandidateState.Kept) {
      return { ok: false, error: "candidate_conflict" };
    }
    if (candidate.state === CandidateState.Pending) {
      await tx
        .update(discoverCandidates)
        .set({ state: CandidateState.Rejected, rejectedAt: now, updatedAt: now })
        .where(
          and(
            eq(discoverCandidates.id, candidateId),
            eq(discoverCandidates.userId, userId),
          ),
        );
    }
    return { ok: true };
  });
}
