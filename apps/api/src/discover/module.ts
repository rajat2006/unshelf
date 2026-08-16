import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  max,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import pLimit from "p-limit";
import { Type } from "@unshelf/shared";
import type {
  CandidateId,
  AcquireAndApplyRequest,
  AcquireAndApplyResponse,
  ConfirmFollowFailure,
  ConfirmFollowRequest,
  ConfirmFollowResponse,
  DiscoverWorkspace,
  DiscoveryId,
  DiscoverySummary,
  FollowId,
  FollowPreviewId,
  FollowSummary,
  IdempotencyKey,
  PrepareFollowRequest,
  PrepareFollowResponse,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import type { Logger } from "../logging";
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
  discoverProviderGates,
  discoverProviderSnapshotResults,
  discoverProviderSnapshots,
  discoverProviderTargetProjections,
  discoverProviderTargets,
  discoverAcquisitionAttempts,
} from "../schema";
import type {
  ProviderPreview,
  ProviderPreviewResult,
  YouTubeAdapter,
} from "./youtube-adapter";

const previewLifetimeMilliseconds = 15 * 60 * 1_000;
const providerRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000;
const acquisitionLeaseMilliseconds = 35 * 1_000;
const joinPollMilliseconds = 10;
const providerGateFallbackMilliseconds = 15 * 60 * 1_000;

export interface DiscoverModule {
  prepareFollow(input: {
    userId: UserId;
    request: PrepareFollowRequest;
  }): Promise<PrepareFollowResponse>;
  confirmFollow(input: {
    userId: UserId;
    request: ConfirmFollowRequest;
    idempotencyKey: IdempotencyKey;
  }): Promise<ConfirmFollowResponse>;
  acquireAndApply(input: {
    userId: UserId;
    request: AcquireAndApplyRequest;
  }): Promise<AcquireAndApplyResponse>;
  readWorkspace(input: { userId: UserId }): Promise<DiscoverWorkspace>;
}

