import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  max,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import pLimit from "p-limit";
import { Status, StatusMode, Type } from "@unshelf/shared";
import type {
  CandidateId,
  AcquireAndApplyRequest,
  AcquireAndApplyResponse,
  ConfirmFollowFailure,
  ConfirmFollowRequest,
  ConfirmFollowResponse,
  DecideDiscoveriesRequest,
  DecideDiscoveriesResponse,
  DiscoverHistoryCursor,
  DiscoverHistoryPage,
  DiscoverHistoryQuery,
  DiscoverWorkspace,
  DiscoveryId,
  DiscoverySummary,
  FollowId,
  FollowPreviewId,
  FollowSummary,
  IdempotencyKey,
  ItemId,
  KeepDiscoveryRequest,
  KeepDiscoveryResponse,
  PrepareFollowRequest,
  PrepareFollowResponse,
  SetFollowLifecycleRequest,
  SetFollowLifecycleFailure,
  SetFollowLifecycleResponse,
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
  items,
} from "../schema";
import type {
  ProviderPreview,
  ProviderPreviewResult,
  YouTubeAdapter,
} from "./youtube-adapter";

const previewLifetimeMilliseconds = 15 * 60 * 1_000;
const providerRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000;
const providerRetentionSafetyMilliseconds = 24 * 60 * 60 * 1_000;
const acquisitionLeaseMilliseconds = 35 * 1_000;
const joinPollMilliseconds = 10;
const providerGateFallbackMilliseconds = 15 * 60 * 1_000;
const appOpenFreshnessMilliseconds = 15 * 60 * 1_000;

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
  setFollowLifecycle(input: {
    userId: UserId;
    followId: FollowId;
    request: SetFollowLifecycleRequest;
    idempotencyKey: IdempotencyKey;
  }): Promise<SetFollowLifecycleResponse>;
  decide(input: {
    userId: UserId;
    request: DecideDiscoveriesRequest;
    idempotencyKey: IdempotencyKey;
  }): Promise<DecideDiscoveriesResponse>;
  keep(input: {
    userId: UserId;
    discoveryId: DiscoveryId;
    request: KeepDiscoveryRequest;
    idempotencyKey: IdempotencyKey;
  }): Promise<KeepDiscoveryResponse>;
  readHistory(input: {
    userId: UserId;
    query: DiscoverHistoryQuery;
  }): Promise<
    | { ok: true; history: DiscoverHistoryPage }
    | { ok: false; error: "invalid_cursor" }
  >;
  purgeProviderData(
    input:
      | { kind: "expire_due"; batchSize?: number; dryRun?: boolean }
      | { kind: "complete"; provider: "youtube"; batchSize?: number },
  ): Promise<ProviderPurgeReport>;
}

export interface ProviderPurgeReport {
  kind: "expire_due" | "complete";
  provider: "youtube";
  dryRun: boolean;
  clearedRows: number;
  skippedGenerationRows: number;
  failedOperations: number;
  dueRows: number;
  deadlineRiskRows: number;
  truncated: boolean;
}

