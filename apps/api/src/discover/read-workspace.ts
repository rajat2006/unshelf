import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import {
  CandidateState,
  type DiscoverCandidate,
  type DiscoverCandidateId,
  type DiscoverFollowId,
  type DiscoverProviderTargetId,
  type DiscoverWorkspace,
  type ItemId,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  discoverCandidates,
  discoverFollows,
  discoverProviderResults,
  discoverProviderTargets,
  itemProviderIdentities,
  items,
} from "../schema";
import { candidateRelevanceStart } from "./candidate-relevance";

const CANDIDATE_PROJECTION = {
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
  libraryItemId: items.id,
  libraryItemTitle: items.title,
} as const;

interface CandidateRow {
  id: string;
  state: CandidateState;
  externalId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  durationSeconds: number;
  source: string;
  channelExternalId: string;
  channelTitle: string;
  libraryItemId: string | null;
  libraryItemTitle: string | null;
}

function toDiscoverCandidate(candidate: CandidateRow): DiscoverCandidate {
  return {
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
    libraryItem:
      candidate.libraryItemId && candidate.libraryItemTitle
        ? {
            id: candidate.libraryItemId as ItemId,
            title: candidate.libraryItemTitle,
          }
        : null,
  };
}

/** Read one User's active Follows and currently relevant pending Candidates. */
export async function readDiscoverWorkspace({
  db,
  userId,
  followId,
  now,
}: {
  db: Database;
  userId: UserId;
  followId?: DiscoverFollowId;
  now: Date;
}): Promise<DiscoverWorkspace | null> {
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

  if (followId && !follows.some((follow) => follow.id === followId)) {
    return null;
  }

  const relevanceStart = candidateRelevanceStart(now);
  const candidates = await db
    .select(CANDIDATE_PROJECTION)
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
    .leftJoin(
      itemProviderIdentities,
      and(
        eq(itemProviderIdentities.userId, discoverCandidates.userId),
        eq(itemProviderIdentities.provider, discoverProviderResults.provider),
        eq(
          itemProviderIdentities.externalId,
          discoverProviderResults.externalId,
        ),
      ),
    )
    .leftJoin(
      items,
      and(
        eq(items.id, itemProviderIdentities.itemId),
        eq(items.userId, itemProviderIdentities.userId),
      ),
    )
    .where(
      and(
        eq(discoverCandidates.userId, userId),
        ...(followId ? [eq(discoverFollows.id, followId)] : []),
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
    candidates: candidates.map(toDiscoverCandidate),
  };
}

/** Read one owned Candidate regardless of terminal state for mutation responses. */
export async function readDiscoverCandidate({
  db,
  userId,
  candidateId,
}: {
  db: Database;
  userId: UserId;
  candidateId: DiscoverCandidateId;
}): Promise<DiscoverCandidate | null> {
  const rows = await db
    .select(CANDIDATE_PROJECTION)
    .from(discoverCandidates)
    .innerJoin(
      discoverProviderResults,
      eq(discoverCandidates.resultId, discoverProviderResults.id),
    )
    .innerJoin(
      discoverProviderTargets,
      eq(discoverProviderResults.targetId, discoverProviderTargets.id),
    )
    .leftJoin(
      itemProviderIdentities,
      and(
        eq(itemProviderIdentities.userId, discoverCandidates.userId),
        eq(itemProviderIdentities.provider, discoverProviderResults.provider),
        eq(
          itemProviderIdentities.externalId,
          discoverProviderResults.externalId,
        ),
      ),
    )
    .leftJoin(
      items,
      and(
        eq(items.id, itemProviderIdentities.itemId),
        eq(items.userId, itemProviderIdentities.userId),
      ),
    )
    .where(
      and(
        eq(discoverCandidates.id, candidateId),
        eq(discoverCandidates.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ? toDiscoverCandidate(rows[0]) : null;
}
