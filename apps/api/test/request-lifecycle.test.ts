import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { RequestHandler } from "express";
import { Type, type UserId } from "@unshelf/shared";
import type { Database } from "../src/db";
import { createApp } from "../src/app";
import { createCollectingLogger } from "../src/logging/testing";
import { anyValue, objectContaining } from "./assertion-boundaries";

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

    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      level: "info",
      method: "GET",
      route: "/api/items/:itemId",
      durationMs: 3,
      termination: "completed",
      status: 400,
    });
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

    const terminalRecord = logger.records.find(
      (record) => record.event === "unshelf.api.request.ended",
    );
    expect(terminalRecord).toMatchObject({
      level: "error",
      route: "/api/items/:itemId",
      status: 500,
      request: {
        params: {
          itemId: "098d8041-1b9b-47d9-b75f-dbd7f9d04c25",
        },
      },
    });
  });

  it("redacts a configured secret from matched route parameters and raw paths", async () => {
    const logger = createCollectingLogger();
    const secretItemId = "098d8041-1b9b-47d9-b75f-dbd7f9d04c25";
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "f9fa9d80-7d91-42b7-8f23-f591bbd5da2e",
      monotonicNow: elapsedClock(3),
      diagnosticSecrets: [secretItemId],
    });

    await request(app).get(`/api/items/${secretItemId}`).expect(500);

    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      route: "/api/items/:itemId",
      request: {
        path: "/api/items/[REDACTED]",
        params: {
          itemId: "[REDACTED]",
        },
      },
    });
    expect(JSON.stringify(logger.records)).not.toContain(secretItemId);
  });

  it("correlates rich unexpected-error diagnostics with a redacted 5xx request snapshot", async () => {
    const logger = createCollectingLogger();
    const configuredSecret = "sk_live_unexpected-sentinel";
    const failure = Object.assign(
      new Error(
        `insert failed for retained-business-value using ${configuredSecret}`,
        {
          cause: new Error("connection reset after retained-cause-value"),
        },
      ),
      {
        code: "57P01",
        query: `insert into items (title) values ($1) /* ${configuredSecret} */`,
        parameters: ["retained-item-title"],
        severity: "FATAL",
        detail: "retained database detail",
      },
    );
    const app = createApp(failingItemDatabase(failure), [authenticatedUser], {
      logger,
      generateRequestId: () => "616e1c42-5fdd-4239-993f-e9b2df0e7076",
      monotonicNow: elapsedClock(6),
      diagnosticSecrets: [configuredSecret],
    });

    const response = await request(app)
      .post(
        "/api/items?learningPlan=retained-learningPlan&access_token=query-sentinel&x-amz-signature=signature-sentinel",
      )
      .set("Authorization", "Bearer header-sentinel")
      .set("X-Business-Context", "retained-header-value")
      .send({
        title: "retained-item-title",
        type: Type.Article,
        source: "retained-source-value",
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "internal_server_error",
      message: "An unexpected error occurred",
    });
    expect(logger.records).toEqual([
      {
        level: "error",
        event: "unshelf.api.error.unexpected",
        msg: "Unexpected API error",
        requestId: "616e1c42-5fdd-4239-993f-e9b2df0e7076",
        phase: "request",
        userId: "a156d86a-09d3-4935-9bf0-1820fa357f90",
        route: "/api/items",
        error: objectContaining({
          type: "Error",
          code: "57P01",
          message: "insert failed for retained-business-value using [REDACTED]",
          cause: objectContaining({
            type: "Error",
            message: "connection reset after retained-cause-value",
          }),
        }),
        database: {
          query: "insert into items (title) values ($1) /* [REDACTED] */",
          parameters: ["retained-item-title"],
          severity: "FATAL",
          detail: "retained database detail",
        },
      },
      {
        level: "error",
        event: "unshelf.api.request.ended",
        msg: "API request ended",
        requestId: "616e1c42-5fdd-4239-993f-e9b2df0e7076",
        userId: "a156d86a-09d3-4935-9bf0-1820fa357f90",
        method: "POST",
        route: "/api/items",
        durationMs: 6,
        termination: "completed",
        status: 500,
        request: {
          method: "POST",
          path: "/api/items",
          headers: objectContaining({
            authorization: "[REDACTED]",
            "x-business-context": "retained-header-value",
          }),
          params: {},
          query: {
            learningPlan: "retained-learningPlan",
            access_token: "[REDACTED]",
            "x-amz-signature": "[REDACTED]",
          },
          body: {
            title: "retained-item-title",
            type: Type.Article,
            source: "retained-source-value",
          },
        },
      },
    ]);
    expect(JSON.stringify(logger.records)).not.toContain("sentinel");
  });

  it("does not add a trailing slash to a mounted router root", async () => {
    const logger = createCollectingLogger();
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "eecf532a-436d-4e9e-b916-98e4dbac9c94",
      monotonicNow: elapsedClock(1),
    });

    await request(app).post("/api/items").send({}).expect(400);

    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      route: "/api/items",
    });
  });

  it("classifies a routing miss and redacts its raw failure path", async () => {
    const logger = createCollectingLogger();
    const pathSecret = "raw-path-sentinel";
    const app = createApp(healthyDatabase(), [passThroughAuth], {
      logger,
      generateRequestId: () => "0e9b80b3-18f8-48ac-a632-f203ab76e539",
      monotonicNow: elapsedClock(1),
      diagnosticSecrets: [pathSecret],
    });

    await request(app).get(`/private/raw/${pathSecret}`).expect(404);

    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      route: "UNMATCHED",
      termination: "completed",
      status: 404,
      request: {
        path: "/private/raw/[REDACTED]",
      },
    });
    expect(JSON.stringify(logger.records)).not.toContain(pathSecret);
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

    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
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
        request: objectContaining({
          method: "GET",
          path: "/api/health",
          params: {},
          query: {},
        }),
      },
    ]);
  });

  it("records failed health responses at error severity", async () => {
    const logger = createCollectingLogger();
    const clerkSecret = "sk_live_health-clerk-sentinel";
    const databaseUrl =
      "postgresql://unshelf:health-db-password-sentinel@database:5432/unshelf";
    const failure = Object.assign(
      new Error(
        `connection terminated for learningPlan-42: ${clerkSecret} ${databaseUrl}`,
      ),
      {
        code: "57P01",
        query: `select message, now() from health_check /* ${clerkSecret} */`,
        parameters: [
          "health-check",
          { password: "parameter-password-sentinel", item: "learningPlan-42" },
        ],
        severity: "FATAL",
        detail: "PostgreSQL is shutting down",
        hint: "retry later",
        position: "17",
        internalPosition: "9",
        internalQuery: "select pg_sleep(1)",
        where: "SQL statement in health probe",
        schema: "public",
        table: "health_check",
        column: "message",
        dataType: "text",
        constraint: "health_check_pkey",
        source: "postgresql-server",
        file: "postgres.c",
        line: "3210",
        routine: "ProcessInterrupts",
      },
    );
    const app = createApp(failingDatabase(failure), [passThroughAuth], {
      logger,
      generateRequestId: () => "9334cf7e-3646-4db8-a6b9-55dc3c0d7863",
      monotonicNow: elapsedClock(4),
      diagnosticSecrets: [clerkSecret, databaseUrl],
    });

    const response = await request(app)
      .get(
        "/api/health?learningPlan=retained-health&access_token=health-query-sentinel",
      )
      .set("Authorization", "Bearer health-header-sentinel")
      .expect(503);

    expect(response.body).toMatchObject({
      status: "error",
      message: "database unavailable",
      db: "down",
    });
    expect(logger.records[0]).toEqual({
      level: "error",
      event: "unshelf.api.health.failed",
      msg: "API health check failed",
      requestId: "9334cf7e-3646-4db8-a6b9-55dc3c0d7863",
      dependency: "postgres",
      error: objectContaining({
        type: "Error",
        code: "57P01",
        message:
          "connection terminated for learningPlan-42: [REDACTED] [REDACTED]",
        stack: anyValue(String),
      }),
      database: {
        query: "select message, now() from health_check /* [REDACTED] */",
        parameters: [
          "health-check",
          { password: "[REDACTED]", item: "learningPlan-42" },
        ],
        severity: "FATAL",
        detail: "PostgreSQL is shutting down",
        hint: "retry later",
        position: "17",
        internalPosition: "9",
        internalQuery: "select pg_sleep(1)",
        where: "SQL statement in health probe",
        schema: "public",
        table: "health_check",
        column: "message",
        dataType: "text",
        constraint: "health_check_pkey",
        file: "postgres.c",
        line: "3210",
        routine: "ProcessInterrupts",
      },
    });
    expect(logger.records[1]).toMatchObject({
      level: "error",
      route: "/api/health",
      termination: "completed",
      status: 503,
      request: {
        method: "GET",
        path: "/api/health",
        headers: objectContaining({
          authorization: "[REDACTED]",
        }),
        params: {},
        query: {
          learningPlan: "retained-health",
          access_token: "[REDACTED]",
        },
        body: "[undefined]",
      },
    });
    expect(JSON.stringify(logger.records)).not.toContain("sentinel");
  });

  it("preserves the health response when a non-Error bigint is thrown", async () => {
    const logger = createCollectingLogger();
    const app = createApp(failingDatabase(1n), [passThroughAuth], {
      logger,
      generateRequestId: () => "595e2c53-a9a8-459e-8752-8e4c6e09c5b6",
      monotonicNow: elapsedClock(2),
    });

    const response = await request(app).get("/api/health").expect(503);

    expect(response.body).toMatchObject({
      status: "error",
      message: "database unavailable",
      db: "down",
    });
    expect(logger.records[0]).toMatchObject({
      event: "unshelf.api.health.failed",
      error: {
        type: "NonErrorThrow",
        value: "1",
      },
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

    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
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

const authenticatedUser: RequestHandler = (req, _res, next) => {
  req.user = {
    id: "a156d86a-09d3-4935-9bf0-1820fa357f90" as UserId,
    clerkUserId: "not-logged" as never,
    createdAt: "2026-07-27T00:00:00.000Z",
  };
  next();
};

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

function failingItemDatabase(failure: unknown): Database {
  const database = {
    transaction: async (callback: (tx: Database) => Promise<unknown>) =>
      callback(database as unknown as Database),
    insert: () => ({
      values: () => ({
        returning: async () => {
          throw failure;
        },
      }),
    }),
  };
  return database as unknown as Database;
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

function failingDatabase(
  error: unknown = new Error("database unavailable"),
): Database {
  return {
    select: () => ({
      from: () => ({
        limit: async () => {
          throw error;
        },
      }),
    }),
  } as unknown as Database;
}
