import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { Express } from "express";
import type { Pool } from "pg";
import { createApp } from "../src/app";
import { createAuthMiddleware } from "../src/auth";
import { createPool } from "../src/db";
import { applySchema } from "../src/schema";

/**
 * The api test harness (extends T1's): an ephemeral Postgres, the schema applied,
 * and the real app — but wired with a Clerk-free auth chain. This is the
 * injection seam in action: `createAuthMiddleware` takes an `Identify` that here
 * reads the `x-test-clerk-user-id` header, so a test can act as any User (and
 * provision a real `users` row) without touching Clerk. It is the same middleware
 * production uses; only the identity source differs.
 */
export const TEST_USER_HEADER = "x-test-clerk-user-id";

export interface TestApp {
  app: Express;
  pool: Pool;
  stop: () => Promise<void>;
}

export async function startTestApp(): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();
  const pool = createPool(container.getConnectionUri());
  await applySchema(pool);

  const auth = createAuthMiddleware(pool, (req) => {
    const header = req.header(TEST_USER_HEADER);
    return header && header.length > 0 ? header : null;
  });
  const app = createApp(pool, [auth]);

  return {
    app,
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