export function createDiscoverModule({
  db,
  youtube,
  now,
  logger,
}: {
  db: Database;
  youtube: YouTubeAdapter;
  now: () => Date;
  logger: Logger;
}): DiscoverModule {
  const providerConcurrency = pLimit(4);
  return {
    prepareFollow: async ({ userId, request }) => {
      const acquired = await providerConcurrency(() =>
        youtube.previewChannel({
          url: request.target.url,
        }),
      );
      if (!acquired.ok) return { ok: false, error: acquired.error };

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
        await tx
          .insert(discoverIdempotency)
          .values({
            userId,
            operation: "confirm_follow",
            requestId: idempotencyKey,
            requestFingerprint,
          })
          .onConflictDoNothing();
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
          const result: ConfirmFollowResponse = { ok: false, error };
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
    acquireAndApply: async ({ userId, request }) => {
      const claim = await db.transaction(async (tx) => {
        const [follow] = await tx
          .select({
            id: discoverFollows.id,
            lifecycle: discoverFollows.lifecycle,
            providerTargetId: discoverFollows.providerTargetId,
            targetUrl: discoverFollows.targetUrl,
            channelId: discoverProviderTargets.externalReference,
          })
          .from(discoverFollows)
          .innerJoin(
            discoverProviderTargets,
            eq(discoverProviderTargets.id, discoverFollows.providerTargetId),
          )
          .where(
            and(
              eq(discoverFollows.id, request.followId),
              eq(discoverFollows.userId, userId),
            ),
          );
        if (follow === undefined)
          return { ok: false as const, error: "follow_missing" as const };
        if (follow.lifecycle !== "active") {
          return { ok: false as const, error: "follow_inactive" as const };
        }
        const startedAt = now();
        await tx
          .select({ id: discoverProviderTargets.id })
          .from(discoverProviderTargets)
          .where(eq(discoverProviderTargets.id, follow.providerTargetId))
          .for("update");
        const [providerGate] = await tx
          .select({ nextEligibleAt: discoverProviderGates.nextEligibleAt })
          .from(discoverProviderGates)
          .where(eq(discoverProviderGates.provider, "youtube"));
        if (
          providerGate !== undefined &&
          providerGate.nextEligibleAt > startedAt
        ) {
          return {
            ok: true as const,
            role: "gated" as const,
            follow,
            nextEligibleAt: providerGate.nextEligibleAt,
          };
        }
        const [runningAttempt] = await tx
          .select({
            id: discoverAcquisitionAttempts.id,
            generation: discoverAcquisitionAttempts.generation,
            leaseExpiresAt: discoverAcquisitionAttempts.leaseExpiresAt,
          })
          .from(discoverAcquisitionAttempts)
          .where(
            and(
              eq(
                discoverAcquisitionAttempts.providerTargetId,
                follow.providerTargetId,
              ),
              eq(discoverAcquisitionAttempts.outcome, "running"),
            ),
          );
        if (
          runningAttempt !== undefined &&
          runningAttempt.leaseExpiresAt > startedAt
        ) {
          return {
            ok: true as const,
            role: "joiner" as const,
            follow,
            attemptId: runningAttempt.id,
          };
        }
        if (runningAttempt !== undefined) {
          await tx
            .update(discoverAcquisitionAttempts)
            .set({
              outcome: "skipped",
              finishedAt: startedAt,
              acceptedCount: 0,
              rejectedCount: 0,
              errorClass: "lease_expired",
            })
            .where(
              and(
                eq(discoverAcquisitionAttempts.id, runningAttempt.id),
                eq(discoverAcquisitionAttempts.outcome, "running"),
              ),
            );
        }
        const [target] = await tx
          .update(discoverProviderTargets)
          .set({
            acquisitionGeneration: sql`${discoverProviderTargets.acquisitionGeneration} + 1`,
          })
          .where(eq(discoverProviderTargets.id, follow.providerTargetId))
          .returning({
            generation: discoverProviderTargets.acquisitionGeneration,
          });
        const [attempt] = await tx
          .insert(discoverAcquisitionAttempts)
          .values({
            providerTargetId: follow.providerTargetId,
            generation: target.generation,
            trigger: request.trigger,
            startedAt,
            leaseExpiresAt: new Date(
              startedAt.getTime() + acquisitionLeaseMilliseconds,
            ),
          })
          .returning({ id: discoverAcquisitionAttempts.id });
        return {
          ok: true as const,
          role: "owner" as const,
          follow,
          startedAt,
          generation: target.generation,
          attemptId: attempt.id,
          leaseRecovered: runningAttempt !== undefined,
        };
      });
      if (!claim.ok) return claim;

      if (claim.role === "gated") {
        const health = await readTargetHealth({
          db,
          providerTargetId: claim.follow.providerTargetId,
        });
        return {
          ok: true,
          acquisition: {
            followId: request.followId,
            outcome: "throttled",
            acceptedCount: 0,
            rejectedCount: 0,
            ...health,
            nextEligibleAt: claim.nextEligibleAt.toISOString(),
          },
        };
      }

      if (claim.role === "joiner") {
        const joined = await waitForAttempt({
          db,
          attemptId: claim.attemptId,
          now,
        });
        await applyAvailableSnapshots({
          db,
          userId,
          followId: request.followId,
          appliedAt: now(),
        });
        const health = await readTargetHealth({
          db,
          providerTargetId: claim.follow.providerTargetId,
        });
        recordAcquisition({
          logger,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          trigger: request.trigger,
          outcome: joined.outcome === "skipped" ? "skipped" : "joined",
          acceptedCount: joined.acceptedCount,
          rejectedCount: joined.rejectedCount,
          retryCount: joined.retryCount,
          leaseRecovered: false,
          durationMs: joined.durationMs,
          coverageStartedAt: joined.coverageStartedAt,
        });
        return {
          ok: true,
          acquisition: {
            followId: request.followId,
            outcome: joined.outcome === "skipped" ? "skipped" : "joined",
            acceptedCount: joined.acceptedCount,
            rejectedCount: joined.rejectedCount,
            ...health,
          },
        };
      }

      const acquired =
        claim.follow.channelId === null
          ? ({ ok: false, error: "unverifiable" } as const)
          : await providerConcurrency(() =>
              youtube.acquireChannel({ channelId: claim.follow.channelId! }),
            );
      if (!acquired.ok) {
        const outcome = acquisitionFailureOutcome(acquired);
        const retryCount =
          "retryCount" in acquired ? (acquired.retryCount ?? 0) : 0;
        const providerNextEligibleAt =
          "nextEligibleAt" in acquired ? acquired.nextEligibleAt : undefined;
        const nextEligibleAt =
          providerNextEligibleAt === undefined
            ? outcome === "throttled"
              ? new Date(now().getTime() + providerGateFallbackMilliseconds)
              : null
            : new Date(providerNextEligibleAt);
        if (nextEligibleAt !== null) {
          await setProviderGate({
            db,
            provider: "youtube",
            nextEligibleAt,
            errorClass: acquired.error,
            updatedAt: now(),
          });
        }
        const terminalOutcome = await finishAttempt({
          db,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          generation: claim.generation,
          requestedOutcome: outcome,
          acceptedCount: 0,
          rejectedCount: 0,
          errorClass: acquired.error,
          finishedAt: now(),
          nextEligibleAt,
          retryCount,
        });
        const health = await readTargetHealth({
          db,
          providerTargetId: claim.follow.providerTargetId,
        });
        recordAcquisition({
          logger,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          trigger: request.trigger,
          outcome: terminalOutcome,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount,
          leaseRecovered: claim.leaseRecovered,
          errorClass: acquired.error,
          durationMs: elapsedMilliseconds(claim.startedAt, now()),
        });
        return {
          ok: true,
          acquisition: {
            followId: request.followId,
            outcome: terminalOutcome,
            acceptedCount: 0,
            rejectedCount: 0,
            ...health,
          },
        };
      }

      const publication = await publishAcquisition({
        db,
        acquired,
        attemptId: claim.attemptId,
        providerTargetId: claim.follow.providerTargetId,
        generation: claim.generation,
        publishedAt: now(),
      });
      if (
        publication.outcome === "failed" ||
        publication.outcome === "skipped"
      ) {
        const terminalOutcome = await finishAttempt({
          db,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          generation: claim.generation,
          requestedOutcome: publication.outcome,
          acceptedCount: 0,
          rejectedCount: 0,
          errorClass: publication.outcome === "failed" ? "target_drift" : null,
          finishedAt: now(),
          retryCount: acquired.retryCount ?? 0,
        });
        const health = await readTargetHealth({
          db,
          providerTargetId: claim.follow.providerTargetId,
        });
        recordAcquisition({
          logger,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          trigger: request.trigger,
          outcome: terminalOutcome,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount: acquired.retryCount ?? 0,
          leaseRecovered: claim.leaseRecovered,
          durationMs: elapsedMilliseconds(claim.startedAt, now()),
          errorClass:
            publication.outcome === "failed" ? "target_drift" : undefined,
        });
        return {
          ok: true,
          acquisition: {
            followId: request.followId,
            outcome: terminalOutcome,
            acceptedCount: 0,
            rejectedCount: 0,
            ...health,
          },
        };
      }

      try {
        await applyAvailableSnapshots({
          db,
          userId,
          followId: request.followId,
          appliedAt: now(),
        });
      } catch (error) {
        await finishAttempt({
          db,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          generation: claim.generation,
          requestedOutcome: "failed",
          acceptedCount: acquired.videos.length,
          rejectedCount: acquired.rejectedCount,
          errorClass: "application_failed",
          finishedAt: now(),
          coverageStartedAt: acquired.coverageStartedAt,
          retryCount: acquired.retryCount ?? 0,
        });
        recordAcquisition({
          logger,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          trigger: request.trigger,
          outcome: "failed",
          acceptedCount: acquired.videos.length,
          rejectedCount: acquired.rejectedCount,
          retryCount: acquired.retryCount ?? 0,
          leaseRecovered: claim.leaseRecovered,
          durationMs: elapsedMilliseconds(claim.startedAt, now()),
          coverageStartedAt: acquired.coverageStartedAt,
          errorClass: "application_failed",
        });
        throw error;
      }
      const terminalOutcome = await finishAttempt({
        db,
        attemptId: claim.attemptId,
        providerTargetId: claim.follow.providerTargetId,
        generation: claim.generation,
        requestedOutcome: publication.outcome,
        acceptedCount: acquired.videos.length,
        rejectedCount: acquired.rejectedCount,
        errorClass: null,
        finishedAt: now(),
        coverageStartedAt: acquired.coverageStartedAt,
        retryCount: acquired.retryCount ?? 0,
      });
      const health = await readTargetHealth({
        db,
        providerTargetId: claim.follow.providerTargetId,
      });
      recordAcquisition({
        logger,
        attemptId: claim.attemptId,
        providerTargetId: claim.follow.providerTargetId,
        trigger: request.trigger,
        outcome: terminalOutcome,
        acceptedCount: acquired.videos.length,
        rejectedCount: acquired.rejectedCount,
        retryCount: acquired.retryCount ?? 0,
        leaseRecovered: claim.leaseRecovered,
        durationMs: elapsedMilliseconds(claim.startedAt, now()),
        coverageStartedAt: acquired.coverageStartedAt,
      });
      return {
        ok: true,
        acquisition: {
          followId: request.followId,
          outcome: terminalOutcome,
          acceptedCount: acquired.videos.length,
          rejectedCount: acquired.rejectedCount,
          ...health,
        },
      };
    },
    readWorkspace: async ({ userId }) => {
      const followRows = await db
        .select({
          id: discoverFollows.id,
          lifecycle: discoverFollows.lifecycle,
          targetUrl: discoverFollows.targetUrl,
          createdAt: discoverFollows.createdAt,
          name: discoverProviderTargetProjections.publisher,
          providerTargetId: discoverFollows.providerTargetId,
          verifiedCoverageStartedAt:
            discoverProviderTargets.verifiedCoverageStartedAt,
          nextEligibleAt: discoverProviderTargets.nextEligibleAt,
        })
        .from(discoverFollows)
        .leftJoin(
          discoverProviderTargetProjections,
          eq(
            discoverProviderTargetProjections.providerTargetId,
            discoverFollows.providerTargetId,
          ),
        )
        .innerJoin(
          discoverProviderTargets,
          eq(discoverProviderTargets.id, discoverFollows.providerTargetId),
        )
        .where(eq(discoverFollows.userId, userId))
        .orderBy(asc(discoverFollows.createdAt));
      const targetIds = followRows.map((follow) => follow.providerTargetId);
      const attempts =
        targetIds.length === 0
          ? []
          : await db
              .select({
                providerTargetId: discoverAcquisitionAttempts.providerTargetId,
                outcome: discoverAcquisitionAttempts.outcome,
                generation: discoverAcquisitionAttempts.generation,
                startedAt: discoverAcquisitionAttempts.startedAt,
                finishedAt: discoverAcquisitionAttempts.finishedAt,
                nextEligibleAt: discoverAcquisitionAttempts.nextEligibleAt,
              })
              .from(discoverAcquisitionAttempts)
              .where(
                inArray(
                  discoverAcquisitionAttempts.providerTargetId,
                  targetIds,
                ),
              )
              .orderBy(
                desc(discoverAcquisitionAttempts.startedAt),
                desc(discoverAcquisitionAttempts.generation),
              );
      return {
        follows: followRows.map((follow) => {
          const targetAttempts = attempts.filter(
            (attempt) => attempt.providerTargetId === follow.providerTargetId,
          );
          return toFollowSummary({
            ...follow,
            health: toFollowAcquisitionHealth({
              attempts: targetAttempts,
              verifiedCoverageStartedAt: follow.verifiedCoverageStartedAt,
              targetNextEligibleAt: follow.nextEligibleAt,
            }),
          });
        }),
        discoveries: await selectDiscoveries({ query: db, userId }),
      };
    },
  };
}

async function waitForAttempt({
  db,
  attemptId,
  now,
}: {
  db: Database;
  attemptId: string;
  now: () => Date;
}): Promise<{
  outcome: string;
  acceptedCount: number;
  rejectedCount: number;
  retryCount: number;
  durationMs: number;
  coverageStartedAt?: string;
}> {
  for (;;) {
    const [attempt] = await db
      .select({
        outcome: discoverAcquisitionAttempts.outcome,
        leaseExpiresAt: discoverAcquisitionAttempts.leaseExpiresAt,
        acceptedCount: discoverAcquisitionAttempts.acceptedCount,
        rejectedCount: discoverAcquisitionAttempts.rejectedCount,
        retryCount: discoverAcquisitionAttempts.retryCount,
        startedAt: discoverAcquisitionAttempts.startedAt,
        finishedAt: discoverAcquisitionAttempts.finishedAt,
        coverageStartedAt: discoverAcquisitionAttempts.coverageStartedAt,
      })
      .from(discoverAcquisitionAttempts)
      .where(eq(discoverAcquisitionAttempts.id, attemptId));
    if (attempt === undefined) {
      throw new Error("Joined acquisition attempt disappeared");
    }
    if (attempt.outcome !== "running") {
      return {
        outcome: attempt.outcome,
        acceptedCount: attempt.acceptedCount ?? 0,
        rejectedCount: attempt.rejectedCount ?? 0,
        retryCount: attempt.retryCount,
        durationMs: elapsedMilliseconds(
          attempt.startedAt,
          attempt.finishedAt ?? attempt.startedAt,
        ),
        ...(attempt.coverageStartedAt === null
          ? {}
          : { coverageStartedAt: attempt.coverageStartedAt.toISOString() }),
      };
    }
    const observedAt = now();
    if (attempt.leaseExpiresAt <= observedAt) {
      await db
        .update(discoverAcquisitionAttempts)
        .set({
          outcome: "skipped",
          finishedAt: observedAt,
          acceptedCount: 0,
          rejectedCount: 0,
          errorClass: "lease_expired",
        })
        .where(
          and(
            eq(discoverAcquisitionAttempts.id, attemptId),
            eq(discoverAcquisitionAttempts.outcome, "running"),
          ),
        );
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, joinPollMilliseconds));
  }
}

