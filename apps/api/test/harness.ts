import { fileURLToPath } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Express } from "express";
import type { Pool } from "pg";
import type { ClerkUserId } from "@unshelf/shared";
import { createApp } from "../src/app";
import { createAuthMiddleware } from "../src/middleware/auth";
import type { Identify } from "../src/middleware/auth";
import { createDatabase, type Database } from "../src/db";
import {
  createCollectingLogger,
  type CollectingLogger,
} from "../src/logging/testing";

/**
 * The committed migration folder, resolved from this file rather than the
 * process cwd so the suite runs the same way from the package or the repo root.
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Bring a fresh database up to the current schema by replaying the **real
 * committed migrations** (#104). The test schema is therefore provably the
 * deployed schema, and a migration that fails to apply fails `pnpm test` rather
 * than a deploy.
 */
export async function migrateTestDatabase(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/**
 * The api test harness (extends T1's): an ephemeral Postgres, the schema applied,
 * and the real app — but wired with a Clerk-free auth chain. This is the
 * injection seam in action: `createAuthMiddleware` takes an `Identify`; the
 * default reads `x-test-clerk-user-id`, while a browser harness can supply its own
 * local credential reader. Either can act as any User (and provision a real
 * `users` row) without touching Clerk. It is the same middleware production uses;
 * only the identity source differs.
 */
export const TEST_USER_HEADER = "x-test-clerk-user-id";

export interface TestApp {
  app: Express;
  pool: Pool;
  logger: CollectingLogger;
  stop: () => Promise<void>;
}

export async function startTestApp(
  identify: Identify = identifyFromTestHeader,
): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();
  const db = createDatabase(container.getConnectionUri());
  await migrateTestDatabase(db);

  const auth = createAuthMiddleware(db, identify);
  const logger = createCollectingLogger();
  const app = createApp(db, [auth], { logger });

  return {
    app,
    pool: db.$client,
    logger,
    stop: async () => {
      await db.$client.end();
      await container.stop();
    },
  };
}

const identifyFromTestHeader: Identify = (req) => {
  const header = req.header(TEST_USER_HEADER);
  return header && header.length > 0 ? (header as ClerkUserId) : null;
};
