import { Router, type RequestHandler, type Response } from "express";
import {
  confirmFollowRequestSchema,
  idempotencyKeySchema,
  prepareFollowRequestSchema,
} from "@unshelf/shared/validation";
import type {
  ConfirmFollowFailure,
  PrepareFollowFailure,
} from "@unshelf/shared";
import {
  recordValidationFailure,
  validateRequest,
} from "../middleware/validation";
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
      res.status("preview" in result ? 201 : 200).json(result);
    },
  );
  router.post(
    "/follows",
    validateRequest(
      { body: confirmFollowRequestSchema },
      "invalid_follow_confirmation",
    ),
    async (req, res) => {
      const parsedKey = idempotencyKeySchema.safeParse(
        req.header("Idempotency-Key"),
      );
      if (!parsedKey.success) {
        recordValidationFailure(req, "invalid_idempotency_key");
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const result = await discover.confirmFollow({
        userId: req.user!.id,
        request: res.locals.validated.body,
        idempotencyKey: parsedKey.data,
      });
      if (!result.ok) {
        respondToConfirmFailure(res, result.error);
        return;
      }
      res.status(201).json(result);
    },
  );
  router.get("/", async (req, res) => {
    res.json(await discover.readWorkspace({ userId: req.user!.id }));
  });
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

function respondToConfirmFailure(
  res: Response,
  error: ConfirmFollowFailure,
): void {
  const status = {
    preview_missing: 404,
    preview_expired: 410,
    preview_consumed: 409,
    preview_unverifiable: 409,
    idempotency_conflict: 409,
  }[error];
  res.status(status).json({ ok: false, error });
}
