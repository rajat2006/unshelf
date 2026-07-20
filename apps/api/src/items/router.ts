import { Router, type RequestHandler } from "express";
import type { Pool } from "pg";
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  Status,
  Type,
  type CreateItemRequest,
  type ItemId,
  type LabelId,
  type UpdateItemStatusRequest,
  type UpdateItemTargetDateRequest,
} from "@unshelf/shared";
import {
  createItem,
  applyLabelToItem,
  getItem,
  listItems,
  removeLabelFromItem,
  updateItemStatus,
  updateItemTargetDate,
} from "./repository";

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

  router.get("/:itemId", async (req, res) => {
    if (!UUID_PATTERN.test(req.params.itemId)) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    const item = await getItem(
      pool,
      req.user!.id,
      req.params.itemId as ItemId,
    );
    if (!item) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    res.json(item);
  });

  router.post("/:itemId/labels/:labelId", async (req, res) => {
    const item = await applyLabelToItem(
      pool,
      req.user!.id,
      req.params.itemId as ItemId,
      req.params.labelId as LabelId,
    );
    if (!item) {
      res.status(404).json({ error: "item or label not found" });
      return;
    }
    res.json(item);
  });

  router.delete("/:itemId/labels/:labelId", async (req, res) => {
    const item = await removeLabelFromItem(
      pool,
      req.user!.id,
      req.params.itemId as ItemId,
      req.params.labelId as LabelId,
    );
    if (!item) {
      res.status(404).json({ error: "item or label not found" });
      return;
    }
    res.json(item);
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

  router.patch("/:itemId/target-date", async (req, res) => {
    const input = parseUpdateItemTargetDate(req.body);
    if (!input) {
      res
        .status(400)
        .json({ error: "targetDate must be a YYYY-MM-DD date or null" });
      return;
    }
    const item = await updateItemTargetDate(
      pool,
      req.user!.id,
      req.params.itemId as ItemId,
      input.targetDate,
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

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string is a real calendar date in `YYYY-MM-DD`. Unlike `source`,
 * which is kept verbatim (ADR-0007), a Target date is a structured value, so the
 * seam is strict: the pattern rejects other notations Postgres would otherwise
 * interpret for us, year zero is rejected to match Postgres' calendar, and the
 * round-trip rejects well-formed dates that do not exist (2026-02-30), which
 * would reach the `date` column as an error.
 */
function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE_PATTERN.test(value)) return false;
  if (value.startsWith("0000-")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().startsWith(value);
}

/**
 * Validate a Target date update. `null` is meaningful — it clears the date — so
 * an absent field is rejected rather than read as a clear.
 */
function parseUpdateItemTargetDate(
  body: unknown,
): UpdateItemTargetDateRequest | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("targetDate" in body)) return null;
  const { targetDate } = body as Record<string, unknown>;
  if (targetDate === null) return { targetDate: null };
  if (typeof targetDate !== "string" || !isCalendarDate(targetDate)) return null;
  return { targetDate };
}
