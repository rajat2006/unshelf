import { fileURLToPath } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { readMigrationFiles, type MigrationMeta } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Express } from "express";
import type { Pool } from "pg";
import type { ClerkUserId } from "@unshelf/shared";
import { createApp } from "../src/app";
import { createAuthMiddleware } from "../src/middleware/auth";
import type { Identify } from "../src/middleware/auth";
import {
  createDatabase,
  type Database,
  type DatabaseWithClient,
} from "../src/db";
import {
  createCollectingLogger,
  type CollectingLogger,
} from "../src/logging/testing";
import {
  unavailableYouTubeClient,
  type YouTubeClient,
} from "../src/discover/youtube-client";
import { createDiscoverModule } from "../src/discover/index";
import type { DiscoverAcquisitionTick } from "../src/discover/scheduled-acquisition";

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
  runDiscoverAcquisitionTick: DiscoverAcquisitionTick;
  stop: () => Promise<void>;
}

export interface LegacyLearningPlanFixture {
  clerkUserId: string;
  userId: string;
  learningPlanId: string;
  firstStageId: string;
  secondStageId: string;
  itemId: string;
  learningPlanName: string;
  firstStageName: string;
  secondStageName: string;
  itemTitle: string;
}

export async function seedLegacyLearningPlanFixture(
  db: Database,
  fixture: LegacyLearningPlanFixture,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, clerk_user_id)
    VALUES (${fixture.userId}, ${fixture.clerkUserId})
  `);
  await db.execute(sql`
    INSERT INTO trails (id, user_id, name)
    VALUES (
      ${fixture.learningPlanId},
      ${fixture.userId},
      ${fixture.learningPlanName}
    )
  `);
  await db.execute(sql`
    INSERT INTO stops (id, user_id, trail_id, name)
    VALUES
      (
        ${fixture.firstStageId},
        ${fixture.userId},
        ${fixture.learningPlanId},
        ${fixture.firstStageName}
      ),
      (
        ${fixture.secondStageId},
        ${fixture.userId},
        ${fixture.learningPlanId},
        ${fixture.secondStageName}
      )
  `);
  await db.execute(sql`
    INSERT INTO items (id, user_id, title, type)
    VALUES (
      ${fixture.itemId},
      ${fixture.userId},
      ${fixture.itemTitle},
      'article'
    )
  `);
  await db.execute(sql`
    INSERT INTO stop_items (user_id, stop_id, item_id, trail_id)
    VALUES (
      ${fixture.userId},
      ${fixture.firstStageId},
      ${fixture.itemId},
      ${fixture.learningPlanId}
    )
  `);
  await db.execute(sql`
    INSERT INTO trail_edges (user_id, trail_id, from_stop_id, to_stop_id)
    VALUES (
      ${fixture.userId},
      ${fixture.learningPlanId},
      ${fixture.firstStageId},
      ${fixture.secondStageId}
    )
  `);
}

export async function startTestApp({
  identify = identifyFromTestHeader,
  timeZone = "UTC",
  youtubeClient = unavailableYouTubeClient,
  now = () => new Date("2026-08-23T00:00:00.000Z"),
}: {
  identify?: Identify;
  timeZone?: string;
  youtubeClient?: YouTubeClient;
  now?: () => Date;
} = {}): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();
  const db = createDatabase({
    connectionString: container.getConnectionUri(),
    timeZone,
  });
  await migrateTestDatabase(db);

  return runningTestApp({ container, db, identify, youtubeClient, now });
}

/**
 * Start the real app after inserting a fixture immediately before the committed
 * Trail-to-Learning-Plan migration. Browser coverage uses this to exercise
 * legacy rows through that migration, every later migration, and then the normal
 * HTTP/UI seams.
 */
export async function startTestAppWithLegacyFixture(
  identify: Identify,
  seedLegacyDatabase: (db: Database) => Promise<void>,
): Promise<TestApp> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();
  const db = createDatabase({
    connectionString: container.getConnectionUri(),
    timeZone: "UTC",
  });
  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  const learningPlanMigrationIndex = migrations.findIndex((migration) =>
    migration.sql.some((statement) =>
      statement.includes('ALTER TABLE "trails" RENAME TO "learning_plans"'),
    ),
  );
  if (learningPlanMigrationIndex < 0) {
    throw new Error("Learning Plan migration is required");
  }

  await applyMigrationFiles(
    db,
    migrations.slice(0, learningPlanMigrationIndex),
  );
  await seedLegacyDatabase(db);
  await applyMigrationFiles(db, migrations.slice(learningPlanMigrationIndex));
  return runningTestApp({
    container,
    db,
    identify,
    youtubeClient: unavailableYouTubeClient,
    now: () => new Date("2026-08-23T00:00:00.000Z"),
  });
}

async function applyMigrationFiles(
  db: Database,
  migrations: MigrationMeta[],
): Promise<void> {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      await db.execute(sql.raw(statement));
    }
  }
}

function runningTestApp({
  container,
  db,
  identify,
  youtubeClient,
  now,
}: {
  container: StartedPostgreSqlContainer;
  db: DatabaseWithClient;
  identify: Identify;
  youtubeClient: YouTubeClient;
  now: () => Date;
}): TestApp {
  const auth = createAuthMiddleware(db, identify);
  const logger = createCollectingLogger();
  const discoverModule = createDiscoverModule({
    db,
    youtubeClient,
    now,
    logger,
  });
  const app = createApp(db, [auth], { logger, discoverModule });

  return {
    app,
    pool: db.$client,
    logger,
    runDiscoverAcquisitionTick: discoverModule.runScheduledAcquisitionTick,
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
