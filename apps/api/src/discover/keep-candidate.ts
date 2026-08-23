import { and, eq } from "drizzle-orm";
import {
  CandidateState,
  type DiscoverCandidateId,
  type KeepDiscoverCandidateResult,
  type KeepDiscoverCandidateRequest,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { findOrCreateProviderItem } from "../items/provider-identities";
import { getItem } from "../items/repository";
import { discoverCandidates, discoverProviderResults } from "../schema";
import { readDiscoverCandidate } from "./read-workspace";

export type KeepCandidateResult =
  | { ok: true; response: KeepDiscoverCandidateResult }
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
  const result = await db.transaction(async (tx) => {
    // Lock before reading state so opposing Keep and Reject requests cannot both
    // observe a pending Candidate and apply different terminal decisions.
    const rows = await tx
      .select({
        state: discoverCandidates.state,
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
    if (!candidate) {
      return { ok: false as const, error: "candidate_not_found" as const };
    }
    if (candidate.state === CandidateState.Rejected) {
      return { ok: false as const, error: "candidate_conflict" as const };
    }

    const itemId = await findOrCreateProviderItem({
      tx,
      userId,
      identity: {
        provider: "youtube",
        externalId: candidate.externalId,
      },
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
    return { ok: true as const, itemId };
  });
  if (!result.ok) return result;
  const [candidate, item] = await Promise.all([
    readDiscoverCandidate({ db, userId, candidateId }),
    getItem(db, userId, result.itemId),
  ]);
  if (!candidate || !item) {
    throw new Error("kept Candidate response is unavailable");
  }
  return { ok: true, response: { candidate, item } };
}
