import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import {
  CandidateState,
  type DiscoverCandidateId,
  type DiscoverFollowId,
  type DiscoverProviderTargetId,
  type DiscoverWorkspace,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  discoverCandidates,
  discoverFollows,
  discoverProviderResults,
  discoverProviderTargets,
} from "../schema";

/** Read one User's active Follows and currently relevant pending Candidates. */
export async function readDiscoverWorkspace({
  db,
  userId,
  now,
}: {
  db: Database;
  userId: UserId;
  now: Date;
}): Promise<DiscoverWorkspace> {
  const follows = await db
    .select({
      id: discoverFollows.id,
      targetId: discoverFollows.targetId,
      externalId: discoverProviderTargets.externalId,
      title: discoverProviderTargets.title,
      thumbnailUrl: discoverProviderTargets.thumbnailUrl,
      canonicalUrl: discoverProviderTargets.canonicalUrl,
    })
    .from(discoverFollows)
    .innerJoin(
      discoverProviderTargets,
      eq(discoverFollows.targetId, discoverProviderTargets.id),
    )
    .where(
      and(
        eq(discoverFollows.userId, userId),
        isNull(discoverFollows.deletedAt),
      ),
    )
    .orderBy(discoverProviderTargets.title);

  const relevanceStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
  const candidates = await db
    .select({
      id: discoverCandidates.id,
      state: discoverCandidates.state,
      externalId: discoverProviderResults.externalId,
      title: discoverProviderResults.title,
      thumbnailUrl: discoverProviderResults.thumbnailUrl,
      publishedAt: discoverProviderResults.publishedAt,
      durationSeconds: discoverProviderResults.durationSeconds,
      source: discoverProviderResults.source,
      channelExternalId: discoverProviderTargets.externalId,
      channelTitle: discoverProviderTargets.title,
    })
    .from(discoverCandidates)
    .innerJoin(
      discoverProviderResults,
      eq(discoverCandidates.resultId, discoverProviderResults.id),
    )
    .innerJoin(
      discoverProviderTargets,
      eq(discoverProviderResults.targetId, discoverProviderTargets.id),
    )
    .innerJoin(
      discoverFollows,
      and(
        eq(discoverFollows.targetId, discoverProviderTargets.id),
        eq(discoverFollows.userId, discoverCandidates.userId),
      ),
    )
    .where(
      and(
        eq(discoverCandidates.userId, userId),
        eq(discoverCandidates.state, CandidateState.Pending),
        isNull(discoverFollows.deletedAt),
        gte(discoverProviderResults.publishedAt, relevanceStart),
        lte(discoverProviderResults.publishedAt, now),
      ),
    )
    .orderBy(desc(discoverProviderResults.publishedAt));

  return {
    follows: follows.map((follow) => ({
      id: follow.id as DiscoverFollowId,
      targetId: follow.targetId as DiscoverProviderTargetId,
      channel: {
        externalId: follow.externalId,
        title: follow.title,
        thumbnailUrl: follow.thumbnailUrl,
        canonicalUrl: follow.canonicalUrl,
      },
    })),
    candidates: candidates.map((candidate) => ({
      id: candidate.id as DiscoverCandidateId,
      state: candidate.state,
      video: {
        externalId: candidate.externalId,
        title: candidate.title,
        thumbnailUrl: candidate.thumbnailUrl,
        publishedAt: candidate.publishedAt.toISOString(),
        durationSeconds: candidate.durationSeconds,
        source: candidate.source,
        channelExternalId: candidate.channelExternalId,
        channelTitle: candidate.channelTitle,
      },
    })),
  };
}
