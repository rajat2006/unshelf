import { and, asc, desc, eq, gte, max } from "drizzle-orm";
import type {
  FollowPreview,
  FollowPreviewId,
  PrepareFollowRequest,
  PrepareFollowResponse,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  discoverFollowPreviewResults,
  discoverFollowPreviews,
  discoverProviderResultProjections,
  discoverProviderResults,
  discoverProviderSnapshotResults,
  discoverProviderSnapshots,
  discoverProviderTargetProjections,
  discoverProviderTargets,
} from "../schema";
import type { YouTubeAdapter } from "./youtube-adapter";

const previewLifetimeMilliseconds = 15 * 60 * 1_000;
const providerRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000;

export interface DiscoverModule {
  prepareFollow(input: {
    userId: UserId;
    request: PrepareFollowRequest;
  }): Promise<PrepareFollowResponse>;
}

export function createDiscoverModule({
  db,
  youtube,
  now,
}: {
  db: Database;
  youtube: YouTubeAdapter;
  now: () => Date;
}): DiscoverModule {
  return {
    prepareFollow: async ({ userId, request }) => {
      const acquired = await youtube.previewChannel({
        url: request.target.url,
      });
      if (!acquired.ok) return acquired;

      const createdAt = now();
      const previewExpiresAt = new Date(
        createdAt.getTime() + previewLifetimeMilliseconds,
      );
      const providerExpiresAt = new Date(
        createdAt.getTime() + providerRetentionMilliseconds,
      );

      const preview = await db.transaction(
        async (tx): Promise<FollowPreview> => {
          const [target] = await tx
            .insert(discoverProviderTargets)
            .values({
              provider: "youtube",
              targetKind: "channel",
              acquisitionScope: "system",
              externalReference: acquired.channelId,
              targetPayload: {
                schemaVersion: 1,
                uploadsPlaylistId: acquired.uploadsPlaylistId,
              },
              fetchedAt: createdAt,
              expiresAt: providerExpiresAt,
            })
            .onConflictDoUpdate({
              target: [
                discoverProviderTargets.provider,
                discoverProviderTargets.targetKind,
                discoverProviderTargets.acquisitionScope,
                discoverProviderTargets.externalReference,
              ],
              set: {
                targetPayload: {
                  schemaVersion: 1,
                  uploadsPlaylistId: acquired.uploadsPlaylistId,
                },
                fetchedAt: createdAt,
                expiresAt: providerExpiresAt,
              },
            })
            .returning({ id: discoverProviderTargets.id });
          await tx
            .insert(discoverProviderTargetProjections)
            .values({
              providerTargetId: target.id,
              publisher: acquired.publisher,
              fetchedAt: createdAt,
              expiresAt: providerExpiresAt,
            })
            .onConflictDoUpdate({
              target: discoverProviderTargetProjections.providerTargetId,
              set: {
                publisher: acquired.publisher,
                fetchedAt: createdAt,
                expiresAt: providerExpiresAt,
              },
            });

          const resultIds = new Map<string, string>();
          for (const video of acquired.videos) {
            const [result] = await tx
              .insert(discoverProviderResults)
              .values({
                provider: "youtube",
                externalReference: video.providerIdentity,
              })
              .onConflictDoUpdate({
                target: [
                  discoverProviderResults.provider,
                  discoverProviderResults.externalReference,
                ],
                set: { externalReference: video.providerIdentity },
              })
              .returning({ id: discoverProviderResults.id });
            resultIds.set(video.providerIdentity, result.id);
            await tx
              .insert(discoverProviderResultProjections)
              .values({
                providerResultId: result.id,
                title: video.title,
                source: video.source,
                publisher: video.publisher,
                publishedAt: new Date(video.publishedAt),
                durationSeconds: video.durationSeconds,
                type: video.type,
                thumbnailUrl: video.thumbnailUrl,
                fetchedAt: createdAt,
                expiresAt: providerExpiresAt,
              })
              .onConflictDoUpdate({
                target: discoverProviderResultProjections.providerResultId,
                set: {
                  title: video.title,
                  source: video.source,
                  publisher: video.publisher,
                  publishedAt: new Date(video.publishedAt),
                  durationSeconds: video.durationSeconds,
                  type: video.type,
                  thumbnailUrl: video.thumbnailUrl,
                  fetchedAt: createdAt,
                  expiresAt: providerExpiresAt,
                },
              });
          }

          const orderedResultIds = acquired.videos.map((video) => {
            const resultId = resultIds.get(video.providerIdentity);
            if (resultId === undefined)
              throw new Error("Provider result publication failed");
            return resultId;
          });
          const reuseAfter = new Date(
            createdAt.getTime() - previewLifetimeMilliseconds,
          );
          const recentSnapshots = await tx
            .select({ id: discoverProviderSnapshots.id })
            .from(discoverProviderSnapshots)
            .where(
              and(
                eq(discoverProviderSnapshots.providerTargetId, target.id),
                gte(discoverProviderSnapshots.publishedAt, reuseAfter),
              ),
            )
            .orderBy(desc(discoverProviderSnapshots.sequence));

          let snapshotId: string | undefined;
          for (const recent of recentSnapshots) {
            const membership = await tx
              .select({
                providerResultId:
                  discoverProviderSnapshotResults.providerResultId,
              })
              .from(discoverProviderSnapshotResults)
              .where(eq(discoverProviderSnapshotResults.snapshotId, recent.id))
              .orderBy(asc(discoverProviderSnapshotResults.position));
            if (
              membership.length === orderedResultIds.length &&
              membership.every(
                (entry, position) =>
                  entry.providerResultId === orderedResultIds[position],
              )
            ) {
              snapshotId = recent.id;
              break;
            }
          }

          if (snapshotId === undefined) {
            const [latest] = await tx
              .select({ sequence: max(discoverProviderSnapshots.sequence) })
              .from(discoverProviderSnapshots)
              .where(eq(discoverProviderSnapshots.providerTargetId, target.id));
            const [snapshot] = await tx
              .insert(discoverProviderSnapshots)
              .values({
                providerTargetId: target.id,
                sequence: (latest?.sequence ?? 0) + 1,
                outcome: acquired.outcome,
                rejectedCount: acquired.rejectedCount,
                coverageStartedAt: new Date(acquired.coverageStartedAt),
                publishedAt: createdAt,
              })
              .returning({ id: discoverProviderSnapshots.id });
            snapshotId = snapshot.id;
            if (orderedResultIds.length > 0) {
              await tx.insert(discoverProviderSnapshotResults).values(
                orderedResultIds.map((providerResultId, position) => ({
                  snapshotId: snapshot.id,
                  providerResultId,
                  position,
                })),
              );
            }
          }

          const [receipt] = await tx
            .insert(discoverFollowPreviews)
            .values({
              userId,
              providerTargetId: target.id,
              snapshotId,
              targetUrl: request.target.url,
              createdAt,
              expiresAt: previewExpiresAt,
            })
            .returning({ id: discoverFollowPreviews.id });
          if (orderedResultIds.length > 0) {
            await tx.insert(discoverFollowPreviewResults).values(
              orderedResultIds.map((providerResultId, position) => ({
                previewId: receipt.id,
                userId,
                snapshotId,
                providerResultId,
                position,
              })),
            );
          }

          return {
            outcome: acquired.outcome,
            previewId: receipt.id as FollowPreviewId,
            provider: "youtube",
            target: {
              kind: "channel",
              channelId: acquired.channelId,
              publisher: acquired.publisher,
            },
            videos: acquired.videos,
            rejectedCount: acquired.rejectedCount,
            coverageStartedAt: acquired.coverageStartedAt,
            expiresAt: previewExpiresAt.toISOString(),
          };
        },
      );

      return { ok: true, preview };
    },
  };
}
