import express, { type Express, type RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { HealthResponse } from "@unshelf/shared";
import type { Database } from "./db";
import { healthCheck } from "./schema";
import { createItemsRouter } from "./items/router";
import { createLabelsRouter } from "./labels/router";
import { createStagesRouter } from "./stages/router";
import { createLearningPlansRouter } from "./learning-plans/router";
import { createDailyFocusRouter } from "./daily-focus/router";
import { createApiErrorHandler } from "./middleware/error-handler";
import { serializeFailure } from "./diagnostics";
import {
  captureRouteMount,
  createRequestLifecycle,
  markRoutingResolved,
  type RequestLifecycleOptions,
} from "./middleware/request-lifecycle";

export type AppOptions = RequestLifecycleOptions;

/**
 * Build the Express app around an injected Drizzle handle and auth chain. Both are
 * arguments (rather than globals) so the test harness can drive the real routes:
 * tests pass a handle pointed at a throwaway database and an auth chain that injects
 * a current User without Clerk; production passes the real handle and the
 * Clerk-backed chain. Every later ticket's routes hang off this same factory and
 * scope their data to `req.user`.
 */
export function createApp(
  db: Database,
  auth: RequestHandler[],
  options: AppOptions,
): Express {
  const app = express();
  app.use(createRequestLifecycle(options));
  app.use(express.json({ strict: false }));

  app.get("/api/health", async (req, res) => {
    try {
      const [row] = await db
        .select({ message: healthCheck.message, time: sql<string>`now()` })
        .from(healthCheck)
        .limit(1);
      const body: HealthResponse = {
        status: "ok",
        message: row?.message ?? "unknown",
        db: "up",
        time: row ? new Date(row.time).toISOString() : new Date().toISOString(),
      };
      res.json(body);
    } catch (error) {
      req.logger.error({
        event: "unshelf.api.health.failed",
        msg: "API health check failed",
        dependency: "postgres",
        ...serializeFailure(error, {
          secrets: options.diagnosticSecrets,
        }),
      });
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

  app.use("/api/items", captureRouteMount, createItemsRouter(db, auth));
  app.use("/api/labels", captureRouteMount, createLabelsRouter(db, auth));
  app.use("/api/stages", captureRouteMount, createStagesRouter(db, auth));
  app.use(
    "/api/learning-plans",
    captureRouteMount,
    createLearningPlansRouter(db, auth),
  );
  app.use(
    "/api/daily-focus",
    captureRouteMount,
    createDailyFocusRouter(db, auth),
  );
  app.use(markRoutingResolved);
  app.use(
    createApiErrorHandler({
      secrets: options.diagnosticSecrets,
    }),
  );

  return app;
}
