import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { RequestHandler } from "express";
import type { Database } from "../src/db";
import { createApp } from "../src/app";
import { createCollectingLogger } from "../src/logger";

describe("API request lifecycle", () => {
  it("returns a server-owned request ID and records a completed matched request", async () => {
    const logger = createCollectingLogger();
    const times = [100, 112.5];
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "d40b6b4d-73c8-4b6b-81a4-d35f7c6bce61",
      monotonicNow: () => times.shift()!,
    });

    const response = await request(app)
      .get("/api/health")
      .set("X-Request-Id", "caller-controlled");

    expect(response.headers["x-request-id"]).toBe(
      "d40b6b4d-73c8-4b6b-81a4-d35f7c6bce61",
    );
    expect(logger.records).toEqual([
      {
        level: "debug",
        event: "unshelf.api.request.ended",
        msg: "API request ended",
        requestId: "d40b6b4d-73c8-4b6b-81a4-d35f7c6bce61",
        method: "GET",
        route: "/api/health",
        durationMs: 12.5,
        termination: "completed",
        status: 200,
      },
    ]);
  });

  it("records the complete registered template for a mounted route", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "07dd3444-e2af-4a4d-988b-cce3fe3f06b4",
      monotonicNow: elapsedClock(3),
    });

    await request(app).get("/api/items/not-a-uuid").expect(400);

    expect(logger.records).toEqual([
      expect.objectContaining({
        level: "info",
        method: "GET",
        route: "/api/items/:itemId",
        durationMs: 3,
        termination: "completed",
        status: 400,
      }),
    ]);
  });

  it("keeps the mount prefix when a matched route fails asynchronously", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "652223ea-3cd5-4251-8fd4-677e7b09f69e",
      monotonicNow: elapsedClock(3),
    });

    await request(app)
      .get("/api/items/098d8041-1b9b-47d9-b75f-dbd7f9d04c25")
      .expect(500);

    expect(logger.records[0]).toMatchObject({
      level: "error",
      route: "/api/items/:itemId",
      status: 500,
    });
  });

  it("does not add a trailing slash to a mounted router root", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "eecf532a-436d-4e9e-b916-98e4dbac9c94",
      monotonicNow: elapsedClock(1),
    });

    await request(app).post("/api/items").send({}).expect(400);

    expect(logger.records[0]).toMatchObject({
      route: "/api/items",
    });
  });

  it("classifies a completed routing miss without recording its raw URL", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "0e9b80b3-18f8-48ac-a632-f203ab76e539",
      monotonicNow: elapsedClock(1),
    });

    await request(app).get("/private/raw/path-value").expect(404);

    expect(logger.records[0]).toMatchObject({
      route: "UNMATCHED",
      termination: "completed",
      status: 404,
    });
    expect(JSON.stringify(logger.records)).not.toContain("private");
  });

  it("classifies termination before route resolution as unresolved", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "ef470dac-c474-4ad0-b29a-b21b55d59d09",
      monotonicNow: elapsedClock(2),
    });

    await request(app)
      .post("/api/items")
      .set("Content-Type", "application/json")
      .send('{"title":')
      .expect(400);

    expect(logger.records[0]).toMatchObject({
      route: "UNRESOLVED",
      termination: "completed",
      status: 400,
    });
  });

  it("records an aborted request exactly once without a response status", async () => {
    let beginQuery!: () => void;
    const queryStarted = new Promise<void>((resolve) => {
      beginQuery = resolve;
    });
    let releaseQuery!: () => void;
    const db = pendingHealthDatabase(beginQuery, (release) => {
      releaseQuery = release;
    });
    const logger = createCollectingLogger();
    const app = createApp(db, [passThroughAuth], {
      logger,
      generateRequestId: () => "bcde6905-b89e-4726-bb88-dd0821f25764",
      monotonicNow: elapsedClock(7),
    });

    const pendingRequest = request(app).get("/api/health");
    pendingRequest.end(() => undefined);
    await queryStarted;
    pendingRequest.abort();
    await vi.waitFor(() => expect(logger.records).toHaveLength(1));
    releaseQuery();

    expect(logger.records).toEqual([
      {
        level: "error",
        event: "unshelf.api.request.ended",
        msg: "API request ended",
        requestId: "bcde6905-b89e-4726-bb88-dd0821f25764",
        method: "GET",
        route: "/api/health",
        durationMs: 7,
        termination: "aborted",
      },
    ]);
  });

  it("records failed health responses at error severity", async () => {
    const logger = createCollectingLogger();
    const app = createApp(failingDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "9334cf7e-3646-4db8-a6b9-55dc3c0d7863",
      monotonicNow: elapsedClock(4),
    });

    await request(app).get("/api/health").expect(503);

    expect(logger.records[0]).toMatchObject({
      level: "error",
      route: "/api/health",
      termination: "completed",
      status: 503,
    });
  });

  it("represents unusual HTTP methods with a stable low-cardinality value", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "683dc222-a4c1-470e-8496-6a06b1c66c71",
      monotonicNow: elapsedClock(1),
    });
    const unusualRequest = request(app).get("/unmatched");
    (unusualRequest as unknown as { method: string }).method = "PROPFIND";

    await unusualRequest.expect(404);

    expect(logger.records[0]).toMatchObject({
      method: "_OTHER",
      route: "UNMATCHED",
    });
  });

  it("generates a fresh correlation ID for every request", async () => {
    const logger = createCollectingLogger();
    const requestIds = [
      "6da7c45c-7745-4620-b33d-f00f4bd3ca1b",
      "495f2bbd-08d0-4428-a7cc-cee462dd70fe",
    ];
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => requestIds.shift()!,
      monotonicNow: () => 0,
    });

    const first = await request(app).get("/api/health");
    const second = await request(app).get("/api/health");

    expect([
      first.headers["x-request-id"],
      second.headers["x-request-id"],
    ]).toEqual([
      "6da7c45c-7745-4620-b33d-f00f4bd3ca1b",
      "495f2bbd-08d0-4428-a7cc-cee462dd70fe",
    ]);
    expect(logger.records.map((record) => record.requestId)).toEqual([
      "6da7c45c-7745-4620-b33d-f00f4bd3ca1b",
      "495f2bbd-08d0-4428-a7cc-cee462dd70fe",
    ]);
  });
});

const passThroughAuth: RequestHandler = (_req, _res, next) => next();

function healthyDatabase(): Database {
  return {
    select: () => ({
      from: () => ({
        limit: async () => [
          {
            message: "unshelf api is alive",
            time: "2026-07-27T00:00:00.000Z",
          },
        ],
      }),
    }),
  } as unknown as Database;
}

function elapsedClock(durationMs: number): () => number {
  const times = [0, durationMs];
  return () => times.shift()!;
}

function pendingHealthDatabase(
  queryStarted: () => void,
  captureRelease: (release: () => void) => void,
): Database {
  return {
    select: () => ({
      from: () => ({
        limit: () =>
          new Promise((resolve) => {
            queryStarted();
            captureRelease(() =>
              resolve([
                {
                  message: "unshelf api is alive",
                  time: "2026-07-27T00:00:00.000Z",
                },
              ]),
            );
          }),
      }),
    }),
  } as unknown as Database;
}

function failingDatabase(): Database {
  return {
    select: () => ({
      from: () => ({
        limit: async () => {
          throw new Error("database unavailable");
        },
      }),
    }),
  } as unknown as Database;
}
