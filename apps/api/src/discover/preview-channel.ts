import type {
  DiscoverPreview,
  DiscoverProviderTargetId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { discoverProviderTargets } from "../schema";
import { upsertProviderVideos } from "./upsert-provider-videos";
import type { YouTubeClient, YouTubeFailure } from "./youtube-client";
import { nextDiscoverFetchAt } from "./fetch-schedule";

export type PreviewChannelResult =
  { ok: true; preview: DiscoverPreview } | { ok: false; error: YouTubeFailure };

/** Resolve, acquire, and publish shared preview metadata without private state. */
export async function previewChannel({
  db,
  youtubeClient,
  url,
  now,
}: {
  db: Database;
  youtubeClient: YouTubeClient;
  url: string;
  now: Date;
}): Promise<PreviewChannelResult> {
  const resolved = await youtubeClient.resolveChannel({ url });
  if (!resolved.ok) return resolved;
  const acquired = await youtubeClient.fetchChannelVideos({
    channel: resolved.channel,
  });
  if (!acquired.ok) return acquired;

  return db.transaction(async (tx) => {
    const channelMetadata = {
      canonicalUrl: resolved.channel.canonicalUrl,
      title: resolved.channel.title,
      thumbnailUrl: resolved.channel.thumbnailUrl,
      uploadsPlaylistId: resolved.channel.uploadsPlaylistId,
      nextFetchAt: nextDiscoverFetchAt(now),
      lastFetchedAt: now,
      lastFetchOutcome: acquired.outcome ?? "complete",
      updatedAt: now,
    };
    const [target] = await tx
      .insert(discoverProviderTargets)
      .values({
        provider: "youtube",
        externalId: resolved.channel.externalId,
        ...channelMetadata,
      })
      .onConflictDoUpdate({
        target: [
          discoverProviderTargets.provider,
          discoverProviderTargets.externalId,
        ],
        set: {
          ...channelMetadata,
        },
      })
      .returning({ id: discoverProviderTargets.id });

    await upsertProviderVideos({
      tx,
      targetId: target.id as DiscoverProviderTargetId,
      videos: acquired.videos,
      updatedAt: now,
    });

    return {
      ok: true,
      preview: {
        targetId: target.id as DiscoverProviderTargetId,
        channel: {
          externalId: resolved.channel.externalId,
          title: resolved.channel.title,
          thumbnailUrl: resolved.channel.thumbnailUrl,
          canonicalUrl: resolved.channel.canonicalUrl,
        },
        videos: acquired.videos.slice(0, 10).map((video) => ({
          ...video,
          channelExternalId: resolved.channel.externalId,
          channelTitle: resolved.channel.title,
        })),
      },
    };
  });
}
