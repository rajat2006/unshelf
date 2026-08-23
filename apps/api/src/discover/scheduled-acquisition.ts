import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { discoverProviderTargets } from "../schema";
import { candidateRelevanceStart } from "./candidate-relevance";
import { upsertProviderVideos } from "./upsert-provider-videos";
import type {
  FetchChannelVideosResult,
  YouTubeChannel,
  YouTubeClient,
} from "./youtube-client";

const CLAIM_LEASE_MILLISECONDS = 35_000;
const CHANNEL_REFRESH_MILLISECONDS = 60 * 60 * 1_000;
const CHANNEL_CONCURRENCY = 4;

interface ClaimedTarget extends YouTubeChannel {
  [key: string]: unknown;
  id: string;
  claimToken: string;
}

export interface DiscoverAcquisitionTick {
  (): Promise<void>;
}

/** Fetch every currently due followed channel with process-local bounded work. */
export function createDiscoverAcquisitionTick({
  db,
  youtubeClient,
  now,
}: {
  db: Database;
  youtubeClient: YouTubeClient;
  now: () => Date;
}): DiscoverAcquisitionTick {
  return async () => {
    await Promise.all(
      Array.from({ length: CHANNEL_CONCURRENCY }, async () => {
        while (true) {
          const claimedAt = now();
          const target = await claimNextTarget({ db, now: claimedAt });
          if (!target) return;

          // The claim transaction must finish before Provider I/O. Otherwise a
          // slow request holds database locks and prevents lease recovery.
          const acquired = await youtubeClient.fetchChannelVideos({
            channel: target,
          });
          const completedAt = now();
          if (acquired.ok) {
            await publishAcquisition({
              db,
              target,
              acquired,
              completedAt,
            });
          } else {
            await recordAcquisitionFailure({
              db,
              target,
              acquired,
              completedAt,
            });
          }
        }
      }),
    );
  };
}

async function claimNextTarget({
  db,
  now,
}: {
  db: Database;
  now: Date;
}): Promise<ClaimedTarget | null> {
  const claimToken = randomUUID();
  const claimExpiresAt = new Date(now.getTime() + CLAIM_LEASE_MILLISECONDS);
  // An expired claim must become eligible again so a killed API process cannot
  // leave one followed channel permanently blocked.
  const { rows } = await db.execute<ClaimedTarget>(sql`
    with due_target as (
      select target.id
      from discover_provider_targets target
      where target.next_fetch_at <= ${now}
        and (
          target.claim_expires_at is null
          or target.claim_expires_at <= ${now}
        )
        and exists (
          select 1
          from discover_follows follow
          where follow.target_id = target.id
            and follow.deleted_at is null
        )
      order by target.next_fetch_at, target.id
      for update skip locked
      limit 1
    )
    update discover_provider_targets target
    set claim_token = ${claimToken}, claim_expires_at = ${claimExpiresAt}
    from due_target
    where target.id = due_target.id
    returning
      target.id,
      target.external_id as "externalId",
      target.title,
      target.thumbnail_url as "thumbnailUrl",
      target.canonical_url as "canonicalUrl",
      target.uploads_playlist_id as "uploadsPlaylistId",
      target.claim_token as "claimToken"
  `);
  return rows[0] ?? null;
}

async function publishAcquisition({
  db,
  target,
  acquired,
  completedAt,
}: {
  db: Database;
  target: ClaimedTarget;
  acquired: Extract<FetchChannelVideosResult, { ok: true }>;
  completedAt: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [ownedTarget] = await tx
      .select({ id: discoverProviderTargets.id })
      .from(discoverProviderTargets)
      .where(
        and(
          eq(discoverProviderTargets.id, target.id),
          eq(discoverProviderTargets.claimToken, target.claimToken),
        ),
      )
      .limit(1)
      .for("update");
    if (!ownedTarget) return;

    await upsertProviderVideos({
      tx,
      targetId: target.id,
      videos: acquired.videos,
      updatedAt: completedAt,
    });

    const relevanceStart = candidateRelevanceStart(completedAt);
    await tx.execute(sql`
      insert into discover_candidates (user_id, result_id, created_at, updated_at)
      select follow.user_id, result.id, ${completedAt}, ${completedAt}
      from discover_follows follow
      join discover_provider_results result
        on result.target_id = follow.target_id
      where follow.target_id = ${target.id}
        and follow.deleted_at is null
        and result.published_at >= ${relevanceStart}
        and result.published_at <= ${completedAt}
      on conflict (user_id, result_id) do nothing
    `);

    await tx
      .update(discoverProviderTargets)
      .set({
        nextFetchAt: new Date(
          completedAt.getTime() + CHANNEL_REFRESH_MILLISECONDS,
        ),
        lastFetchedAt: completedAt,
        lastFetchOutcome: acquired.outcome ?? "complete",
        claimToken: null,
        claimExpiresAt: null,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(discoverProviderTargets.id, target.id),
          eq(discoverProviderTargets.claimToken, target.claimToken),
        ),
      );
  });
}

async function recordAcquisitionFailure({
  db,
  target,
  acquired,
  completedAt,
}: {
  db: Database;
  target: ClaimedTarget;
  acquired: Extract<FetchChannelVideosResult, { ok: false }>;
  completedAt: Date;
}): Promise<void> {
  await db
    .update(discoverProviderTargets)
    .set({
      nextFetchAt: new Date(
        completedAt.getTime() + CHANNEL_REFRESH_MILLISECONDS,
      ),
      lastFetchOutcome: acquired.error === "throttled" ? "throttled" : "failed",
      claimToken: null,
      claimExpiresAt: null,
      updatedAt: completedAt,
    })
    .where(
      and(
        eq(discoverProviderTargets.id, target.id),
        eq(discoverProviderTargets.claimToken, target.claimToken),
      ),
    );
}