function recordAcquisition({
  logger,
  attemptId,
  providerTargetId,
  trigger,
  outcome,
  acceptedCount,
  rejectedCount,
  retryCount,
  leaseRecovered,
  durationMs,
  coverageStartedAt,
  errorClass,
}: {
  logger: Logger;
  attemptId: string;
  providerTargetId: string;
  trigger: string;
  outcome: string;
  acceptedCount: number;
  rejectedCount: number;
  retryCount: number;
  leaseRecovered: boolean;
  durationMs: number;
  coverageStartedAt?: string;
  errorClass?: string;
}): void {
  logger.info({
    event: "unshelf.discover.acquisition.ended",
    msg: "Discover Provider acquisition ended",
    attemptId,
    providerTargetId,
    trigger,
    outcome,
    acceptedCount,
    rejectedCount,
    retryCount,
    leaseRecovered,
    durationMs,
    ...(coverageStartedAt === undefined ? {} : { coverageStartedAt }),
    ...(errorClass === undefined ? {} : { errorClass }),
  });
}

function elapsedMilliseconds(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

async function setProviderGate({
  db,
  provider,
  nextEligibleAt,
  errorClass,
  updatedAt,
}: {
  db: Database;
  provider: string;
  nextEligibleAt: Date;
  errorClass: string;
  updatedAt: Date;
}): Promise<void> {
  await db
    .insert(discoverProviderGates)
    .values({ provider, nextEligibleAt, errorClass, updatedAt })
    .onConflictDoUpdate({
      target: discoverProviderGates.provider,
      set: {
        nextEligibleAt: sql`greatest(${discoverProviderGates.nextEligibleAt}, ${nextEligibleAt})`,
        errorClass,
        updatedAt,
      },
    });
}

async function readTargetHealth({
  db,
  providerTargetId,
}: {
  db: Database;
  providerTargetId: string;
}): Promise<FollowSummary["health"]> {
  const [target] = await db
    .select({
      verifiedCoverageStartedAt:
        discoverProviderTargets.verifiedCoverageStartedAt,
      nextEligibleAt: discoverProviderTargets.nextEligibleAt,
    })
    .from(discoverProviderTargets)
    .where(eq(discoverProviderTargets.id, providerTargetId));
  const attempts = await db
    .select({
      outcome: discoverAcquisitionAttempts.outcome,
      generation: discoverAcquisitionAttempts.generation,
      startedAt: discoverAcquisitionAttempts.startedAt,
      finishedAt: discoverAcquisitionAttempts.finishedAt,
      nextEligibleAt: discoverAcquisitionAttempts.nextEligibleAt,
    })
    .from(discoverAcquisitionAttempts)
    .where(eq(discoverAcquisitionAttempts.providerTargetId, providerTargetId))
    .orderBy(
      desc(discoverAcquisitionAttempts.startedAt),
      desc(discoverAcquisitionAttempts.generation),
    );
  return toFollowAcquisitionHealth({
    attempts,
    verifiedCoverageStartedAt: target?.verifiedCoverageStartedAt ?? null,
    targetNextEligibleAt: target?.nextEligibleAt ?? null,
  });
}

function toFollowAcquisitionHealth({
  attempts,
  verifiedCoverageStartedAt,
  targetNextEligibleAt,
}: {
  attempts: Array<{
    outcome: string;
    startedAt: Date;
    finishedAt: Date | null;
    nextEligibleAt: Date | null;
  }>;
  verifiedCoverageStartedAt: Date | null;
  targetNextEligibleAt: Date | null;
}): FollowSummary["health"] {
  const latest = attempts[0];
  const latestComplete = attempts.find(
    (attempt) => attempt.outcome === "complete",
  );
  return {
    latestAttemptAt: latest?.startedAt.toISOString() ?? null,
    latestAttemptOutcome:
      latest?.outcome === undefined || latest.outcome === "running"
        ? null
        : (latest.outcome as FollowSummary["health"]["latestAttemptOutcome"]),
    latestCompleteAt: latestComplete?.finishedAt?.toISOString() ?? null,
    verifiedCoverageStartedAt: verifiedCoverageStartedAt?.toISOString() ?? null,
    nextEligibleAt:
      latest?.nextEligibleAt?.toISOString() ??
      targetNextEligibleAt?.toISOString() ??
      null,
  };
}

function acquisitionFailureOutcome(
  result: Exclude<ProviderPreviewResult, ProviderPreview>,
): "failed" | "throttled" | "provider_unavailable" {
  if (result.error === "quota_exceeded") return "throttled";
  if (result.error === "provider_unavailable") return "provider_unavailable";
  return "failed";
}

async function finishAttempt({
  db,
  attemptId,
  providerTargetId,
  generation,
  requestedOutcome,
  acceptedCount,
  rejectedCount,
  errorClass,
  finishedAt,
  coverageStartedAt,
  nextEligibleAt = null,
  retryCount = 0,
}: {
  db: Database;
  attemptId: string;
  providerTargetId: string;
  generation: number;
  requestedOutcome:
    | "complete"
    | "partial"
    | "failed"
    | "skipped"
    | "throttled"
    | "provider_unavailable";
  acceptedCount: number;
  rejectedCount: number;
  errorClass: string | null;
  finishedAt: Date;
  coverageStartedAt?: string;
  nextEligibleAt?: Date | null;
  retryCount?: number;
}): Promise<Exclude<FollowSummary["health"]["latestAttemptOutcome"], null>> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ generation: discoverProviderTargets.acquisitionGeneration })
      .from(discoverProviderTargets)
      .where(eq(discoverProviderTargets.id, providerTargetId))
      .for("update");
    const outcome =
      target?.generation === generation ? requestedOutcome : "skipped";
    await tx
      .update(discoverAcquisitionAttempts)
      .set({
        outcome,
        finishedAt,
        acceptedCount: outcome === "skipped" ? 0 : acceptedCount,
        rejectedCount: outcome === "skipped" ? 0 : rejectedCount,
        errorClass,
        nextEligibleAt,
        retryCount,
        coverageStartedAt:
          coverageStartedAt === undefined ? null : new Date(coverageStartedAt),
      })
      .where(
        and(
          eq(discoverAcquisitionAttempts.id, attemptId),
          eq(discoverAcquisitionAttempts.outcome, "running"),
        ),
      );
    if (outcome !== "skipped") {
      await tx
        .update(discoverProviderTargets)
        .set({ nextEligibleAt })
        .where(eq(discoverProviderTargets.id, providerTargetId));
    }
    return outcome;
  });
}

