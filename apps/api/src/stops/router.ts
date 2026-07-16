import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import type {
  AddStopItemRequest,
  CreateStopRequest,
  ItemId,
  StopId,
} from "@unshelf/shared";
import {
  addItemToStop,
  createStop,
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
 * A Stop or Item belonging to another User answers exactly as a missing one does
 * — 404, never 403 — so the boundary never confirms that someone else's id is a
 * real id.
 */
export function createStopsRouter(pool: Pool, auth: RequestHandler[]): Router {
  const router = Router();
  router.use(...auth);

  router.post("/", async (req, res) => {
    const input = parseCreateStop(req.body);
    if (!input) {
      res.status(400).json({ error: "a name is required" });
      return;
    }
    const stop = await createStop(pool, req.user!.id, input);
    res.status(201).json(stop);
  });

  router.get("/", async (req, res) => {
    res.json(await listStops(pool, req.user!.id));
  });

  router.get("/:stopId", async (req, res) => {
    const stop = await getStop(
      pool,
      req.user!.id,
      req.params.stopId as StopId,
    );
    if (!stop) {
      res.status(404).json({ error: "stop not found" });
      return;
    }
    res.json(stop);
  });

  router.post("/:stopId/items", async (req, res) => {
    const input = parseAddStopItem(req.body);
    if (!input) {
      res.status(400).json({ error: "an itemId is required" });
      return;
    }
    const stop = await addItemToStop(
      pool,
      req.user!.id,
      req.params.stopId as StopId,
      input.itemId,
    );
    if (!stop) {
      res.status(404).json({ error: "stop or item not found" });
      return;
    }
    res.json(stop);
  });

  router.delete("/:stopId/items/:itemId", async (req, res) => {
    const stop = await removeItemFromStop(
      pool,
      req.user!.id,
      req.params.stopId as StopId,
      req.params.itemId as ItemId,
    );
    if (!stop) {
      res.status(404).json({ error: "stop not found" });
      return;
    }
    res.json(stop);
  });

  return router;
}

/** Validate a create-Stop payload at the HTTP seam without altering User input. */
function parseCreateStop(body: unknown): CreateStopRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { name } = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  return { name };
}

/** Validate an add-to-Stop payload: one Item id, and nothing else to carry. */
function parseAddStopItem(body: unknown): AddStopItemRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { itemId } = body as Record<string, unknown>;
  if (typeof itemId !== "string" || itemId.length === 0) return null;
  return { itemId: itemId as ItemId };
}
