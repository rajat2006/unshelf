import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { Express } from "express";
import type { Pool } from "pg";
import { createApp } from "../src/app";
import { createPool } from "../src/db";
import { applySchema } from "../src/schema";

/**
 * The primary test seam: drive the Express HTTP boundary against a real,
 * ephemeral Postgres spun up just for this run. This is the harness every later
 * ticket copies — a throwaway database, the schema applied, the app built around
 * that pool, and assertions on the actual HTTP response.
 */
let container: StartedPostgreSqlContainer;
let pool: Pool;
let app: Express;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  pool = createPool(container.getConnectionUri());
  await applySchema(pool);
  app = createApp(pool);
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("GET /api/health", () => {
  it("reads a row back from Postgres and reports the stack is up", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("up");
    expect(res.body.message).toBe("unshelf api is alive");
    expect(typeof res.body.time).toBe("string");
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false);
  });
});