async function publishAcquisition({
  db,
  acquired,
  attemptId,
  providerTargetId,
  generation,
  publishedAt,
}: {
  db: Database;
  acquired: ProviderPreview;
  attemptId: string;
  providerTargetId: string;
  generation: number;
  publishedAt: Date;
}): Promise<
  | { outcome: "complete" | "partial"; snapshotId: string }
  | { outcome: "failed" | "skipped" }
> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        generation: discoverProviderTargets.acquisitionGeneration,
        externalReference: discoverProviderTargets.externalReference,
      })
      .from(discoverProviderTargets)
      .where(eq(discoverProviderTargets.id, providerTargetId))
      .for("update");
    const [attempt] = await tx
      .select({ outcome: discoverAcquisitionAttempts.outcome })
      .from(discoverAcquisitionAttempts)
      .where(eq(discoverAcquisitionAttempts.id, attemptId))
      .for("update");
    if (target?.generation !== generation || attempt?.outcome !== "running") {
      return { outcome: "skipped" as const };
    }
    if (target.externalReference !== acquired.channelId) {
      return { outcome: "failed" as const };
    }

    const providerExpiresAt = new Date(
      publishedAt.getTime() + providerRetentionMilliseconds,
    );
    await tx
      .update(discoverProviderTargets)
      .set({
        targetPayload: {
          schemaVersion: 1,
          uploadsPlaylistId: acquired.uploadsPlaylistId,
        },
        fetchedAt: publishedAt,
        expiresAt: providerExpiresAt,
      })
      .where(eq(discoverProviderTargets.id, providerTargetId));
    await tx
      .insert(discoverProviderTargetProjections)
      .values({
        providerTargetId,
        publisher: acquired.publisher,
        fetchedAt: publishedAt,
        expiresAt: providerExpiresAt,
      })
      .onConflictDoUpdate({
        target: discoverProviderTargetProjections.providerTargetId,
        set: {
          publisher: acquired.publisher,
          fetchedAt: publishedAt,
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
          fetchedAt: publishedAt,
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
            fetchedAt: publishedAt,
            expiresAt: providerExpiresAt,
          },
        });
    }

    const [latest] = await tx
      .select({ sequence: max(discoverProviderSnapshots.sequence) })
      .from(discoverProviderSnapshots)
      .where(eq(discoverProviderSnapshots.providerTargetId, providerTargetId));
    const outcome = acquired.outcome === "partial" ? "partial" : "complete";
    const [snapshot] = await tx
      .insert(discoverProviderSnapshots)
      .values({
        providerTargetId,
        acquisitionAttemptId: attemptId,
        sequence: (latest?.sequence ?? 0) + 1,
        outcome: acquired.outcome,
        rejectedCount: acquired.rejectedCount,
        coverageStartedAt: new Date(acquired.coverageStartedAt),
        publishedAt,
      })
      .returning({ id: discoverProviderSnapshots.id });
    if (acquired.videos.length > 0) {
      await tx.insert(discoverProviderSnapshotResults).values(
        acquired.videos.map((video, position) => ({
          snapshotId: snapshot.id,
          providerResultId: resultIds.get(video.providerIdentity)!,
          position,
        })),
      );
    }
    await tx
      .update(discoverProviderTargets)
      .set({
        currentSnapshotId: snapshot.id,
        ...(outcome === "complete"
          ? {
              checkpointPayload: {
                schemaVersion: 1,
                coverageStartedAt: acquired.coverageStartedAt,
              },
              verifiedCoverageStartedAt: new Date(acquired.coverageStartedAt),
            }
          : {}),
      })
      .where(eq(discoverProviderTargets.id, providerTargetId));
    return { outcome, snapshotId: snapshot.id };
  });
}

