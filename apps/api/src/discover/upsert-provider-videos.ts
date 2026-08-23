import type { DiscoverProviderTargetId } from "@unshelf/shared";
import type { DatabaseTransaction } from "../db";
import { discoverProviderResults } from "../schema";
import type { YouTubeVideo } from "./youtube-client";

/** Upsert the current shared metadata for accepted YouTube videos. */
export async function upsertProviderVideos({
  tx,
  targetId,
  videos,
  updatedAt,
}: {
  tx: DatabaseTransaction;
  targetId: DiscoverProviderTargetId;
  videos: YouTubeVideo[];
  updatedAt: Date;
}): Promise<void> {
  for (const video of videos) {
    const metadata = {
      source: video.source,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      publishedAt: new Date(video.publishedAt),
      durationSeconds: video.durationSeconds,
      updatedAt,
    };
    await tx
      .insert(discoverProviderResults)
      .values({
        targetId,
        provider: "youtube",
        externalId: video.externalId,
        ...metadata,
      })
      .onConflictDoUpdate({
        target: [
          discoverProviderResults.provider,
          discoverProviderResults.externalId,
        ],
        set: { targetId, ...metadata },
      });
  }
}
