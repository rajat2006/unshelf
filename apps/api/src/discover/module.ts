import { and, asc, desc, eq, gte, inArray, max, or, sql } from "drizzle-orm";
import { Type } from "@unshelf/shared";
import type {
  CandidateId,
  ConfirmFollowFailure,
  ConfirmFollowRequest,
  ConfirmFollowResponse,
  DiscoverWorkspace,
  DiscoveryId,
  DiscoverySummary,
  FollowId,
  FollowPreviewId,
  FollowSummary,
  PrepareFollowRequest,
  PrepareFollowResponse,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  discoverFollowPreviewResults,
  discoverFollowPreviews,
  discoverCandidates,
  discoverDiscoveries,
  discoverFollowCandidatePresence,
  discoverFollows,
  discoverIdempotency,
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
  confirmFollow(input: {
    userId: UserId;
    request: ConfirmFollowRequest;
    idempotencyKey: string;
  }): Promise<ConfirmFollowResponse>;
  readWorkspace(input: { userId: UserId }): Promise<DiscoverWorkspace>;
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

      return db.transaction(async (tx): Promise<PrepareFollowResponse> => {
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
            targetWhere: sql`${discoverProviderTargets.externalReference} IS NOT NULL`,
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

        const [existingFollow] = await tx
          .select({
            id: discoverFollows.id,
            lifecycle: discoverFollows.lifecycle,
            targetUrl: discoverFollows.targetUrl,
            createdAt: discoverFollows.createdAt,
          })
          .from(discoverFollows)
          .where(
            and(
              eq(discoverFollows.userId, userId),
              eq(discoverFollows.providerTargetId, target.id),
            ),
          );
        if (
          existingFollow !== undefined &&
          existingFollow.lifecycle !== "removed"
        ) {
          return {
            ok: true,
            outcome:
              existingFollow.lifecycle === "active"
                ? "already_following"
                : "resume_available",
            follow: toFollowSummary({
              ...existingFollow,
              name: acquired.publisher,
            }),
          };
        }

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
              targetWhere: sql`${discoverProviderResults.externalReference} IS NOT NULL`,
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
          .select({
            id: discoverProviderSnapshots.id,
            outcome: discoverProviderSnapshots.outcome,
            rejectedCount: discoverProviderSnapshots.rejectedCount,
            coverageStartedAt: discoverProviderSnapshots.coverageStartedAt,
          })
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
          if (
            recent.outcome !== acquired.outcome ||
            recent.rejectedCount !== acquired.rejectedCount ||
            recent.coverageStartedAt.toISOString() !==
              acquired.coverageStartedAt
          ) {
            continue;
          }
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
          ok: true,
          preview: {
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
          },
        };
      });
    },
    confirmFollow: async ({ userId, request, idempotencyKey }) =>
      db.transaction(async (tx): Promise<ConfirmFollowResponse> => {
        const requestFingerprint = request.previewId;
        const insertedKey = await tx
          .insert(discoverIdempotency)
          .values({
            userId,
            operation: "confirm_follow",
            requestId: idempotencyKey,
            requestFingerprint,
          })
          .onConflictDoNothing()
          .returning({ requestId: discoverIdempotency.requestId });
        const [idempotency] = await tx
          .select({
            requestFingerprint: discoverIdempotency.requestFingerprint,
            resultPayload: discoverIdempotency.resultPayload,
          })
          .from(discoverIdempotency)
          .where(
            and(
              eq(discoverIdempotency.userId, userId),
              eq(discoverIdempotency.operation, "confirm_follow"),
              eq(discoverIdempotency.requestId, idempotencyKey),
            ),
          )
          .for("update");
        if (idempotency.requestFingerprint !== requestFingerprint) {
          return { ok: false, error: "idempotency_conflict" };
        }
        if (idempotency.resultPayload !== null) {
          return idempotency.resultPayload as ConfirmFollowResponse;
        }

        const fail = async (
          error: ConfirmFollowFailure,
        ): Promise<ConfirmFollowResponse> => {
          if (insertedKey.length > 0) {
            await tx
              .delete(discoverIdempotency)
              .where(
                and(
                  eq(discoverIdempotency.userId, userId),
                  eq(discoverIdempotency.operation, "confirm_follow"),
                  eq(discoverIdempotency.requestId, idempotencyKey),
                ),
              );
          }
          return { ok: false, error };
        };

        const [preview] = await tx
          .select()
          .from(discoverFollowPreviews)
          .where(
            and(
              eq(discoverFollowPreviews.id, request.previewId),
              eq(discoverFollowPreviews.userId, userId),
            ),
          )
          .for("update");
        if (preview === undefined) return fail("preview_missing");
        if (preview.consumedAt !== null) return fail("preview_consumed");
        const confirmedAt = now();
        if (preview.expiresAt.getTime() <= confirmedAt.getTime()) {
          return fail("preview_expired");
        }

        const [target] = await tx
          .select({
            externalReference: discoverProviderTargets.externalReference,
            expiresAt: discoverProviderTargets.expiresAt,
            name: discoverProviderTargetProjections.publisher,
            projectionExpiresAt: discoverProviderTargetProjections.expiresAt,
          })
          .from(discoverProviderTargets)
          .leftJoin(
            discoverProviderTargetProjections,
            eq(
              discoverProviderTargetProjections.providerTargetId,
              discoverProviderTargets.id,
            ),
          )
          .where(eq(discoverProviderTargets.id, preview.providerTargetId));
        if (
          target === undefined ||
          target.externalReference === null ||
          target.expiresAt === null ||
          target.expiresAt.getTime() <= confirmedAt.getTime() ||
          target.name === null ||
          target.projectionExpiresAt === null ||
          target.projectionExpiresAt.getTime() <= confirmedAt.getTime()
        ) {
          return fail("preview_unverifiable");
        }

        const membership = await tx
          .select({
            providerResultId: discoverFollowPreviewResults.providerResultId,
            position: discoverFollowPreviewResults.position,
            externalReference: discoverProviderResults.externalReference,
            projectionExpiresAt: discoverProviderResultProjections.expiresAt,
          })
          .from(discoverFollowPreviewResults)
          .innerJoin(
            discoverProviderResults,
            eq(
              discoverProviderResults.id,
              discoverFollowPreviewResults.providerResultId,
            ),
          )
          .leftJoin(
            discoverProviderResultProjections,
            eq(
              discoverProviderResultProjections.providerResultId,
              discoverFollowPreviewResults.providerResultId,
            ),
          )
          .where(
            and(
              eq(discoverFollowPreviewResults.previewId, preview.id),
              eq(discoverFollowPreviewResults.userId, userId),
            ),
          )
          .orderBy(asc(discoverFollowPreviewResults.position));
        const snapshotMembership = await tx
          .select({
            providerResultId: discoverProviderSnapshotResults.providerResultId,
            position: discoverProviderSnapshotResults.position,
          })
          .from(discoverProviderSnapshotResults)
          .where(
            eq(discoverProviderSnapshotResults.snapshotId, preview.snapshotId),
          )
          .orderBy(asc(discoverProviderSnapshotResults.position));
        if (
          membership.length !== snapshotMembership.length ||
          membership.some(
            (member, position) =>
              member.providerResultId !==
                snapshotMembership[position]?.providerResultId ||
              member.position !== snapshotMembership[position]?.position,
          ) ||
          membership.some(
            (member) =>
              member.externalReference === null ||
              member.projectionExpiresAt === null ||
              member.projectionExpiresAt.getTime() <= confirmedAt.getTime(),
          )
        ) {
          return fail("preview_unverifiable");
        }

        const [existingFollow] = await tx
          .select({
            id: discoverFollows.id,
            lifecycle: discoverFollows.lifecycle,
          })
          .from(discoverFollows)
          .where(
            and(
              eq(discoverFollows.userId, userId),
              eq(discoverFollows.providerTargetId, preview.providerTargetId),
            ),
          )
          .for("update");
        if (
          existingFollow !== undefined &&
          existingFollow.lifecycle !== "removed"
        ) {
          return fail("preview_unverifiable");
        }

        const [followRow] =
          existingFollow === undefined
            ? await tx
                .insert(discoverFollows)
                .values({
                  userId,
                  providerTargetId: preview.providerTargetId,
                  targetUrl: preview.targetUrl,
                  lifecycle: "active",
                  lastAppliedProviderSnapshotId: preview.snapshotId,
                  createdAt: confirmedAt,
                  updatedAt: confirmedAt,
                })
                .returning()
            : await tx
                .update(discoverFollows)
                .set({
                  lifecycle: "active",
                  targetUrl: preview.targetUrl,
                  lastAppliedProviderSnapshotId: preview.snapshotId,
                  updatedAt: confirmedAt,
                })
                .where(eq(discoverFollows.id, existingFollow.id))
                .returning();

        const discoveryIds: string[] = [];
        for (const member of membership) {
          const [candidate] = await tx
            .insert(discoverCandidates)
            .values({
              userId,
              providerResultId: member.providerResultId,
              createdAt: confirmedAt,
            })
            .onConflictDoUpdate({
              target: [
                discoverCandidates.userId,
                discoverCandidates.providerResultId,
              ],
              set: { providerResultId: member.providerResultId },
            })
            .returning({ id: discoverCandidates.id });
          const [priorPresence] = await tx
            .select({
              appearanceSequence:
                discoverFollowCandidatePresence.appearanceSequence,
            })
            .from(discoverFollowCandidatePresence)
            .where(
              and(
                eq(discoverFollowCandidatePresence.followId, followRow.id),
                eq(discoverFollowCandidatePresence.candidateId, candidate.id),
              ),
            )
            .for("update");
          const appearanceSequence =
            (priorPresence?.appearanceSequence ?? 0) + 1;
          await tx
            .insert(discoverFollowCandidatePresence)
            .values({
              userId,
              followId: followRow.id,
              candidateId: candidate.id,
              appearanceSequence,
              present: true,
              firstSurfacedSnapshotId: preview.snapshotId,
              lastSurfacedSnapshotId: preview.snapshotId,
            })
            .onConflictDoUpdate({
              target: [
                discoverFollowCandidatePresence.followId,
                discoverFollowCandidatePresence.candidateId,
              ],
              set: {
                appearanceSequence,
                present: true,
                firstSurfacedSnapshotId: preview.snapshotId,
                lastSurfacedSnapshotId: preview.snapshotId,
              },
            });
          const [discovery] = await tx
            .insert(discoverDiscoveries)
            .values({
              userId,
              followId: followRow.id,
              candidateId: candidate.id,
              appearanceSequence,
              position: member.position,
              state: "new",
              discoveredAt: confirmedAt,
            })
            .returning({ id: discoverDiscoveries.id });
          discoveryIds.push(discovery.id);
        }

        await tx
          .update(discoverFollowPreviews)
          .set({ consumedAt: confirmedAt })
          .where(eq(discoverFollowPreviews.id, preview.id));

        const follow = toFollowSummary({
          ...followRow,
          name: target.name,
        });
        const discoveries = await selectDiscoveries({
          query: tx,
          userId,
          discoveryIds,
        });
        const result: ConfirmFollowResponse = {
          ok: true,
          follow,
          discoveries,
        };
        await tx
          .update(discoverIdempotency)
          .set({ resultPayload: result })
          .where(
            and(
              eq(discoverIdempotency.userId, userId),
              eq(discoverIdempotency.operation, "confirm_follow"),
              eq(discoverIdempotency.requestId, idempotencyKey),
            ),
          );
        return result;
      }),
    readWorkspace: async ({ userId }) => {
      const followRows = await db
        .select({
          id: discoverFollows.id,
          lifecycle: discoverFollows.lifecycle,
          targetUrl: discoverFollows.targetUrl,
          createdAt: discoverFollows.createdAt,
          name: discoverProviderTargetProjections.publisher,
        })
        .from(discoverFollows)
        .leftJoin(
          discoverProviderTargetProjections,
          eq(
            discoverProviderTargetProjections.providerTargetId,
            discoverFollows.providerTargetId,
          ),
        )
        .where(eq(discoverFollows.userId, userId))
        .orderBy(asc(discoverFollows.createdAt));
      return {
        follows: followRows.map(toFollowSummary),
        discoveries: await selectDiscoveries({ query: db, userId }),
      };
    },
  };
}