async function applyAvailableSnapshots({
  db,
  userId,
  followId,
  appliedAt,
}: {
  db: Database;
  userId: UserId;
  followId: FollowId;
  appliedAt: Date;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [follow] = await tx
      .select({
        lifecycle: discoverFollows.lifecycle,
        providerTargetId: discoverFollows.providerTargetId,
        lastAppliedProviderSnapshotId:
          discoverFollows.lastAppliedProviderSnapshotId,
      })
      .from(discoverFollows)
      .where(
        and(
          eq(discoverFollows.id, followId),
          eq(discoverFollows.userId, userId),
        ),
      )
      .for("update");
    if (follow === undefined || follow.lifecycle !== "active") return;
    const [lastApplied] =
      follow.lastAppliedProviderSnapshotId === null
        ? []
        : await tx
            .select({ sequence: discoverProviderSnapshots.sequence })
            .from(discoverProviderSnapshots)
            .where(
              eq(
                discoverProviderSnapshots.id,
                follow.lastAppliedProviderSnapshotId,
              ),
            );
    const snapshots = await tx
      .select({
        id: discoverProviderSnapshots.id,
        sequence: discoverProviderSnapshots.sequence,
        outcome: discoverProviderSnapshots.outcome,
      })
      .from(discoverProviderSnapshots)
      .where(
        and(
          eq(
            discoverProviderSnapshots.providerTargetId,
            follow.providerTargetId,
          ),
          gt(discoverProviderSnapshots.sequence, lastApplied?.sequence ?? 0),
        ),
      )
      .orderBy(asc(discoverProviderSnapshots.sequence));

    for (const snapshot of snapshots) {
      const members = await tx
        .select({
          providerResultId: discoverProviderSnapshotResults.providerResultId,
          position: discoverProviderSnapshotResults.position,
        })
        .from(discoverProviderSnapshotResults)
        .where(eq(discoverProviderSnapshotResults.snapshotId, snapshot.id))
        .orderBy(asc(discoverProviderSnapshotResults.position));
      const presentCandidateIds: string[] = [];
      for (const member of members) {
        const [candidate] = await tx
          .insert(discoverCandidates)
          .values({
            userId,
            providerResultId: member.providerResultId,
            createdAt: appliedAt,
          })
          .onConflictDoUpdate({
            target: [
              discoverCandidates.userId,
              discoverCandidates.providerResultId,
            ],
            set: { providerResultId: member.providerResultId },
          })
          .returning({ id: discoverCandidates.id });
        presentCandidateIds.push(candidate.id);
        const [presence] = await tx
          .select({
            present: discoverFollowCandidatePresence.present,
            appearanceSequence:
              discoverFollowCandidatePresence.appearanceSequence,
          })
          .from(discoverFollowCandidatePresence)
          .where(
            and(
              eq(discoverFollowCandidatePresence.followId, followId),
              eq(discoverFollowCandidatePresence.candidateId, candidate.id),
            ),
          )
          .for("update");
        const appearanceSequence =
          presence === undefined
            ? 1
            : presence.present
              ? presence.appearanceSequence
              : presence.appearanceSequence + 1;
        const createsDiscovery = presence === undefined || !presence.present;
        await tx
          .insert(discoverFollowCandidatePresence)
          .values({
            userId,
            followId,
            candidateId: candidate.id,
            appearanceSequence,
            present: true,
            firstSurfacedSnapshotId: snapshot.id,
            lastSurfacedSnapshotId: snapshot.id,
          })
          .onConflictDoUpdate({
            target: [
              discoverFollowCandidatePresence.followId,
              discoverFollowCandidatePresence.candidateId,
            ],
            set: {
              appearanceSequence,
              present: true,
              lastSurfacedSnapshotId: snapshot.id,
            },
          });
        if (createsDiscovery) {
          await tx.insert(discoverDiscoveries).values({
            userId,
            followId,
            candidateId: candidate.id,
            appearanceSequence,
            position: member.position,
            state: "new",
            discoveredAt: appliedAt,
          });
        }
      }
      if (snapshot.outcome !== "partial") {
        await tx
          .update(discoverFollowCandidatePresence)
          .set({ present: false })
          .where(
            and(
              eq(discoverFollowCandidatePresence.userId, userId),
              eq(discoverFollowCandidatePresence.followId, followId),
              presentCandidateIds.length === 0
                ? undefined
                : notInArray(
                    discoverFollowCandidatePresence.candidateId,
                    presentCandidateIds,
                  ),
            ),
          );
      }
      await tx
        .update(discoverFollows)
        .set({
          lastAppliedProviderSnapshotId: snapshot.id,
          updatedAt: appliedAt,
        })
        .where(
          and(
            eq(discoverFollows.id, followId),
            eq(discoverFollows.userId, userId),
          ),
        );
    }
  });
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
  health?: FollowSummary["health"];
}): FollowSummary {
  return {
    id: row.id as FollowId,
    provider: "youtube",
    lifecycle: row.lifecycle as FollowSummary["lifecycle"],
    name: row.name,
    targetUrl: row.targetUrl,
    createdAt: row.createdAt.toISOString(),
    health: row.health ?? {
      latestAttemptAt: null,
      latestAttemptOutcome: null,
      latestCompleteAt: null,
      verifiedCoverageStartedAt: null,
      nextEligibleAt: null,
    },
  };
}
