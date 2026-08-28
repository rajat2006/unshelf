import type {
  DiscoverCandidateId,
  DiscoverFollowId,
  DiscoverProviderTargetId,
  KeepDiscoverCandidateRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import type { Logger } from "../logging";
import { followChannel, type FollowChannelResult } from "./follow-channel";
import { keepCandidate, type KeepCandidateResult } from "./keep-candidate";
import { previewChannel, type PreviewChannelResult } from "./preview-channel";
import { readDiscoverWorkspace } from "./read-workspace";
import {
  rejectCandidate,
  type RejectCandidateResult,
} from "./reject-candidate";
import {
  createDiscoverAcquisitionTick,
  type DiscoverAcquisitionTick,
} from "./scheduled-acquisition";
import {
  unfollowChannel,
  type UnfollowChannelResult,
} from "./unfollow-channel";
import type { YouTubeClient } from "./youtube-client";

export interface DiscoverModule {
  preview(input: { url: string }): Promise<PreviewChannelResult>;
  follow(input: {
    userId: UserId;
    targetId: DiscoverProviderTargetId;
  }): Promise<FollowChannelResult>;
  unfollow(input: {
    userId: UserId;
    followId: DiscoverFollowId;
  }): Promise<UnfollowChannelResult>;
  readWorkspace(input: {
    userId: UserId;
    followId?: DiscoverFollowId;
  }): ReturnType<typeof readDiscoverWorkspace>;
  keep(input: {
    userId: UserId;
    candidateId: DiscoverCandidateId;
    input: KeepDiscoverCandidateRequest;
  }): Promise<KeepCandidateResult>;
  reject(input: {
    userId: UserId;
    candidateId: DiscoverCandidateId;
  }): Promise<RejectCandidateResult>;
  runScheduledAcquisitionTick: DiscoverAcquisitionTick;
}

/** Compose the cohesive Discover boundary used by HTTP and the server scheduler. */
export function createDiscoverModule({
  db,
  youtubeClient,
  now,
  logger,
}: {
  db: Database;
  youtubeClient: YouTubeClient;
  now: () => Date;
  logger: Logger;
}): DiscoverModule {
  return {
    preview: ({ url }) =>
      previewChannel({ db, youtubeClient, url, now: now() }),
    follow: ({ userId, targetId }) =>
      followChannel({ db, userId, targetId, now: now() }),
    unfollow: ({ userId, followId }) =>
      unfollowChannel({ db, userId, followId, now: now() }),
    readWorkspace: ({ userId, followId }) =>
      readDiscoverWorkspace({ db, userId, followId, now: now() }),
    keep: ({ userId, candidateId, input }) =>
      keepCandidate({ db, userId, candidateId, input, now: now() }),
    reject: ({ userId, candidateId }) =>
      rejectCandidate({ db, userId, candidateId, now: now() }),
    runScheduledAcquisitionTick: createDiscoverAcquisitionTick({
      db,
      youtubeClient,
      now,
      logger,
    }),
  };
}
