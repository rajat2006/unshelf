import { Router, type RequestHandler, type Response } from "express";
import {
  createDiscoverFollowRequestSchema,
  discoverFollowIdSchema,
  discoverPreviewRequestSchema,
  discoverWorkspaceQuerySchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { validateRequest } from "../middleware/validation";
import { previewChannel } from "./preview-channel";
import type { YouTubeClient, YouTubeFailure } from "./youtube-client";
import { followChannel } from "./follow-channel";
import { readDiscoverWorkspace } from "./read-workspace";
import { unfollowChannel } from "./unfollow-channel";

/** Mount the authenticated Discover HTTP interface at `/api/discover`. */
export function createDiscoverRouter({
  db,
  auth,
  youtubeClient,
  now,
}: {
  db: Database;
  auth: RequestHandler[];
  youtubeClient: YouTubeClient;
  now: () => Date;
}): Router {
  const router = Router();
  router.use(...auth);
  router.get(
    "/",
    validateRequest(
      { query: discoverWorkspaceQuerySchema },
      "invalid_discover_workspace",
    ),
    async (req, res) => {
      const workspace = await readDiscoverWorkspace({
        db,
        userId: req.user!.id,
        followId: res.locals.validated.query.followId,
        now: now(),
      });
      if (!workspace) {
        res.status(404).json({ error: "follow_not_found" });
        return;
      }
      res.json(workspace);
    },
  );
  router.post(
    "/follows",
    validateRequest(
      { body: createDiscoverFollowRequestSchema },
      "invalid_discover_follow",
    ),
    async (req, res) => {
      const result = await followChannel({
        db,
        userId: req.user!.id,
        targetId: res.locals.validated.body.targetId,
        now: now(),
      });
      if (!result.ok) {
        res.status(404).json({ error: "channel_not_found" });
        return;
      }
      res.status(result.created ? 201 : 200).json(result.follow);
    },
  );
  router.delete(
    "/follows/:followId",
    validateRequest(
      { params: { followId: discoverFollowIdSchema } },
      "invalid_discover_follow",
    ),
    async (req, res) => {
      const result = await unfollowChannel({
        db,
        userId: req.user!.id,
        followId: res.locals.validated.params.followId,
        now: now(),
      });
      if (!result.ok) {
        res.status(404).json({ error: "follow_not_found" });
        return;
      }
      res.status(204).send();
    },
  );
  router.post(
    "/preview",
    validateRequest(
      { body: discoverPreviewRequestSchema },
      "invalid_discover_preview",
    ),
    async (_req, res) => {
      const result = await previewChannel({
        db,
        youtubeClient,
        url: res.locals.validated.body.url,
        now: now(),
      });
      if (!result.ok) {
        respondToPreviewFailure(res, result.error);
        return;
      }
      res.json(result.preview);
    },
  );
  return router;
}

function respondToPreviewFailure(res: Response, error: YouTubeFailure): void {
  const responses = {
    invalid_url: { status: 400, error: "invalid_channel_url" },
    not_found: { status: 404, error: "channel_not_found" },
    throttled: { status: 429, error: "youtube_throttled" },
    temporary_failure: { status: 503, error: "youtube_unavailable" },
  } as const;
  const response = responses[error];
  res.status(response.status).json({ error: response.error });
}
