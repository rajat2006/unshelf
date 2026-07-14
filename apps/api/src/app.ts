import express, { type Express, type RequestHandler } from "express";
import type { Pool } from "pg";
import {
  ITEM_TYPES,
  type CreateItemRequest,
  type HealthResponse,
  type ItemType,
} from "@unshelf/shared";
import { createItem, listItems } from "./items";

/**
 * Build the Express app around an injected Postgres pool and auth chain. Both are
 * arguments (rather than globals) so the test harness can drive the real routes:
 * tests pass a pool pointed at a throwaway database and an auth chain that injects
 * a current User without Clerk; production passes the real pool and the
 * Clerk-backed chain. Every later ticket's routes hang off this same factory and
 * scope their data to `req.user`.
 */
export function createApp(pool: Pool, auth: RequestHandler[]): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", async (_req, res) => {
    try {
      const { rows } = await pool.query<{ message: string; time: Date }>(
        "SELECT message, now() AS time FROM health_check LIMIT 1",
      );
      const row = rows[0];
      const body: HealthResponse = {
        status: "ok",
        message: row?.message ?? "unknown",
        db: "up",
        time: (row?.time ?? new Date()).toISOString(),
      };
      res.json(body);
    } catch {
      const body: HealthResponse = {
        status: "error",
        message: "database unavailable",
        db: "down",
        time: new Date().toISOString(),
      };
      res.status(503).json(body);
    }
  });

  // The current User, scoped by the auth chain. Its purpose here is to prove the
  // tenancy seam end to end — every request resolves to exactly the caller's own
  // `users` row and never another's; later tickets scope their domain routes the
  // same way (`...auth`, then read/write against `req.user.id`).
  app.get("/api/me", ...auth, (req, res) => {
    res.json(req.user);
  });

  // Capture: the one uniform manual insert (ADR-0007), scoped to the current
  // User. Title and Type are required; Source is optional, stored verbatim. The
  // Item's owner is always `req.user.id` — never a client-supplied field — so one
  // User can only ever capture into their own space.
  app.post("/api/items", ...auth, async (req, res) => {
    const input = parseCreateItem(req.body);
    if (!input) {
      res.status(400).json({ error: "title and a valid type are required" });
      return;
    }
    const item = await createItem(pool, req.user!.id, input);
    res.status(201).json(item);
  });

  // All: every Item belonging to the current User, and only that User (ADR-0003).
  app.get("/api/items", ...auth, async (req, res) => {
    const items = await listItems(pool, req.user!.id);
    res.json(items);
  });

  return app;
}

const isItemType = (value: unknown): value is ItemType =>
  ITEM_TYPES.includes(value as ItemType);

/**
 * Validate a capture payload at the HTTP boundary: `title` must be a non-blank
 * string and `type` one of the shared `ITEM_TYPES`. `source` is accepted as-is
 * (verbatim, unvalidated — ADR-0007) and normalised to a string. Returns null on
 * anything malformed so the route can answer 400 rather than trust the body.
 */
function parseCreateItem(body: unknown): CreateItemRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { title, type, source } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  if (!isItemType(type)) return null;
  if (source !== undefined && source !== null && typeof source !== "string") {
    return null;
  }
  return { title, type, source: typeof source === "string" ? source : null };
}
