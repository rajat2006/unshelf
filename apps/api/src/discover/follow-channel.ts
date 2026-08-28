import { and, eq, gte, lte } from "drizzle-orm";
import type {
  DiscoverFollow,
  DiscoverFollowId,
  DiscoverProviderTargetId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  discoverCandidates,
  discoverFollows,
  discoverProviderResults,
  discoverProviderTargets,
} from "../schema";
import { candidateRelevanceStart } from "./candidate-relevance";

export type FollowChannelResult =
  | { ok: true; created: boolean; follow: DiscoverFollow }
  | { ok: false; error: "not_found" };

/** Activate one private Follow and seed its currently relevant Candidates. */
export async function followChannel({
  db,
  userId,
  targetId,
  now,
}: {
  db: Database;
  userId: UserId;
  targetId: DiscoverProviderTargetId;
  now: Date;
}): Promise<FollowChannelResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(discoverProviderTargets)
      .where(eq(discoverProviderTargets.id, targetId))
      .limit(1)
      // Follow seeding and scheduled fan-out lock the shared target in the same
      // order so neither transaction can miss the other's committed rows.
      .for("update");
    if (!target) return { ok: false, error: "not_found" };

    const [existing] = await tx
      .select({ id: discoverFollows.id })
      .from(discoverFollows)
      .where(
        and(
          eq(discoverFollows.userId, userId),
          eq(discoverFollows.targetId, targetId),
        ),
      )
      .limit(1);
    const [follow] = await tx
      .insert(discoverFollows)
      .values({ userId, targetId, updatedAt: now })
      .onConflictDoUpdate({
        target: [discoverFollows.userId, discoverFollows.targetId],
        set: { deletedAt: null, updatedAt: now },
      })
      .returning({ id: discoverFollows.id });

    const relevanceStart = candidateRelevanceStart(now);
    const results = await tx
      .select({ id: discoverProviderResults.id })
      .from(discoverProviderResults)
      .where(
        and(
          eq(discoverProviderResults.targetId, targetId),
          gte(discoverProviderResults.publishedAt, relevanceStart),
          lte(discoverProviderResults.publishedAt, now),
        ),
      );
    if (results.length > 0) {
      await tx
        .insert(discoverCandidates)
        .values(results.map((result) => ({ userId, resultId: result.id })))
        .onConflictDoNothing();
    }

    return {
      ok: true,
      created: !existing,
      follow: {
        id: follow.id as DiscoverFollowId,
        targetId,
        channel: {
          externalId: target.externalId,
          title: target.title,
          thumbnailUrl: target.thumbnailUrl,
          canonicalUrl: target.canonicalUrl,
        },
      },
    };
  });
}