type InternalDiscoverModule = Omit<DiscoverModule, "acquireAndApply"> & {
  acquireAndApply(
    input: Parameters<DiscoverModule["acquireAndApply"]>[0] & {
      originatingTrigger?: AcquireAndApplyRequest["trigger"];
    },
  ): ReturnType<DiscoverModule["acquireAndApply"]>;
};

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
  const module: InternalDiscoverModule = {
    prepareFollow: async ({ userId, request }) => {
      if (await isProviderSuspended({ db, provider: "youtube" })) {
        return { ok: false, error: "provider_unavailable" };
      }
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
        await lockProviderPublication({ tx, provider: "youtube" });
        const [providerGate] = await tx
          .select({ errorClass: discoverProviderGates.errorClass })
          .from(discoverProviderGates)
          .where(eq(discoverProviderGates.provider, "youtube"));
        if (providerGate?.errorClass === "provider_suspended") {
          return { ok: false, error: "provider_unavailable" };
        }
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
              acquisitionGeneration: sql`${discoverProviderTargets.acquisitionGeneration} + 1`,
              dataGeneration: sql`${discoverProviderTargets.dataGeneration} + 1`,
              fetchedAt: createdAt,
              expiresAt: providerExpiresAt,
            },
          })
          .returning({
            id: discoverProviderTargets.id,
            generation: discoverProviderTargets.dataGeneration,
          });
        await publishTargetProjection({
          tx,
          providerTargetId: target.id,
          publisher: acquired.publisher,
          generation: target.generation,
          fetchedAt: createdAt,
          expiresAt: providerExpiresAt,
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

        const resultIds = await publishProviderResults({
          tx,
          videos: acquired.videos,
          fetchedAt: createdAt,
          expiresAt: providerExpiresAt,
        });

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
            ...(existingFollow?.lifecycle === "removed"
              ? { restoresFollowId: existingFollow.id as FollowId }
              : {}),
          },
        };
      });
    },
    confirmFollow: async ({ userId, request, idempotencyKey }) =>
      db.transaction(async (tx): Promise<ConfirmFollowResponse> => {
        const requestFingerprint = request.previewId;
        const idempotency =
          await beginIdempotentMutation<ConfirmFollowResponse>({
            tx,
            userId,
            operation: "confirm_follow",
            idempotencyKey,
            requestFingerprint,
          });
        if (!idempotency.ok) return idempotency;
        if (idempotency.replay !== null) return idempotency.replay;

        const fail = async (
          error: ConfirmFollowFailure,
        ): Promise<ConfirmFollowResponse> =>
          idempotency.persist({ ok: false, error });

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
          currentTime: confirmedAt,
        });
        const result: ConfirmFollowResponse = {
          ok: true,
          follow,
          discoveries,
        };
        return idempotency.persist(result);
      }),
    acquireAndApply: async ({
      userId,
      request,
      originatingTrigger = request.trigger,
    }) => {
      if (request.trigger !== "manual_follow") {
        const workspaceRefreshedAt = now();
        const activeFollows = await db
          .select({
            id: discoverFollows.id,
            providerTargetId: discoverFollows.providerTargetId,
          })
          .from(discoverFollows)
          .where(
            and(
              eq(discoverFollows.userId, userId),
              eq(discoverFollows.lifecycle, "active"),
            ),
          )
          .orderBy(asc(discoverFollows.createdAt));

        const recentlyAttemptedTargetIds = new Set<string>();
        if (request.trigger === "app_open" && activeFollows.length > 0) {
          const freshnessBoundary = new Date(
            workspaceRefreshedAt.getTime() - appOpenFreshnessMilliseconds,
          );
          const recentAttempts = await db
            .select({
              providerTargetId: discoverAcquisitionAttempts.providerTargetId,
            })
            .from(discoverAcquisitionAttempts)
            .where(
              and(
                inArray(
                  discoverAcquisitionAttempts.providerTargetId,
                  activeFollows.map(({ providerTargetId }) => providerTargetId),
                ),
                inArray(discoverAcquisitionAttempts.outcome, [
                  "complete",
                  "partial",
                  "failed",
                ]),
                gte(discoverAcquisitionAttempts.startedAt, freshnessBoundary),
              ),
            );
          for (const { providerTargetId } of recentAttempts) {
            recentlyAttemptedTargetIds.add(providerTargetId);
          }
        }

        const results = await Promise.all(
          activeFollows.map(async ({ id, providerTargetId }) => {
            if (recentlyAttemptedTargetIds.has(providerTargetId)) {
              return {
                ok: true as const,
                acquisition: {
                  followId: id as FollowId,
                  outcome: "skipped" as const,
                  acceptedCount: 0,
                  rejectedCount: 0,
                  ...(await readTargetHealth({ db, providerTargetId })),
                },
              };
            }
            return module.acquireAndApply({
              userId,
              originatingTrigger: request.trigger,
              request: {
                trigger: "manual_follow",
                followId: id as FollowId,
              },
            });
          }),
        );
        const acquisitions = results.flatMap((result) =>
          result.ok && "acquisition" in result ? [result.acquisition] : [],
        );
        const freshnessSkippedFollowIds = new Set(
          activeFollows
            .filter(({ providerTargetId }) =>
              recentlyAttemptedTargetIds.has(providerTargetId),
            )
            .map(({ id }) => id),
        );
        await db.transaction(async (tx) => {
          for (const acquisition of acquisitions) {
            const latestAttemptOutcome = acquisition.latestAttemptOutcome;
            const workspaceOutcome =
              freshnessSkippedFollowIds.has(acquisition.followId) &&
              (latestAttemptOutcome === "complete" ||
                latestAttemptOutcome === "partial" ||
                latestAttemptOutcome === "failed")
                ? latestAttemptOutcome
                : acquisition.outcome;
            await tx
              .update(discoverFollows)
              .set({
                latestWorkspaceRefreshOutcome: workspaceOutcome,
                latestWorkspaceRefreshedAt: workspaceRefreshedAt,
              })
              .where(
                and(
                  eq(discoverFollows.id, acquisition.followId),
                  eq(discoverFollows.userId, userId),
                ),
              );
          }
        });
        return {
          ok: true,
          acquisitions,
        };
      }
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
          .select({
            nextEligibleAt: discoverProviderGates.nextEligibleAt,
            errorClass: discoverProviderGates.errorClass,
          })
          .from(discoverProviderGates)
          .where(eq(discoverProviderGates.provider, "youtube"));
        if (
          providerGate !== undefined &&
          providerGate.nextEligibleAt > startedAt
        ) {
          if (providerGate.errorClass === "provider_suspended") {
            return {
              ok: true as const,
              role: "suspended" as const,
              follow,
            };
          }
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
            trigger: originatingTrigger,
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

      if (claim.role === "suspended") {
        const health = await readTargetHealth({
          db,
          providerTargetId: claim.follow.providerTargetId,
        });
        return {
          ok: true,
          acquisition: {
            followId: request.followId,
            outcome: "provider_unavailable",
            acceptedCount: 0,
            rejectedCount: 0,
            ...health,
            nextEligibleAt: null,
          },
        };
      }

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
          trigger: originatingTrigger,
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

      const providerRun = await providerConcurrency(async () => {
        const providerStartedAt = now();
        const ownsAttempt = await renewAttemptLease({
          db,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          generation: claim.generation,
          leaseExpiresAt: new Date(
            providerStartedAt.getTime() + acquisitionLeaseMilliseconds,
          ),
        });
        if (!ownsAttempt) return { ownsAttempt: false as const };
        const acquired =
          claim.follow.channelId === null
            ? await youtube.acquireChannelByUrl({
                url: claim.follow.targetUrl,
              })
            : await youtube.acquireChannel({
                channelId: claim.follow.channelId,
              });
        return { ownsAttempt: true as const, acquired };
      });
      if (!providerRun.ownsAttempt) {
        const health = await readTargetHealth({
          db,
          providerTargetId: claim.follow.providerTargetId,
        });
        recordAcquisition({
          logger,
          attemptId: claim.attemptId,
          providerTargetId: claim.follow.providerTargetId,
          trigger: originatingTrigger,
          outcome: "skipped",
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount: 0,
          leaseRecovered: claim.leaseRecovered,
          durationMs: elapsedMilliseconds({
            startedAt: claim.startedAt,
            finishedAt: now(),
          }),
          errorClass: "attempt_superseded",
        });
        return {
          ok: true,
          acquisition: {
            followId: request.followId,
            outcome: "skipped",
            acceptedCount: 0,
            rejectedCount: 0,
            ...health,
          },
        };
      }
      const { acquired } = providerRun;
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
          trigger: originatingTrigger,
          outcome: terminalOutcome,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount,
          leaseRecovered: claim.leaseRecovered,
          errorClass: acquired.error,
          durationMs: elapsedMilliseconds({
            startedAt: claim.startedAt,
            finishedAt: now(),
          }),
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
      if (!("snapshotId" in publication)) {
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
          trigger: originatingTrigger,
          outcome: terminalOutcome,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount: acquired.retryCount ?? 0,
          leaseRecovered: claim.leaseRecovered,
          durationMs: elapsedMilliseconds({
            startedAt: claim.startedAt,
            finishedAt: now(),
          }),
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
          trigger: originatingTrigger,
          outcome: "failed",
          acceptedCount: acquired.videos.length,
          rejectedCount: acquired.rejectedCount,
          retryCount: acquired.retryCount ?? 0,
          leaseRecovered: claim.leaseRecovered,
          durationMs: elapsedMilliseconds({
            startedAt: claim.startedAt,
            finishedAt: now(),
          }),
          coverageStartedAt: acquired.coverageStartedAt,
          previousCoverageStartedAt: publication.previousCoverageStartedAt,
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
        trigger: originatingTrigger,
        outcome: terminalOutcome,
        acceptedCount: acquired.videos.length,
        rejectedCount: acquired.rejectedCount,
        retryCount: acquired.retryCount ?? 0,
        leaseRecovered: claim.leaseRecovered,
        durationMs: elapsedMilliseconds({
          startedAt: claim.startedAt,
          finishedAt: now(),
        }),
        coverageStartedAt: acquired.coverageStartedAt,
        previousCoverageStartedAt: publication.previousCoverageStartedAt,
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
    setFollowLifecycle: async ({
      userId,
      followId,
      request,
      idempotencyKey,
    }) => {
      const requestFingerprint = `${followId}:${request.lifecycle}`;
      return db.transaction(async (tx): Promise<SetFollowLifecycleResponse> => {
        const idempotency =
          await beginIdempotentMutation<SetFollowLifecycleResponse>({
            tx,
            userId,
            operation: "set_follow_lifecycle",
            idempotencyKey,
            requestFingerprint,
          });
        if (!idempotency.ok) return idempotency;
        if (idempotency.replay !== null) return idempotency.replay;
        const persistFailure = async (
          error: Exclude<SetFollowLifecycleFailure, "idempotency_conflict">,
        ): Promise<SetFollowLifecycleResponse> =>
          idempotency.persist({ ok: false, error });
        const [follow] = await tx
          .select({ lifecycle: discoverFollows.lifecycle })
          .from(discoverFollows)
          .where(
            and(
              eq(discoverFollows.id, followId),
              eq(discoverFollows.userId, userId),
            ),
          )
          .for("update");
        if (follow === undefined) {
          return persistFailure("follow_missing");
        }
        if (follow.lifecycle === "removed" && request.lifecycle !== "removed") {
          return persistFailure("lifecycle_conflict");
        }
        await tx
          .update(discoverFollows)
          .set({ lifecycle: request.lifecycle, updatedAt: now() })
          .where(
            and(
              eq(discoverFollows.id, followId),
              eq(discoverFollows.userId, userId),
            ),
          );
        if (request.lifecycle === "active") {
          await applyAvailableSnapshots({
            db: tx,
            userId,
            followId,
            appliedAt: now(),
            currentOnly: true,
          });
        }
        const workspace = await selectWorkspace({
          query: tx,
          userId,
          currentTime: now(),
        });
        const updatedFollow = workspace.follows.find(
          ({ id }) => id === followId,
        );
        if (updatedFollow === undefined) {
          throw new Error("Updated Follow disappeared");
        }
        const result: SetFollowLifecycleResponse = {
          ok: true,
          follow: updatedFollow,
        };
        return idempotency.persist(result);
      });
    },
    decide: async ({ userId, request, idempotencyKey }) => {
      const orderedIds = [...request.discoveryIds].sort();
      const requestFingerprint = `${request.decision}:${orderedIds.join(",")}`;
      return db.transaction(async (tx): Promise<DecideDiscoveriesResponse> => {
        const idempotency =
          await beginIdempotentMutation<DecideDiscoveriesResponse>({
            tx,
            userId,
            operation: "decide_discoveries",
            idempotencyKey,
            requestFingerprint,
          });
        if (!idempotency.ok) return idempotency;
        if (idempotency.replay !== null) return idempotency.replay;

        const rows = await tx
          .select({
            id: discoverDiscoveries.id,
            candidateId: discoverDiscoveries.candidateId,
            state: discoverDiscoveries.state,
            seenAt: discoverDiscoveries.seenAt,
            decidedAt: discoverDiscoveries.decidedAt,
          })
          .from(discoverDiscoveries)
          .where(
            and(
              eq(discoverDiscoveries.userId, userId),
              inArray(discoverDiscoveries.id, request.discoveryIds),
            ),
          )
          .for("update");
        let result: DecideDiscoveriesResponse;
        if (rows.length !== request.discoveryIds.length) {
          result = { ok: false, error: "discovery_missing" };
        } else {
          const candidateIds = [
            ...new Set(rows.map(({ candidateId }) => candidateId)),
          ];
          const lockedCandidates = await tx
            .select({ id: discoverCandidates.id })
            .from(discoverCandidates)
            .where(
              and(
                eq(discoverCandidates.userId, userId),
                inArray(discoverCandidates.id, candidateIds),
              ),
            )
            .for("update");
          if (lockedCandidates.length !== candidateIds.length) {
            result = { ok: false, error: "discovery_missing" };
          } else if (
            rows.some(({ state }) => state === "kept" || state === "dismissed")
          ) {
            result = { ok: false, error: "decision_conflict" };
          } else {
            const decidedAt = now();
            await tx
              .update(discoverDiscoveries)
              .set(
                request.decision === "seen"
                  ? { state: "seen", seenAt: decidedAt }
                  : { state: "dismissed", decidedAt },
              )
              .where(
                and(
                  eq(discoverDiscoveries.userId, userId),
                  inArray(discoverDiscoveries.id, request.discoveryIds),
                  request.decision === "seen"
                    ? eq(discoverDiscoveries.state, "new")
                    : or(
                        eq(discoverDiscoveries.state, "new"),
                        eq(discoverDiscoveries.state, "seen"),
                      ),
                ),
              );
            const byId = new Map(rows.map((row) => [row.id, row]));
            result = {
              ok: true,
              discoveries: request.discoveryIds.map((id) => {
                const row = byId.get(id);
                if (row === undefined) {
                  throw new Error("Locked Discovery disappeared");
                }
                return {
                  id,
                  state: request.decision,
                  seenAt:
                    request.decision === "seen"
                      ? (row.seenAt ?? decidedAt).toISOString()
                      : (row.seenAt?.toISOString() ?? null),
                  decidedAt:
                    request.decision === "dismissed"
                      ? decidedAt.toISOString()
                      : null,
                };
              }),
            };
          }
        }
        return idempotency.persist(result);
      });
    },
    keep: async ({ userId, discoveryId, request, idempotencyKey }) => {
      const requestFingerprint = JSON.stringify({ discoveryId, ...request });
      return db.transaction(async (tx): Promise<KeepDiscoveryResponse> => {
        const idempotency =
          await beginIdempotentMutation<KeepDiscoveryResponse>({
            tx,
            userId,
            operation: "keep_discovery",
            idempotencyKey,
            requestFingerprint,
          });
        if (!idempotency.ok) return idempotency;
        if (idempotency.replay !== null) return idempotency.replay;

        const [discovery] = await tx
          .select({
            id: discoverDiscoveries.id,
            candidateId: discoverDiscoveries.candidateId,
            state: discoverDiscoveries.state,
            seenAt: discoverDiscoveries.seenAt,
          })
          .from(discoverDiscoveries)
          .where(
            and(
              eq(discoverDiscoveries.id, discoveryId),
              eq(discoverDiscoveries.userId, userId),
            ),
          )
          .for("update");
        let result: KeepDiscoveryResponse;
        if (discovery === undefined) {
          result = { ok: false, error: "discovery_missing" };
        } else if (
          discovery.state === "kept" ||
          discovery.state === "dismissed"
        ) {
          result = { ok: false, error: "decision_conflict" };
        } else {
          const [candidate] = await tx
            .select({
              id: discoverCandidates.id,
              providerResultId: discoverCandidates.providerResultId,
              itemId: discoverCandidates.itemId,
            })
            .from(discoverCandidates)
            .where(
              and(
                eq(discoverCandidates.id, discovery.candidateId),
                eq(discoverCandidates.userId, userId),
              ),
            )
            .for("update");
          if (candidate === undefined) {
            result = { ok: false, error: "discovery_missing" };
          } else if (candidate.itemId !== null) {
            result = { ok: false, error: "already_in_library" };
          } else {
            const [projection] = await tx
              .select({
                title: discoverProviderResultProjections.title,
                source: discoverProviderResultProjections.source,
              })
              .from(discoverProviderResultProjections)
              .where(
                and(
                  eq(
                    discoverProviderResultProjections.providerResultId,
                    candidate.providerResultId,
                  ),
                  gt(discoverProviderResultProjections.expiresAt, now()),
                ),
              );
            if (
              projection === undefined ||
              projection.source !== request.source
            ) {
              result = { ok: false, error: "keep_metadata_unavailable" };
            } else {
              const [itemRow] = await tx
                .insert(items)
                .values({
                  userId,
                  title: request.title,
                  source: projection.source,
                  type: request.type,
                })
                .returning({
                  id: items.id,
                  userId: items.userId,
                  title: items.title,
                  source: items.source,
                  createdAt: items.createdAt,
                  type: items.type,
                  status: items.status,
                  statusMode: items.statusMode,
                  targetDate: items.targetDate,
                  completedAt: items.completedAt,
                });
              const decidedAt = now();
              await tx
                .update(discoverCandidates)
                .set({ itemId: itemRow.id })
                .where(
                  and(
                    eq(discoverCandidates.id, candidate.id),
                    eq(discoverCandidates.userId, userId),
                  ),
                );
              await tx
                .update(discoverDiscoveries)
                .set({ state: "kept", decidedAt })
                .where(
                  and(
                    eq(discoverDiscoveries.id, discoveryId),
                    eq(discoverDiscoveries.userId, userId),
                  ),
                );
              result = {
                ok: true,
                discovery: {
                  id: discovery.id as DiscoveryId,
                  state: "kept",
                  seenAt: discovery.seenAt?.toISOString() ?? null,
                  decidedAt: decidedAt.toISOString(),
                },
                item: {
                  id: itemRow.id as ItemId,
                  userId,
                  title: itemRow.title,
                  source: itemRow.source,
                  createdAt: itemRow.createdAt.toISOString(),
                  type: itemRow.type,
                  status: itemRow.status ?? Status.NotStarted,
                  statusMode: itemRow.statusMode ?? StatusMode.Manual,
                  targetDate: itemRow.targetDate,
                  pastTarget: false,
                  completedAt: itemRow.completedAt?.toISOString() ?? null,
                  labels: [],
                  partPercentage: null,
                },
              };
            }
          }
        }
        return idempotency.persist(result);
      });
    },
    readHistory: async ({ userId, query }) => {
      const cursor = decodeHistoryCursor(query.cursor);
      if (query.cursor !== undefined && cursor === null) {
        return { ok: false, error: "invalid_cursor" };
      }
      return {
        ok: true,
        history: await selectHistory({
          query: db,
          userId,
          cursor,
          currentTime: now(),
        }),
      };
    },
    readWorkspace: ({ userId }) =>
      selectWorkspace({ query: db, userId, currentTime: now() }),
    purgeProviderData: createPurgeProviderData({ db, now, logger }),
  };
  return module;
}

export function createDiscoverMaintenanceModule({
  db,
  now,
  logger,
}: {
  db: Database;
  now: () => Date;
  logger: Logger;
}): Pick<DiscoverModule, "purgeProviderData"> {
  return {
    purgeProviderData: createPurgeProviderData({ db, now, logger }),
  };
}

function createPurgeProviderData({
  db,
  now,
  logger,
}: {
  db: Database;
  now: () => Date;
  logger: Logger;
}): DiscoverModule["purgeProviderData"] {
  return async (input) => {
    const startedAt = now();
    const { kind } = input;
    const batchSize = input.batchSize ?? 100;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
      throw new RangeError("Provider purge batch size must be from 1 to 1000");
    }
    const report: ProviderPurgeReport = {
      kind,
      provider: "youtube",
      dryRun: input.kind === "expire_due" && input.dryRun === true,
      clearedRows: 0,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 0,
      deadlineRiskRows: 0,
      truncated: false,
    };
    const dueAt = new Date(
      startedAt.getTime() + providerRetentionSafetyMilliseconds,
    );
    if (report.dryRun) {
      const inspection = await inspectDueProviderData({
        db,
        dueAt,
        deadlineAt: startedAt,
        batchSize,
      });
      report.dueRows = inspection.dueRows;
      report.deadlineRiskRows = inspection.deadlineRiskRows;
      report.truncated = inspection.truncated;
      recordRetention({
        logger,
        report,
        durationMs: elapsedMilliseconds({ startedAt, finishedAt: now() }),
      });
      return report;
    }
    if (kind === "complete") {
      await db.transaction(async (tx) => {
        await lockProviderPublication({ tx, provider: "youtube" });
        await tx
          .insert(discoverProviderGates)
          .values({
            provider: "youtube",
            nextEligibleAt: new Date("9999-12-31T23:59:59.999Z"),
            errorClass: "provider_suspended",
            updatedAt: now(),
          })
          .onConflictDoUpdate({
            target: discoverProviderGates.provider,
            set: {
              nextEligibleAt: new Date("9999-12-31T23:59:59.999Z"),
              errorClass: "provider_suspended",
              updatedAt: now(),
            },
          });
        await tx
          .update(discoverProviderTargets)
          .set({
            acquisitionGeneration: sql`${discoverProviderTargets.acquisitionGeneration} + 1`,
          })
          .where(eq(discoverProviderTargets.provider, "youtube"));
      });
    }
    const operations = [
      purgeDueTargetData,
      purgeDueCheckpointData,
      purgeDueTargetProjections,
      purgeDueResultReferences,
      purgeDueResultProjections,
    ] as const;
    for (const operation of operations) {
      try {
        while (true) {
          const batch = await operation({ db, dueAt, batchSize, kind });
          report.clearedRows += batch.clearedRows;
          report.skippedGenerationRows +=
            batch.selectedRows - batch.clearedRows;
          if (kind === "expire_due") report.dueRows += batch.selectedRows;
          if (batch.selectedRows < batchSize) break;
        }
      } catch {
        report.failedOperations += 1;
        logger.error({
          event: "discover.retention.batch_failed",
          msg: "Discover Provider retention batch failed",
          provider: "youtube",
          kind,
          errorClass: "database_error",
        });
      }
    }
    recordRetention({
      logger,
      report,
      durationMs: elapsedMilliseconds({ startedAt, finishedAt: now() }),
    });
    return report;
  };
}

