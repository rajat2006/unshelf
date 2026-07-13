import express, { type Express } from "express";
import type { Pool } from "pg";
import type { HealthResponse } from "@unshelf/shared";

/**
 * Build the Express app around an injected Postgres pool. Taking the pool as an
 * argument (rather than reaching for a global) is the seam the test harness
 * relies on: tests pass a pool pointed at a throwaway database, production passes
 * the real one. Every later ticket's routes hang off this same factory.
 */
export function createApp(pool: Pool): Express {
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

  return app;
}
