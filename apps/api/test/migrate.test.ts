import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createCollectingLogger } from "../src/logging/testing";
import { createDatabase } from "../src/db";
import {
  anyValue,
  objectContaining,
  parseJsonRecord,
} from "./assertion-boundaries";
import { stopTestPostgres, trackTestPool } from "./postgres-lifecycle";

const execFileAsync = promisify(execFile);
const API_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("migration CLI", () => {
  it("applies migrations on PostgreSQL 18 and supports read-only verification", async () => {
    const container = await new PostgreSqlContainer(
      "postgres:18-alpine",
    ).start();
    const db = createDatabase({
      connectionString: container.getConnectionUri(),
      timeZone: "UTC",
    });
    const testPool = trackTestPool(db.$client);

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--import", "tsx", "src/migrate.ts"],
        {
          cwd: API_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: container.getConnectionUri(),
            DATABASE_TIME_ZONE: "UTC",
            MIGRATION_MODE: "apply",
          },
        },
      );
      const records = stdout.trim().split("\n").map(parseJsonRecord);

      expect(records).toEqual([
        objectContaining({
          level: "info",
          event: "unshelf.migration.started",
          msg: "Migration started",
          mode: "apply",
        }),
        objectContaining({
          level: "info",
          event: "unshelf.migration.completed",
          msg: "Migration completed",
          mode: "apply",
          durationMs: anyValue(Number),
        }),
      ]);

      const response = await request(
        createApp(db, [(_req, _res, next) => next()], {
          logger: createCollectingLogger(),
        }),
      ).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "ok",
        db: "up",
        message: "unshelf api is alive",
      });

      const planTables = await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'learning_plans',
            'learning_plan_nodes',
            'learning_plan_item_placements',
            'stages',
            'stage_items',
            'learning_plan_edges'
          )
        ORDER BY table_name
      `);
      expect(planTables.rows.map(({ table_name }) => table_name)).toEqual([
        "learning_plan_edges",
        "learning_plan_item_placements",
        "learning_plan_nodes",
        "learning_plans",
        "stage_items",
        "stages",
      ]);

      const retiredTables = await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('trails', 'stops', 'stop_items', 'trail_edges')
      `);
      expect(retiredTables.rows).toEqual([]);

      await db.$client.query(
        "CREATE ROLE migration_verifier LOGIN PASSWORD 'verification-only-test-password'",
      );
      await db.$client.query(
        "GRANT USAGE ON SCHEMA public, drizzle TO migration_verifier",
      );
      await db.$client.query(
        "GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO migration_verifier",
      );
      const schemaBefore = await readSchemaShape(db.$client);
      const verificationUrl = new URL(container.getConnectionUri());
      verificationUrl.username = "migration_verifier";
      verificationUrl.password = "verification-only-test-password";

      const verification = await execFileAsync(
        process.execPath,
        ["--import", "tsx", "src/migrate.ts"],
        {
          cwd: API_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: verificationUrl.toString(),
            DATABASE_TIME_ZONE: "UTC",
            MIGRATION_MODE: "verify",
          },
        },
      );
      const verificationRecords = verification.stdout
        .trim()
        .split("\n")
        .map(parseJsonRecord);

      expect(verificationRecords).toEqual([
        objectContaining({
          level: "info",
          event: "unshelf.migration.started",
          msg: "Migration started",
          mode: "verify",
        }),
        objectContaining({
          level: "info",
          event: "unshelf.migration.completed",
          msg: "Migration completed",
          mode: "verify",
          durationMs: anyValue(Number),
        }),
      ]);
      expect(await readSchemaShape(db.$client)).toEqual(schemaBefore);

      await db.$client.query(`
        DELETE FROM drizzle.__drizzle_migrations
        WHERE created_at = (
          SELECT MAX(created_at) FROM drizzle.__drizzle_migrations
        )
      `);
      const failedVerification = await captureFailure(
        execFileAsync(process.execPath, ["--import", "tsx", "src/migrate.ts"], {
          cwd: API_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: verificationUrl.toString(),
            DATABASE_TIME_ZONE: "UTC",
            MIGRATION_MODE: "verify",
          },
        }),
      );

      expect(failedVerification.code).not.toBe(0);
      expect(
        `${failedVerification.stdout}\n${failedVerification.stderr}`,
      ).not.toContain("verification-only-test-password");
      expect(await readSchemaShape(db.$client)).toEqual(schemaBefore);
    } finally {
      await stopTestPostgres({ pool: testPool, container });
    }
  });
});

async function readSchemaShape(client: {
  query(query: string): Promise<{ rows: unknown[] }>;
}): Promise<unknown[]> {
  const result = await client.query(`
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'drizzle')
    ORDER BY table_schema, table_name, ordinal_position
  `);
  return result.rows;
}

async function captureFailure(
  operation: Promise<unknown>,
): Promise<{ code?: number; stderr?: string; stdout?: string }> {
  try {
    await operation;
  } catch (failure) {
    return failure as { code?: number; stderr?: string; stdout?: string };
  }
  throw new Error("Expected operation to fail");
}