function recordRetention({
  logger,
  report,
  durationMs,
}: {
  logger: Logger;
  report: ProviderPurgeReport;
  durationMs: number;
}): void {
  const measurements = { ...report, durationMs };
  logger.info({
    event: "unshelf.discover.retention.ended",
    msg: "Discover Provider retention ended",
    ...measurements,
  });
  logger.info({
    event: "unshelf.discover.retention.metric",
    msg: "Discover Provider retention metric",
    ...measurements,
  });
}

type DiscoverQuery = Pick<Database, "select">;

interface PurgeBatchResult {
  selectedRows: number;
  clearedRows: number;
}

interface PurgeBatchInput {
  db: Database;
  dueAt: Date;
  batchSize: number;
  kind: "expire_due" | "complete";
}

type PurgeCountRow = {
  selected_count: number | string;
  completed_count: number | string;
};

type DueProviderDataRow = {
  operation: string;
  expires_at: Date | string;
};

async function inspectDueProviderData({
  db,
  dueAt,
  deadlineAt,
  batchSize,
}: {
  db: Database;
  dueAt: Date;
  deadlineAt: Date;
  batchSize: number;
}): Promise<{
  dueRows: number;
  deadlineRiskRows: number;
  truncated: boolean;
}> {
  const inspectionLimit = batchSize + 1;
  const result = await db.execute<DueProviderDataRow>(sql`
    (SELECT 'target_data' AS operation, expires_at
     FROM discover_provider_targets
     WHERE provider = 'youtube' AND expires_at <= ${dueAt}
     ORDER BY expires_at, id
     LIMIT ${inspectionLimit})
    UNION ALL
    (SELECT 'checkpoint_data' AS operation, checkpoint_expires_at AS expires_at
     FROM discover_provider_targets
     WHERE provider = 'youtube' AND checkpoint_expires_at <= ${dueAt}
     ORDER BY checkpoint_expires_at, id
     LIMIT ${inspectionLimit})
    UNION ALL
    (SELECT 'target_projection' AS operation, projection.expires_at
     FROM discover_provider_target_projections AS projection
     INNER JOIN discover_provider_targets AS target
       ON target.id = projection.provider_target_id
     WHERE target.provider = 'youtube' AND projection.expires_at <= ${dueAt}
     ORDER BY projection.expires_at, projection.provider_target_id
     LIMIT ${inspectionLimit})
    UNION ALL
    (SELECT 'result_reference' AS operation, expires_at
     FROM discover_provider_results
     WHERE provider = 'youtube' AND expires_at <= ${dueAt}
     ORDER BY expires_at, id
     LIMIT ${inspectionLimit})
    UNION ALL
    (SELECT 'result_projection' AS operation, projection.expires_at
     FROM discover_provider_result_projections AS projection
     INNER JOIN discover_provider_results AS result
       ON result.id = projection.provider_result_id
     WHERE result.provider = 'youtube' AND projection.expires_at <= ${dueAt}
     ORDER BY projection.expires_at, projection.provider_result_id
     LIMIT ${inspectionLimit})
  `);
  const operationCounts = new Map<string, number>();
  let deadlineRiskRows = 0;
  for (const row of result.rows) {
    const operationCount = operationCounts.get(row.operation) ?? 0;
    operationCounts.set(row.operation, operationCount + 1);
    if (
      operationCount < batchSize &&
      new Date(row.expires_at).getTime() <= deadlineAt.getTime()
    ) {
      deadlineRiskRows += 1;
    }
  }
  return {
    dueRows: [...operationCounts.values()].reduce(
      (total, count) => total + Math.min(count, batchSize),
      0,
    ),
    deadlineRiskRows,
    truncated: [...operationCounts.values()].some((count) => count > batchSize),
  };
}

