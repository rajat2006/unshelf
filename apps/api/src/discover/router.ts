import { Router, type RequestHandler, type Response } from "express";
import { prepareFollowRequestSchema } from "@unshelf/shared/validation";
import type { PrepareFollowFailure } from "@unshelf/shared";
import { validateRequest } from "../middleware/validation";
import type { DiscoverModule } from "./module";

/** Mount the authenticated Discover interface at `/api/discover`. */
export function createDiscoverRouter(
  discover: DiscoverModule,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);
  router.post(
    "/follow-previews",
    validateRequest(
      { body: prepareFollowRequestSchema },
      "invalid_follow_preview",
    ),
    async (req, res) => {
      const result = await discover.prepareFollow({
        userId: req.user!.id,
        request: res.locals.validated.body,
      });
      if (!result.ok) {
        respondToPrepareFailure(res, result.error);
        return;
      }
      res.status(201).json(result);
    },
  );
  return router;
}

function respondToPrepareFailure(
  res: Response,
  error: PrepareFollowFailure,
): void {
  const status = {
    invalid_target: 400,
    unsupported_target: 422,
    quota_exceeded: 429,
    provider_unavailable: 503,
    unverifiable: 502,
  }[error];
  res.status(status).json({ ok: false, error });
}
