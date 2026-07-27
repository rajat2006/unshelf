import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createCollectingLogger } from "../src/logger";
import { createDatabase } from "../src/db";

const execFileAsync = promisify(execFile);
const API_ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("migration CLI", () => {
  it("prepares a fresh database for the API", async () => {
    const container = await new PostgreSqlContainer(
      "postgres:16-alpine",
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
          },
        },
      );
      const records = stdout
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(records).toEqual([
        expect.objectContaining({
          level: "info",
          event: "unshelf.migration.started",
          msg: "Migration started",
        }),
        expect.objectContaining({
          level: "info",
          event: "unshelf.migration.completed",
          msg: "Migration completed",
          durationMs: expect.any(Number),
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
    } finally {
      await db.$client.end();
      await container.stop();
    }
  });
});