async function purgeDueTargetData({
  db,
  dueAt,
  batchSize,
  kind,
}: PurgeBatchInput): Promise<PurgeBatchResult> {
  const retentionFilter =
    kind === "complete"
      ? sql`external_reference IS NOT NULL`
      : sql`expires_at <= ${dueAt}`;
  const result = await db.execute<PurgeCountRow>(sql`
    WITH selected AS MATERIALIZED (
      SELECT id, data_generation
      FROM discover_provider_targets
      WHERE provider = 'youtube' AND ${retentionFilter}
      ORDER BY expires_at, id
      LIMIT ${batchSize}
    ), cleared AS (
      UPDATE discover_provider_targets AS target
      SET external_reference = NULL,
          target_payload = NULL,
          fetched_at = NULL,
          expires_at = NULL
      FROM selected
      WHERE target.id = selected.id
        AND target.data_generation = selected.data_generation
      RETURNING target.id
    )
    SELECT
      (SELECT count(*) FROM selected) AS selected_count,
      (SELECT count(*) FROM cleared) AS completed_count
  `);
  return toPurgeBatchResult(result.rows[0]);
}

async function purgeDueTargetProjections({
  db,
  dueAt,
  batchSize,
  kind,
}: PurgeBatchInput): Promise<PurgeBatchResult> {
  const retentionFilter =
    kind === "complete" ? sql`TRUE` : sql`projection.expires_at <= ${dueAt}`;
  const result = await db.execute<PurgeCountRow>(sql`
    WITH selected AS MATERIALIZED (
      SELECT projection.provider_target_id, projection.generation
      FROM discover_provider_target_projections AS projection
      INNER JOIN discover_provider_targets AS target
        ON target.id = projection.provider_target_id
      WHERE target.provider = 'youtube' AND ${retentionFilter}
      ORDER BY projection.expires_at, projection.provider_target_id
      LIMIT ${batchSize}
    ), cleared AS (
      DELETE FROM discover_provider_target_projections AS projection
      USING selected
      WHERE projection.provider_target_id = selected.provider_target_id
        AND projection.generation = selected.generation
      RETURNING projection.provider_target_id
    )
    SELECT
      (SELECT count(*) FROM selected) AS selected_count,
      (SELECT count(*) FROM cleared) AS completed_count
  `);
  return toPurgeBatchResult(result.rows[0]);
}

