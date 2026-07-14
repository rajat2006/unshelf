import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { startTestApp, type TestApp } from "./harness";

/**
 * The primary test seam: drive the Express HTTP boundary against a real,
 * ephemeral Postgres spun up just for this run. This is the harness every later
 * ticket copies — a throwaway database, the schema applied, the app built around
 * that pool, and assertions on the actual HTTP response.
 */
let harness: TestApp;
let app: Express;

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
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
