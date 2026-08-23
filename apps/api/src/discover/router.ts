import { Router, type RequestHandler, type Response } from "express";
import { discoverPreviewRequestSchema } from "@unshelf/shared/validation";
import type { Database } from "../db";
import { validateRequest } from "../middleware/validation";
import { previewChannel } from "./preview-channel";
import type { YouTubeClient, YouTubeFailure } from "./youtube-client";

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