async function purgeDueCheckpointData({
  db,
  dueAt,
  batchSize,
  kind,
}: PurgeBatchInput): Promise<PurgeBatchResult> {
  const retentionFilter =
    kind === "complete"
      ? sql`checkpoint_payload IS NOT NULL`
      : sql`checkpoint_expires_at <= ${dueAt}`;
  const result = await db.execute<PurgeCountRow>(sql`
    WITH selected AS MATERIALIZED (
      SELECT id, data_generation
      FROM discover_provider_targets
      WHERE provider = 'youtube' AND ${retentionFilter}
      ORDER BY checkpoint_expires_at, id
      LIMIT ${batchSize}
    ), cleared AS (
      UPDATE discover_provider_targets AS target
      SET checkpoint_payload = NULL,
          checkpoint_fetched_at = NULL,
          checkpoint_expires_at = NULL,
          verified_coverage_started_at = NULL
      FROM selected
      WHERE target.id = selected.id
        AND target.data_generation = selected.data_generation
      RETURNING target.id
    )
    SELECT
      (SELECT count(*) FROM selected) AS selected_count,
      (SELECT count(*) FROM cleared) AS completed_count
  `);
  return toPurgeBatchResult(result.rows[0]);
}

async function purgeDueResultReferences({
  db,
  dueAt,
  batchSize,
  kind,
}: PurgeBatchInput): Promise<PurgeBatchResult> {
  const retentionFilter =
    kind === "complete"
      ? sql`external_reference IS NOT NULL`
      : sql`expires_at <= ${dueAt}`;
  const result = await db.execute<PurgeCountRow>(sql`
    WITH selected AS MATERIALIZED (
      SELECT id, data_generation
      FROM discover_provider_results
      WHERE provider = 'youtube' AND ${retentionFilter}
      ORDER BY expires_at, id
      LIMIT ${batchSize}
    ), cleared AS (
      UPDATE discover_provider_results AS result
      SET external_reference = NULL,
          fetched_at = NULL,
          expires_at = NULL
      FROM selected
      WHERE result.id = selected.id
        AND result.data_generation = selected.data_generation
      RETURNING result.id
    )
    SELECT
      (SELECT count(*) FROM selected) AS selected_count,
      (SELECT count(*) FROM cleared) AS completed_count
  `);
  return toPurgeBatchResult(result.rows[0]);
}

