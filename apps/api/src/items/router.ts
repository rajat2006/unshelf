import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import { ITEM_TYPES, Type, type CreateItemRequest } from "@unshelf/shared";
import { createItem, listItems } from "./repository";

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

  return router;
}

const isType = (value: unknown): value is Type =>
  ITEM_TYPES.includes(value as Type);

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