type DiscoveryQuery = Pick<Database, "select">;

async function selectDiscoveries({
  query,
  userId,
  discoveryIds,
}: {
  query: DiscoveryQuery;
  userId: UserId;
  discoveryIds?: string[];
}): Promise<DiscoverySummary[]> {
  if (discoveryIds?.length === 0) return [];
  const stateFilter = or(
    eq(discoverDiscoveries.state, "new"),
    eq(discoverDiscoveries.state, "seen"),
  );
  const rows = await query
    .select({
      id: discoverDiscoveries.id,
      candidateId: discoverDiscoveries.candidateId,
      followId: discoverDiscoveries.followId,
      followName: discoverProviderTargetProjections.publisher,
      state: discoverDiscoveries.state,
      title: discoverProviderResultProjections.title,
      source: discoverProviderResultProjections.source,
      publisher: discoverProviderResultProjections.publisher,
      publishedAt: discoverProviderResultProjections.publishedAt,
      durationSeconds: discoverProviderResultProjections.durationSeconds,
      type: discoverProviderResultProjections.type,
      thumbnailUrl: discoverProviderResultProjections.thumbnailUrl,
      discoveredAt: discoverDiscoveries.discoveredAt,
      position: discoverDiscoveries.position,
    })
    .from(discoverDiscoveries)
    .innerJoin(
      discoverCandidates,
      and(
        eq(discoverCandidates.id, discoverDiscoveries.candidateId),
        eq(discoverCandidates.userId, discoverDiscoveries.userId),
      ),
    )
    .innerJoin(
      discoverFollows,
      and(
        eq(discoverFollows.id, discoverDiscoveries.followId),
        eq(discoverFollows.userId, discoverDiscoveries.userId),
      ),
    )
    .leftJoin(
      discoverProviderResultProjections,
      eq(
        discoverProviderResultProjections.providerResultId,
        discoverCandidates.providerResultId,
      ),
    )
    .leftJoin(
      discoverProviderTargetProjections,
      eq(
        discoverProviderTargetProjections.providerTargetId,
        discoverFollows.providerTargetId,
      ),
    )
    .where(
      and(
        eq(discoverDiscoveries.userId, userId),
        stateFilter,
        discoveryIds === undefined
          ? undefined
          : inArray(discoverDiscoveries.id, discoveryIds),
      ),
    )
    .orderBy(
      asc(discoverFollows.createdAt),
      asc(discoverDiscoveries.position),
      asc(discoverDiscoveries.discoveredAt),
    );
  return rows.map((row) => ({
    id: row.id as DiscoveryId,
    candidateId: row.candidateId as CandidateId,
    followId: row.followId as FollowId,
    followName: row.followName,
    state: row.state as "new" | "seen",
    title: row.title,
    source: row.source,
    publisher: row.publisher,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    type: row.type === Type.Video ? Type.Video : null,
    thumbnailUrl: row.thumbnailUrl,
    discoveredAt: row.discoveredAt.toISOString(),
  }));
}

function toFollowSummary(row: {
  id: string;
  lifecycle: string;
  targetUrl: string;
  createdAt: Date;
  name: string | null;
}): FollowSummary {
  return {
    id: row.id as FollowId,
    provider: "youtube",
    lifecycle: row.lifecycle as FollowSummary["lifecycle"],
    name: row.name,
    targetUrl: row.targetUrl,
    createdAt: row.createdAt.toISOString(),
  };
}