async function purgeDueResultProjections({
  db,
  dueAt,
  batchSize,
  kind,
}: PurgeBatchInput): Promise<PurgeBatchResult> {
  const retentionFilter =
    kind === "complete" ? sql`TRUE` : sql`projection.expires_at <= ${dueAt}`;
  const result = await db.execute<PurgeCountRow>(sql`
    WITH selected AS MATERIALIZED (
      SELECT projection.provider_result_id, projection.generation
      FROM discover_provider_result_projections AS projection
      INNER JOIN discover_provider_results AS result
        ON result.id = projection.provider_result_id
      WHERE result.provider = 'youtube' AND ${retentionFilter}
      ORDER BY projection.expires_at, projection.provider_result_id
      LIMIT ${batchSize}
    ), cleared AS (
      DELETE FROM discover_provider_result_projections AS projection
      USING selected
      WHERE projection.provider_result_id = selected.provider_result_id
        AND projection.generation = selected.generation
      RETURNING projection.provider_result_id
    )
    SELECT
      (SELECT count(*) FROM selected) AS selected_count,
      (SELECT count(*) FROM cleared) AS completed_count
  `);
  return toPurgeBatchResult(result.rows[0]);
}

function toPurgeBatchResult(row: PurgeCountRow | undefined): PurgeBatchResult {
  return {
    selectedRows: Number(row?.selected_count ?? 0),
    clearedRows: Number(row?.completed_count ?? 0),
  };
}

