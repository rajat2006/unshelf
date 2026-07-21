import express, { type Express, type RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { HealthResponse } from "@unshelf/shared";
import type { Database } from "./db";
import { createItemsRouter } from "./items/router";
import { createLabelsRouter } from "./labels/router";
import { createStopsRouter } from "./stops/router";
import { createTrailsRouter } from "./trails/router";

/**
 * Build the Express app around an injected Drizzle handle and auth chain. Both are
 * arguments (rather than globals) so the test harness can drive the real routes:
 * tests pass a handle pointed at a throwaway database and an auth chain that injects
 * a current User without Clerk; production passes the real handle and the
 * Clerk-backed chain. Every later ticket's routes hang off this same factory and
 * scope their data to `req.user`.
 */
export function createApp(db: Database, auth: RequestHandler[]): Express {
  const app = express();
  app.use(express.json());

  app.get("/api/health", async (_req, res) => {
    try {
      const { rows } = await db.execute<{ message: string; time: string }>(sql`
        SELECT message, now() AS time FROM health_check LIMIT 1
      `);
      const row = rows[0];
      const body: HealthResponse = {
        status: "ok",
        message: row?.message ?? "unknown",
        db: "up",
        time: row ? new Date(row.time).toISOString() : new Date().toISOString(),
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

  app.use("/api/items", createItemsRouter(db, auth));
  app.use("/api/labels", createLabelsRouter(db, auth));
  app.use("/api/stops", createStopsRouter(db, auth));
  app.use("/api/trails", createTrailsRouter(db, auth));

  return app;
}
