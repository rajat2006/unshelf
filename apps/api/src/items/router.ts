import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  Status,
  Type,
  type CreateItemRequest,
  type ItemId,
  type UpdateItemStatusRequest,
} from "@unshelf/shared";
import { createItem, listItems, updateItemStatus } from "./repository";

/** Mount the authenticated Item HTTP interface at `/api/items`. */
export function createItemsRouter(
  pool: Pool,
  auth: RequestHandler[],
): Router {
  const router = Router();
  router.use(...auth);

  router.post("/", async (req, res) => {
    const input = parseCreateItem(req.body);
    if (!input) {
      res.status(400).json({ error: "title and a valid type are required" });
      return;
    }
    const item = await createItem(pool, req.user!.id, input);
    res.status(201).json(item);
  });

  router.get("/", async (req, res) => {
    const items = await listItems(pool, req.user!.id);
    res.json(items);
  });

  router.patch("/:itemId/status", async (req, res) => {
    const input = parseUpdateItemStatus(req.body);
    if (!input) {
      res.status(400).json({ error: "a valid status is required" });
      return;
    }
    const item = await updateItemStatus(
      pool,
      req.user!.id,
      req.params.itemId as ItemId,
      input.status,
    );
    if (!item) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    res.json(item);
  });

  return router;
}

const isType = (value: unknown): value is Type =>
  ITEM_TYPES.includes(value as Type);

const isStatus = (value: unknown): value is Status =>
  ITEM_STATUSES.includes(value as Status);

/** Validate a capture payload at the HTTP seam without altering User input. */
function parseCreateItem(body: unknown): CreateItemRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { title, type, source } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  if (!isType(type)) return null;
  if (source !== undefined && source !== null && typeof source !== "string") {
    return null;
  }
  return { title, type, source: typeof source === "string" ? source : null };
}

/** Validate a Status update against the shared domain vocabulary. */
function parseUpdateItemStatus(body: unknown): UpdateItemStatusRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { status } = body as Record<string, unknown>;
  return isStatus(status) ? { status } : null;
}
