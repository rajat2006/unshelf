import { and, eq } from "drizzle-orm";
import {
  CandidateState,
  type DiscoverCandidateId,
  type ItemId,
  type KeepDiscoverCandidateRequest,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { findOrCreateProviderItem } from "../items/provider-identities";
import { discoverCandidates, discoverProviderResults } from "../schema";

export type KeepCandidateResult =
  | { ok: true; itemId: ItemId }
  | { ok: false; error: "candidate_not_found" | "candidate_conflict" };

/** Resolve one owned pending Candidate through the Library identity boundary. */
export async function keepCandidate({
  db,
  userId,
  candidateId,
  input,
  now,
}: {
  db: Database;
  userId: UserId;
  candidateId: DiscoverCandidateId;
  input: KeepDiscoverCandidateRequest;
  now: Date;
}): Promise<KeepCandidateResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        state: discoverCandidates.state,
        provider: discoverProviderResults.provider,
        externalId: discoverProviderResults.externalId,
        source: discoverProviderResults.source,
      })
      .from(discoverCandidates)
      .innerJoin(
        discoverProviderResults,
        eq(discoverCandidates.resultId, discoverProviderResults.id),
      )
      .where(
        and(
          eq(discoverCandidates.id, candidateId),
          eq(discoverCandidates.userId, userId),
        ),
      )
      .for("update");
    const candidate = rows[0];
    if (!candidate) return { ok: false, error: "candidate_not_found" };
    if (candidate.state === CandidateState.Rejected) {
      return { ok: false, error: "candidate_conflict" };
    }

    const itemId = await findOrCreateProviderItem({
      tx,
      userId,
      provider: candidate.provider,
      externalId: candidate.externalId,
      title: input.title,
      type: input.type,
      source: candidate.source,
    });
    if (candidate.state === CandidateState.Pending) {
      await tx
        .update(discoverCandidates)
        .set({ state: CandidateState.Kept, keptAt: now, updatedAt: now })
        .where(
          and(
            eq(discoverCandidates.id, candidateId),
            eq(discoverCandidates.userId, userId),
          ),
        );
    }
    return { ok: true, itemId };
  });
}