async function lockProviderPublication({
  tx,
  provider,
}: {
  tx: DiscoverTransaction;
  provider: "youtube";
}): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`unshelf:discover:provider:${provider}`}, 0))`,
  );
}

async function isProviderSuspended({
  db,
  provider,
}: {
  db: Database;
  provider: "youtube";
}): Promise<boolean> {
  const [gate] = await db
    .select({ errorClass: discoverProviderGates.errorClass })
    .from(discoverProviderGates)
    .where(eq(discoverProviderGates.provider, provider));
  return gate?.errorClass === "provider_suspended";
}

async function selectWorkspace({
  query,
  userId,
  currentTime,
}: {
  query: DiscoverQuery;
  userId: UserId;
  currentTime: Date;
}): Promise<DiscoverWorkspace> {
  const followRows = await query
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
      latestWorkspaceRefreshOutcome:
        discoverFollows.latestWorkspaceRefreshOutcome,
      latestWorkspaceRefreshedAt: discoverFollows.latestWorkspaceRefreshedAt,
    })
    .from(discoverFollows)
    .leftJoin(
      discoverProviderTargetProjections,
      and(
        eq(
          discoverProviderTargetProjections.providerTargetId,
          discoverFollows.providerTargetId,
        ),
        gt(discoverProviderTargetProjections.expiresAt, currentTime),
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
      : await query
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
            inArray(discoverAcquisitionAttempts.providerTargetId, targetIds),
          )
          .orderBy(
            desc(discoverAcquisitionAttempts.startedAt),
            desc(discoverAcquisitionAttempts.generation),
          );
  const follows = followRows.map((follow) => {
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
  });
  const latestWorkspaceRefreshedAt = followRows.reduce<Date | null>(
    (latest, follow) =>
      follow.latestWorkspaceRefreshedAt !== null &&
      (latest === null || follow.latestWorkspaceRefreshedAt > latest)
        ? follow.latestWorkspaceRefreshedAt
        : latest,
    null,
  );
  const affectedFollowIds = followRows
    .filter(
      (follow) =>
        latestWorkspaceRefreshedAt !== null &&
        follow.latestWorkspaceRefreshedAt?.getTime() ===
          latestWorkspaceRefreshedAt.getTime() &&
        follow.latestWorkspaceRefreshOutcome !== "complete" &&
        follow.latestWorkspaceRefreshOutcome !== "joined",
    )
    .map(({ id }) => id as FollowId);
  return {
    follows,
    discoveries: await selectDiscoveries({ query, userId, currentTime }),
    ...(affectedFollowIds.length === 0
      ? {}
      : { aggregateNotice: { affectedFollowIds } }),
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
        durationMs: elapsedMilliseconds({
          startedAt: attempt.startedAt,
          finishedAt: attempt.finishedAt ?? attempt.startedAt,
        }),
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

async function renewAttemptLease({
  db,
  attemptId,
  providerTargetId,
  generation,
  leaseExpiresAt,
}: {
  db: Database;
  attemptId: string;
  providerTargetId: string;
  generation: number;
  leaseExpiresAt: Date;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ generation: discoverProviderTargets.acquisitionGeneration })
      .from(discoverProviderTargets)
      .where(eq(discoverProviderTargets.id, providerTargetId))
      .for("update");
    if (target?.generation !== generation) return false;
    const [renewed] = await tx
      .update(discoverAcquisitionAttempts)
      .set({ leaseExpiresAt })
      .where(
        and(
          eq(discoverAcquisitionAttempts.id, attemptId),
          eq(discoverAcquisitionAttempts.outcome, "running"),
        ),
      )
      .returning({ id: discoverAcquisitionAttempts.id });
    return renewed !== undefined;
  });
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
  previousCoverageStartedAt,
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
  previousCoverageStartedAt?: string | null;
  errorClass?: string;
}): void {
  const measurements = {
    attemptId,
    providerTargetId,
    trigger,
    outcome,
    acceptedCount,
    rejectedCount,
    retryCount,
    leaseRecovered,
    durationMs,
    ...(coverageStartedAt === undefined
      ? {}
      : {
          coverageStartedAt,
          previousCoverageStartedAt: previousCoverageStartedAt ?? null,
          coverageMoved:
            previousCoverageStartedAt !== null &&
            previousCoverageStartedAt !== undefined &&
            previousCoverageStartedAt !== coverageStartedAt,
        }),
    ...(errorClass === undefined ? {} : { errorClass }),
  };
  logger.info({
    event: "unshelf.discover.acquisition.ended",
    msg: "Discover Provider acquisition ended",
    ...measurements,
  });
  logger.info({
    event: "unshelf.discover.acquisition.metric",
    msg: "Discover Provider acquisition metric",
    ...measurements,
  });
}

function elapsedMilliseconds({
  startedAt,
  finishedAt,
}: {
  startedAt: Date;
  finishedAt: Date;
}): number {
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
        errorClass: sql`CASE
          WHEN ${discoverProviderGates.errorClass} = 'provider_suspended'
          THEN ${discoverProviderGates.errorClass}
          ELSE ${errorClass}
        END`,
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

type DiscoverTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type IdempotentOperation =
  | "confirm_follow"
  | "set_follow_lifecycle"
  | "decide_discoveries"
  | "keep_discovery";

async function beginIdempotentMutation<Result>({
  tx,
  userId,
  operation,
  idempotencyKey,
  requestFingerprint,
}: {
  tx: DiscoverTransaction;
  userId: UserId;
  operation: IdempotentOperation;
  idempotencyKey: IdempotencyKey;
  requestFingerprint: string;
}): Promise<
  | { ok: false; error: "idempotency_conflict" }
  | {
      ok: true;
      replay: Result | null;
      persist: (result: Result) => Promise<Result>;
    }
> {
  await tx
    .insert(discoverIdempotency)
    .values({
      userId,
      operation,
      requestId: idempotencyKey,
      requestFingerprint,
    })
    .onConflictDoNothing();
  const [record] = await tx
    .select({
      requestFingerprint: discoverIdempotency.requestFingerprint,
      resultPayload: discoverIdempotency.resultPayload,
    })
    .from(discoverIdempotency)
    .where(
      and(
        eq(discoverIdempotency.userId, userId),
        eq(discoverIdempotency.operation, operation),
        eq(discoverIdempotency.requestId, idempotencyKey),
      ),
    )
    .for("update");
  if (record.requestFingerprint !== requestFingerprint) {
    return { ok: false, error: "idempotency_conflict" };
  }
  return {
    ok: true,
    replay:
      record.resultPayload === null ? null : (record.resultPayload as Result),
    persist: async (result) => {
      await tx
        .update(discoverIdempotency)
        .set({ resultPayload: result })
        .where(
          and(
            eq(discoverIdempotency.userId, userId),
            eq(discoverIdempotency.operation, operation),
            eq(discoverIdempotency.requestId, idempotencyKey),
          ),
        );
      return result;
    },
  };
}

async function publishTargetProjection({
  tx,
  providerTargetId,
  publisher,
  generation,
  fetchedAt,
  expiresAt,
}: {
  tx: DiscoverTransaction;
  providerTargetId: string;
  publisher: string;
  generation: number;
  fetchedAt: Date;
  expiresAt: Date;
}): Promise<void> {
  await tx
    .insert(discoverProviderTargetProjections)
    .values({
      providerTargetId,
      publisher,
      generation,
      fetchedAt,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: discoverProviderTargetProjections.providerTargetId,
      set: { publisher, generation, fetchedAt, expiresAt },
    });
}

async function publishProviderResults({
  tx,
  videos,
  fetchedAt,
  expiresAt,
}: {
  tx: DiscoverTransaction;
  videos: ProviderPreview["videos"];
  fetchedAt: Date;
  expiresAt: Date;
}): Promise<Map<string, string>> {
  const resultIds = new Map<string, string>();
  for (const video of videos) {
    const [result] = await tx
      .insert(discoverProviderResults)
      .values({
        provider: "youtube",
        externalReference: video.providerIdentity,
        fetchedAt,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          discoverProviderResults.provider,
          discoverProviderResults.externalReference,
        ],
        targetWhere: sql`${discoverProviderResults.externalReference} IS NOT NULL`,
        set: {
          externalReference: video.providerIdentity,
          dataGeneration: sql`${discoverProviderResults.dataGeneration} + 1`,
          fetchedAt,
          expiresAt,
        },
      })
      .returning({
        id: discoverProviderResults.id,
        generation: discoverProviderResults.dataGeneration,
      });
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
        generation: result.generation,
        fetchedAt,
        expiresAt,
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
          generation: result.generation,
          fetchedAt,
          expiresAt,
        },
      });
  }
  return resultIds;
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
  | {
      outcome: "complete" | "partial";
      snapshotId: string;
      previousCoverageStartedAt: string | null;
    }
  | { outcome: "failed" | "skipped" }
> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        generation: discoverProviderTargets.acquisitionGeneration,
        externalReference: discoverProviderTargets.externalReference,
        verifiedCoverageStartedAt:
          discoverProviderTargets.verifiedCoverageStartedAt,
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
    if (
      target.externalReference !== null &&
      target.externalReference !== acquired.channelId
    ) {
      return { outcome: "failed" as const };
    }

    const providerExpiresAt = new Date(
      publishedAt.getTime() + providerRetentionMilliseconds,
    );
    const [publishedTarget] = await tx
      .update(discoverProviderTargets)
      .set({
        externalReference: acquired.channelId,
        targetPayload: {
          schemaVersion: 1,
          uploadsPlaylistId: acquired.uploadsPlaylistId,
        },
        fetchedAt: publishedAt,
        expiresAt: providerExpiresAt,
        dataGeneration: sql`${discoverProviderTargets.dataGeneration} + 1`,
      })
      .where(eq(discoverProviderTargets.id, providerTargetId))
      .returning({ generation: discoverProviderTargets.dataGeneration });
    await publishTargetProjection({
      tx,
      providerTargetId,
      publisher: acquired.publisher,
      generation: publishedTarget.generation,
      fetchedAt: publishedAt,
      expiresAt: providerExpiresAt,
    });

    const resultIds = await publishProviderResults({
      tx,
      videos: acquired.videos,
      fetchedAt: publishedAt,
      expiresAt: providerExpiresAt,
    });

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
              checkpointFetchedAt: publishedAt,
              checkpointExpiresAt: providerExpiresAt,
              verifiedCoverageStartedAt: new Date(acquired.coverageStartedAt),
            }
          : {}),
      })
      .where(eq(discoverProviderTargets.id, providerTargetId));
    return {
      outcome,
      snapshotId: snapshot.id,
      previousCoverageStartedAt:
        target.verifiedCoverageStartedAt?.toISOString() ?? null,
    };
  });
}

async function applyAvailableSnapshots({
  db,
  userId,
  followId,
  appliedAt,
  currentOnly = false,
}: {
  db: Pick<Database, "transaction">;
  userId: UserId;
  followId: FollowId;
  appliedAt: Date;
  currentOnly?: boolean;
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

    const snapshotsToApply = currentOnly ? snapshots.slice(-1) : snapshots;
    for (const snapshot of snapshotsToApply) {
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

async function selectDiscoveries({
  query,
  userId,
  discoveryIds,
  currentTime,
}: {
  query: DiscoverQuery;
  userId: UserId;
  discoveryIds?: string[];
  currentTime: Date;
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
      itemId: discoverCandidates.itemId,
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
      and(
        eq(
          discoverProviderResultProjections.providerResultId,
          discoverCandidates.providerResultId,
        ),
        gt(discoverProviderResultProjections.expiresAt, currentTime),
      ),
    )
    .leftJoin(
      discoverProviderTargetProjections,
      and(
        eq(
          discoverProviderTargetProjections.providerTargetId,
          discoverFollows.providerTargetId,
        ),
        gt(discoverProviderTargetProjections.expiresAt, currentTime),
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
  const candidateIds = [...new Set(rows.map(({ candidateId }) => candidateId))];
  const priorRows =
    candidateIds.length === 0
      ? []
      : await query
          .select({
            candidateId: discoverDiscoveries.candidateId,
            state: discoverDiscoveries.state,
            decidedAt: discoverDiscoveries.decidedAt,
          })
          .from(discoverDiscoveries)
          .where(
            and(
              eq(discoverDiscoveries.userId, userId),
              inArray(discoverDiscoveries.candidateId, candidateIds),
              or(
                eq(discoverDiscoveries.state, "kept"),
                eq(discoverDiscoveries.state, "dismissed"),
              ),
            ),
          );
  const priorDecisionsByCandidate = new Map<string, typeof priorRows>();
  for (const prior of priorRows) {
    const decisions = priorDecisionsByCandidate.get(prior.candidateId) ?? [];
    decisions.push(prior);
    priorDecisionsByCandidate.set(prior.candidateId, decisions);
  }
  return rows.map((row) => {
    const priorDecisions = (
      priorDecisionsByCandidate.get(row.candidateId) ?? []
    ).filter(
      ({ decidedAt }) => decidedAt !== null && decidedAt < row.discoveredAt,
    );
    return {
      id: row.id as DiscoveryId,
      candidateId: row.candidateId as CandidateId,
      itemId: row.itemId as ItemId | null,
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
      priorDecisions: {
        kept: priorDecisions.filter(({ state }) => state === "kept").length,
        dismissed: priorDecisions.filter(({ state }) => state === "dismissed")
          .length,
      },
    };
  });
}

const historyPageSize = 20;

interface HistoryCursorValue {
  decidedAt: Date;
  discoveryId: string;
}

async function selectHistory({
  query,
  userId,
  cursor,
  currentTime,
}: {
  query: DiscoverQuery;
  userId: UserId;
  cursor: HistoryCursorValue | null;
  currentTime: Date;
}): Promise<DiscoverHistoryPage> {
  const terminalState = or(
    eq(discoverDiscoveries.state, "kept"),
    eq(discoverDiscoveries.state, "dismissed"),
  );
  const cursorBoundary =
    cursor === null
      ? undefined
      : or(
          lt(discoverDiscoveries.decidedAt, cursor.decidedAt),
          and(
            eq(discoverDiscoveries.decidedAt, cursor.decidedAt),
            lt(discoverDiscoveries.id, cursor.discoveryId),
          ),
        );
  const rows = await query
    .select({
      id: discoverDiscoveries.id,
      candidateId: discoverDiscoveries.candidateId,
      itemId: discoverCandidates.itemId,
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
      seenAt: discoverDiscoveries.seenAt,
      decidedAt: discoverDiscoveries.decidedAt,
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
      and(
        eq(
          discoverProviderResultProjections.providerResultId,
          discoverCandidates.providerResultId,
        ),
        gt(discoverProviderResultProjections.expiresAt, currentTime),
      ),
    )
    .leftJoin(
      discoverProviderTargetProjections,
      and(
        eq(
          discoverProviderTargetProjections.providerTargetId,
          discoverFollows.providerTargetId,
        ),
        gt(discoverProviderTargetProjections.expiresAt, currentTime),
      ),
    )
    .where(
      and(
        eq(discoverDiscoveries.userId, userId),
        terminalState,
        cursorBoundary,
      ),
    )
    .orderBy(desc(discoverDiscoveries.decidedAt), desc(discoverDiscoveries.id))
    .limit(historyPageSize + 1);
  const pageRows = rows.slice(0, historyPageSize);
  const last = pageRows.at(-1);
  const nextCursor =
    rows.length > historyPageSize && last?.decidedAt != null
      ? encodeHistoryCursor({
          decidedAt: last.decidedAt,
          discoveryId: last.id,
        })
      : null;
  return {
    discoveries: pageRows.map((row) => ({
      id: row.id as DiscoveryId,
      candidateId: row.candidateId as CandidateId,
      itemId: row.itemId as ItemId | null,
      followId: row.followId as FollowId,
      followName: row.followName,
      state: row.state as "kept" | "dismissed",
      title: row.title,
      source: row.source,
      publisher: row.publisher,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      type: row.type === Type.Video ? Type.Video : null,
      thumbnailUrl: row.thumbnailUrl,
      discoveredAt: row.discoveredAt.toISOString(),
      seenAt: row.seenAt?.toISOString() ?? null,
      decidedAt: row.decidedAt!.toISOString(),
    })),
    nextCursor,
  };
}

function encodeHistoryCursor(value: HistoryCursorValue): DiscoverHistoryCursor {
  return Buffer.from(
    JSON.stringify([value.decidedAt.toISOString(), value.discoveryId]),
  ).toString("base64url") as DiscoverHistoryCursor;
}

function decodeHistoryCursor(
  cursor: string | undefined,
): HistoryCursorValue | null {
  if (cursor === undefined) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== "string" ||
      Number.isNaN(Date.parse(value[0])) ||
      typeof value[1] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value[1],
      )
    ) {
      return null;
    }
    return { decidedAt: new Date(value[0]), discoveryId: value[1] };
  } catch {
    return null;
  }
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
