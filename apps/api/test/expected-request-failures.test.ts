import { describe, expect, it } from "vitest";
import request from "supertest";
import type { RequestHandler } from "express";
import type { UserId } from "@unshelf/shared";
import type { Database } from "../src/db";
import { createApp } from "../src/app";
import { createAuthMiddleware } from "../src/auth";
import { createCollectingLogger } from "../src/logger";

describe("expected API request failures", () => {
  it("records one correlated warning when authentication is absent", async () => {
    const logger = createCollectingLogger();
    const app = createApp(
      unusedDatabase(),
      [createAuthMiddleware(unusedDatabase(), () => null)],
      {
        logger,
        generateRequestId: () => "84892449-7358-43c3-a46e-d5015c959fa6",
        monotonicNow: () => 0,
      },
    );

    const response = await request(app)
      .get("/api/me?view=retained-view&access_token=query-sentinel")
      .set("Authorization", "Bearer header-sentinel")
      .set("Cookie", "session=cookie-sentinel")
      .set("X-Business-Context", "retained-header")
      .expect(401);

    expect(response.body).toEqual({ error: "unauthenticated" });
    expect(
      logger.records.filter(
        (record) =>
          record.event === "unshelf.api.authentication.failed",
      ),
    ).toEqual([
      {
        level: "warn",
        event: "unshelf.api.authentication.failed",
        msg: "Authentication failed",
        requestId: "84892449-7358-43c3-a46e-d5015c959fa6",
        reason: "unauthenticated",
      },
    ]);
    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      requestId: "84892449-7358-43c3-a46e-d5015c959fa6",
      status: 401,
      request: {
        method: "GET",
        path: "/api/me",
        headers: expect.objectContaining({
          authorization: "[REDACTED]",
          cookie: "[REDACTED]",
          "x-business-context": "retained-header",
        }),
        params: {},
        query: {
          view: "retained-view",
          access_token: "[REDACTED]",
        },
        body: "[undefined]",
      },
    });
    expect(JSON.stringify(logger.records)).not.toContain("sentinel");
  });

  it("keeps authentication provider exceptions classified as unexpected", async () => {
    const logger = createCollectingLogger();
    const app = createApp(
      unusedDatabase(),
      [
        createAuthMiddleware(unusedDatabase(), () => {
          throw new Error("identity provider unavailable");
        }),
      ],
      {
        logger,
        generateRequestId: () => "fa660e7e-cc15-4423-b93a-40fe9ec7b84b",
        monotonicNow: () => 0,
      },
    );

    await request(app).get("/api/me").expect(500);

    expect(
      logger.records.map(({ event, level, requestId }) => ({
        event,
        level,
        requestId,
      })),
    ).toEqual([
      {
        event: "unshelf.api.error.unexpected",
        level: "error",
        requestId: "fa660e7e-cc15-4423-b93a-40fe9ec7b84b",
      },
      {
        event: "unshelf.api.request.ended",
        level: "error",
        requestId: "fa660e7e-cc15-4423-b93a-40fe9ec7b84b",
      },
    ]);
  });

  it("classifies an invalid Item capture with the internal User", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "aa97b0a4-70a8-4127-a018-51d35c7a311f",
      monotonicNow: () => 0,
    });

    const response = await request(app)
      .post("/api/items")
      .send({
        title: "retained-title",
        type: "invalid-type",
        source: "retained-source",
        password: "body-sentinel",
      })
      .expect(400);

    expect(response.body).toMatchObject({ error: "invalid_request" });
    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.validation.failed",
      ),
    ).toEqual({
      level: "warn",
      event: "unshelf.api.validation.failed",
      msg: "Request validation failed",
      requestId: "aa97b0a4-70a8-4127-a018-51d35c7a311f",
      userId: "1a6d2d5f-9a21-4651-b1e1-a348ff462b26",
      validationCode: "invalid_item_create",
    });
    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      request: {
        body: {
          title: "retained-title",
          type: "invalid-type",
          source: "retained-source",
          password: "[REDACTED]",
        },
      },
    });
    expect(JSON.stringify(logger.records)).not.toContain("body-sentinel");
  });

  it("classifies an invalid Item Status update", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "bd03260e-31cd-4878-88bb-ae5f05884cf8",
      monotonicNow: () => 0,
    });

    await request(app)
      .patch("/api/items/00fc6af8-f79a-41fd-95eb-7bd00f2518ac/status")
      .send({ status: "almost done" })
      .expect(400);

    expect(validationCode(logger.records)).toBe("invalid_item_status");
  });

  it("classifies an invalid Target date update", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "774194cf-b1df-4462-ae81-f1e87c841767",
      monotonicNow: () => 0,
    });

    await request(app)
      .patch(
        "/api/items/00fc6af8-f79a-41fd-95eb-7bd00f2518ac/target-date",
      )
      .send({ targetDate: "2026-02-30" })
      .expect(400);

    expect(validationCode(logger.records)).toBe("invalid_target_date");
  });

  it("classifies an invalid Label name", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "f904af7b-9c07-4534-96c6-18e221f89486",
      monotonicNow: () => 0,
    });

    await request(app)
      .post("/api/labels")
      .send({ name: "   " })
      .expect(400);

    expect(validationCode(logger.records)).toBe("invalid_label_name");
  });

  it("classifies a missing Item id on a Stop membership request", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "c1e56006-2a38-4f60-8734-e39a005d9e1b",
      monotonicNow: () => 0,
    });

    await request(app)
      .post("/api/stops/b5a72490-1fba-4ca5-b78e-e7bb3bddb611/items")
      .send({})
      .expect(400);

    expect(validationCode(logger.records)).toBe("missing_item_id");
  });

  it("classifies an invalid Trail name", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "d04db2f7-2df1-4753-ac28-c27008e1fb60",
      monotonicNow: () => 0,
    });

    await request(app)
      .post("/api/trails")
      .send({ name: "   " })
      .expect(400);

    expect(validationCode(logger.records)).toBe("invalid_trail_name");
  });

  it("classifies an invalid Stop name", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "2522c0bf-0883-42a1-ac9b-022b3fb92796",
      monotonicNow: () => 0,
    });

    await request(app)
      .post(
        "/api/trails/37626b0f-6586-4670-9d8e-744d64467497/stops",
      )
      .send({ name: "   " })
      .expect(400);

    expect(validationCode(logger.records)).toBe("invalid_stop_name");
  });

  it("classifies invalid Trail edge endpoints", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "bbfbfa03-c721-49f3-bec8-d2d7fcc9fc83",
      monotonicNow: () => 0,
    });

    await request(app)
      .post(
        "/api/trails/37626b0f-6586-4670-9d8e-744d64467497/edges",
      )
      .send({ fromStopId: "not-a-stop-id" })
      .expect(400);

    expect(validationCode(logger.records)).toBe(
      "invalid_edge_endpoints",
    );
  });

  it("classifies a self-link separately from malformed edge endpoints", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "eb2feab9-6c94-4db2-a813-456d9b4cb1b0",
      monotonicNow: () => 0,
    });
    const stopId = "ad6604d7-e690-4868-aa1e-e1bfa506da07";

    await request(app)
      .post(
        "/api/trails/37626b0f-6586-4670-9d8e-744d64467497/edges",
      )
      .send({ fromStopId: stopId, toStopId: stopId })
      .expect(400);

    expect(validationCode(logger.records)).toBe("self_edge");
  });

  it("classifies malformed JSON before authentication", async () => {
    const logger = createCollectingLogger();
    const app = createApp(unusedDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "0b37bc37-03a5-4fa6-963e-f65b14392344",
      monotonicNow: () => 0,
    });

    const response = await request(app)
      .post("/api/items")
      .set("Content-Type", "application/json")
      .send('{"title":')
      .expect(400);

    expect(response.body).toEqual({
      error: "invalid_json",
      message: "Request body must be valid JSON",
    });
    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.validation.failed",
      ),
    ).toEqual({
      level: "warn",
      event: "unshelf.api.validation.failed",
      msg: "Request validation failed",
      requestId: "0b37bc37-03a5-4fa6-963e-f65b14392344",
      validationCode: "malformed_json",
    });
  });

  it("preserves a missing Item 404 with its failure snapshot", async () => {
    const logger = createCollectingLogger();
    const itemId = "8462764a-e0a3-4374-a200-aab09480f7b4";
    const app = createApp(missingItemDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "fcd3bd92-a04c-43b4-91e9-6f7cd66d89b5",
      monotonicNow: () => 0,
    });

    const response = await request(app)
      .get(`/api/items/${itemId}?context=retained-query`)
      .set("X-Business-Context", "retained-header")
      .expect(404);

    expect(response.body).toEqual({ error: "item not found" });
    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      status: 404,
      route: "/api/items/:itemId",
      request: {
        method: "GET",
        path: `/api/items/${itemId}`,
        headers: expect.objectContaining({
          "x-business-context": "retained-header",
        }),
        params: { itemId },
        query: { context: "retained-query" },
        body: "[undefined]",
      },
    });
  });

  it("preserves a Trail-cycle 409 with its failure snapshot", async () => {
    const logger = createCollectingLogger();
    const trailId = "37626b0f-6586-4670-9d8e-744d64467497";
    const fromStopId = "ad6604d7-e690-4868-aa1e-e1bfa506da07";
    const toStopId = "03c9a63d-0435-4f31-9682-e50a3890b102";
    const app = createApp(cyclicTrailDatabase(), [authenticatedUser], {
      logger,
      generateRequestId: () => "86c12c02-2103-425f-9f04-6f917c298f54",
      monotonicNow: () => 0,
    });

    const response = await request(app)
      .post(`/api/trails/${trailId}/edges`)
      .send({ fromStopId, toStopId })
      .expect(409);

    expect(response.body).toEqual({
      error: "that link would create a cycle in the trail",
    });
    expect(
      logger.records.find(
        (record) => record.event === "unshelf.api.request.ended",
      ),
    ).toMatchObject({
      status: 409,
      route: "/api/trails/:trailId/edges",
      request: {
        path: `/api/trails/${trailId}/edges`,
        params: { trailId },
        body: { fromStopId, toStopId },
      },
    });
    expect(
      logger.records.some(
        (record) => record.event === "unshelf.api.validation.failed",
      ),
    ).toBe(false);
  });
});

function unusedDatabase(): Database {
  return {} as Database;
}

function missingItemDatabase(): Database {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  } as unknown as Database;
}

function cyclicTrailDatabase(): Database {
  let executeCount = 0;
  const transaction = {
    select: () => ({
      from: () => ({
        where: async () => [{ count: 2 }],
      }),
    }),
    execute: async () => {
      executeCount += 1;
      return { rows: executeCount === 1 ? [] : [{}] };
    },
  };
  return {
    transaction: async (
      operation: (tx: typeof transaction) => Promise<unknown>,
    ) => operation(transaction),
  } as unknown as Database;
}

const authenticatedUser: RequestHandler = (req, _res, next) => {
  req.user = {
    id: "1a6d2d5f-9a21-4651-b1e1-a348ff462b26" as UserId,
    clerkUserId: "not-logged" as never,
    createdAt: "2026-07-27T00:00:00.000Z",
  };
  next();
};

function validationCode(
  records: ReadonlyArray<Readonly<Record<string, unknown>>>,
): unknown {
  return records.find(
    (record) => record.event === "unshelf.api.validation.failed",
  )?.validationCode;
}
