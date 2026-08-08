import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
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

const execFileAsync = promisify(execFile);
const API_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("migration CLI", () => {
  it("applies migrations on PostgreSQL 18 and supports read-only verification", async () => {
    const container = await new PostgreSqlContainer(
      "postgres:18-alpine",
    ).start();
    const db = createDatabase(container.getConnectionUri());

    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--import", "tsx", "src/migrate.ts"],
        {
          cwd: API_ROOT,
          env: {
            ...process.env,
            DATABASE_URL: container.getConnectionUri(),
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
      await db.$client.end();
      await container.stop();
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
