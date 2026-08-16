import { Router, type RequestHandler, type Response } from "express";
import {
  acquireAndApplyRequestSchema,
  confirmFollowRequestSchema,
  decideDiscoveriesRequestSchema,
  discoverHistoryQuerySchema,
  idempotencyKeySchema,
  keepDiscoveryRequestSchema,
  discoveryIdSchema,
  followIdSchema,
  prepareFollowRequestSchema,
  setFollowLifecycleRequestSchema,
} from "@unshelf/shared/validation";
import type {
  ConfirmFollowFailure,
  PrepareFollowFailure,
} from "@unshelf/shared";
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
      res.status("preview" in result ? 201 : 200).json(result);
    },
  );
  router.patch(
    "/follows/:followId/lifecycle",
    validateRequest(
      {
        params: { followId: followIdSchema },
        body: setFollowLifecycleRequestSchema,
        headers: { "Idempotency-Key": idempotencyKeySchema },
      },
      "invalid_follow_lifecycle",
    ),
    async (req, res) => {
      const result = await discover.setFollowLifecycle({
        userId: req.user!.id,
        followId: res.locals.validated.params.followId,
        request: res.locals.validated.body,
        idempotencyKey: res.locals.validated.headers["Idempotency-Key"],
      });
      if (!result.ok) {
        res.status(result.error === "follow_missing" ? 404 : 409).json(result);
        return;
      }
      res.json(result);
    },
  );
  router.post(
    "/follows",
    validateRequest(
      {
        body: confirmFollowRequestSchema,
        headers: { "Idempotency-Key": idempotencyKeySchema },
      },
      "invalid_follow_confirmation",
    ),
    async (req, res) => {
      const result = await discover.confirmFollow({
        userId: req.user!.id,
        request: res.locals.validated.body,
        idempotencyKey: res.locals.validated.headers["Idempotency-Key"],
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
  router.get(
    "/history",
    validateRequest(
      { query: discoverHistoryQuerySchema },
      "invalid_discover_history",
    ),
    async (req, res) => {
      const result = await discover.readHistory({
        userId: req.user!.id,
        query: res.locals.validated.query,
      });
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json(result.history);
    },
  );
  router.post(
    "/discovery-decisions",
    validateRequest(
      {
        body: decideDiscoveriesRequestSchema,
        headers: { "Idempotency-Key": idempotencyKeySchema },
      },
      "invalid_discovery_decision",
    ),
    async (req, res) => {
      const result = await discover.decide({
        userId: req.user!.id,
        request: res.locals.validated.body,
        idempotencyKey: res.locals.validated.headers["Idempotency-Key"],
      });
      if (!result.ok) {
        res
          .status(result.error === "discovery_missing" ? 404 : 409)
          .json(result);
        return;
      }
      res.json(result);
    },
  );
  router.post(
    "/discoveries/:discoveryId/keep",
    validateRequest(
      {
        params: { discoveryId: discoveryIdSchema },
        body: keepDiscoveryRequestSchema,
        headers: { "Idempotency-Key": idempotencyKeySchema },
      },
      "invalid_discovery_keep",
    ),
    async (req, res) => {
      const result = await discover.keep({
        userId: req.user!.id,
        discoveryId: res.locals.validated.params.discoveryId,
        request: res.locals.validated.body,
        idempotencyKey: res.locals.validated.headers["Idempotency-Key"],
      });
      if (!result.ok) {
        res
          .status(result.error === "discovery_missing" ? 404 : 409)
          .json(result);
        return;
      }
      res.json(result);
    },
  );
  router.post(
    "/acquisitions",
    validateRequest(
      { body: acquireAndApplyRequestSchema },
      "invalid_discover_acquisition",
    ),
    async (req, res) => {
      const result = await discover.acquireAndApply({
        userId: req.user!.id,
        request: res.locals.validated.body,
      });
      if (!result.ok) {
        res.status(result.error === "follow_missing" ? 404 : 409).json(result);
        return;
      }
      res.json(result);
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
