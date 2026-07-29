import { Router, type RequestHandler } from "express";
import {
  addStopItemRequestSchema,
  itemIdSchema,
  stopIdSchema,
} from "@unshelf/shared/validation";
import type { Database } from "../db";
import { validateRequest } from "../middleware/validation";
import {
  addItemToStop,
  getStop,
  listStops,
  removeItemFromStop,
} from "./repository";

/**
 * Mount the authenticated Stop HTTP interface at `/api/stops`.
 *
 * Membership is addressed as a sub-resource of the Stop it belongs to
 * (`/api/stops/:stopId/items/:itemId`) because that pairing *is* the record
 * (ADR-0004) — there is no membership id to hand out, and nothing else on it to
 * address. Both writes answer with the Stop's new contents rather than the
 * membership: what the User changed is what the Stop now holds, and it saves the
 * client a re-read to find out.
 *
 * A Stop is *created* under its owning Trail (`POST /api/trails/:trailId/stops`,
 * #94), because a Stop belongs to exactly one Trail — there is no Trail-less Stop
 * to create here. This router keeps the reads and the membership writes: listing
 * every Stop the User owns (across their Trails), reading one, and pulling Items
 * into and out of it.
 *
 * A Stop or Item belonging to another User answers exactly as a missing one does
 * — 404, never 403 — so the boundary never confirms that someone else's id is a
 * real id.
 */
export function createStopsRouter(
  db: Database,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.get("/", async (req, res) => {
    res.json(await listStops(db, req.user!.id));
  });

  router.get(
    "/:stopId",
    validateRequest({
      params: { stopId: stopIdSchema },
    }, "invalid_stop_name"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const stop = await getStop(db, req.user!.id, params.stopId);
      if (!stop) {
        res.status(404).json({ error: "stop not found" });
        return;
      }
      res.json(stop);
    },
  );

  router.post(
    "/:stopId/items",
    validateRequest({
      body: addStopItemRequestSchema,
      params: { stopId: stopIdSchema },
    }, "missing_item_id"),
    async (req, res) => {
      const { body, params } = res.locals.validated;
      const stop = await addItemToStop(
        db,
        req.user!.id,
        params.stopId,
        body.itemId,
      );
      if (!stop) {
        res.status(404).json({ error: "stop or item not found" });
        return;
      }
      res.json(stop);
    },
  );

  router.delete(
    "/:stopId/items/:itemId",
    validateRequest({
      params: { stopId: stopIdSchema, itemId: itemIdSchema },
    }, "missing_item_id"),
    async (req, res) => {
      const { params } = res.locals.validated;
      const stop = await removeItemFromStop(
        db,
        req.user!.id,
        params.stopId,
        params.itemId,
      );
      if (!stop) {
        res.status(404).json({ error: "stop not found" });
        return;
      }
      res.json(stop);
    },
  );

  return router;
}
