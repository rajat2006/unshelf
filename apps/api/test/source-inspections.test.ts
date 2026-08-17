import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { Type } from "@unshelf/shared";
import type { SourceInspectionService } from "../src/source-inspections/service";
import { anyValue } from "./assertion-boundaries";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

const clerkUserId = "user_source_inspection";
const source = "https://youtu.be/M7lc1UVf-VE?secret=source-sentinel";
const inspect = vi.fn<SourceInspectionService["inspect"]>();

let harness: TestApp;

beforeAll(async () => {
  harness = await startTestApp({
    sourceInspectionService: { inspect },
  });
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(() => {
  inspect.mockReset();
});

describe("POST /api/source-inspections", () => {
  it("rejects a signed-out request without invoking inspection", async () => {
    await request(harness.app)
      .post("/api/source-inspections")
      .send({ source })
      .expect(401, { error: "unauthenticated" });

    expect(inspect).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "body.source"],
    [{ source: 42 }, "body.source"],
    [{ source, title: "undeclared" }, "body.$unknown"],
  ])("strictly validates the request document", async (body, issuePath) => {
    const response = await request(harness.app)
      .post("/api/source-inspections")
      .set(TEST_USER_HEADER, clerkUserId)
      .send(body)
      .expect(400);

    expect(response.body).toMatchObject({
      error: "invalid_request",
      issues: [{ path: issuePath }],
    });
    expect(inspect).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: "suggested" as const,
      type: Type.Video,
      typeEvidence: "youtube_route" as const,
    },
    { status: "unavailable" as const },
  ])("returns a no-store semantic response", async (inspectionResponse) => {
    inspect.mockResolvedValueOnce({ ok: true, response: inspectionResponse });

    const response = await request(harness.app)
      .post("/api/source-inspections")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ source })
      .expect(200, inspectionResponse);

    expect(response.get("Cache-Control")).toBe("no-store");
    expect(inspect).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledWith({
      source,
      userId: anyValue(String),
      signal: anyValue(AbortSignal),
    });
  });

  it("does not create an Item", async () => {
    inspect.mockResolvedValueOnce({
      ok: true,
      response: {
        status: "suggested",
        type: Type.Video,
        typeEvidence: "youtube_route",
      },
    });

    await request(harness.app)
      .post("/api/source-inspections")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ source })
      .expect(200);
    const count = await harness.pool.query<{ count: string }>(
      "select count(*) from items",
    );

    expect(count.rows).toEqual([{ count: "0" }]);
  });

  it("keeps Source and query values out of unexpected-failure diagnostics", async () => {
    inspect.mockResolvedValueOnce({
      ok: false,
      error: "source_inspection_failed",
    });

    await request(harness.app)
      .post("/api/source-inspections?attempt=query-sentinel")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ source })
      .expect(500, {
        error: "internal_server_error",
        message: "An unexpected error occurred",
      });

    const serializedRecords = JSON.stringify(harness.logger.records);
    expect(serializedRecords).not.toContain("source-sentinel");
    expect(serializedRecords).not.toContain("query-sentinel");
    const terminalRecord = [...harness.logger.records]
      .reverse()
      .find((record) => record.event === "unshelf.api.request.ended");
    expect(terminalRecord).toMatchObject({
      route: "/api/source-inspections",
      status: 500,
    });
    expect(terminalRecord?.request).not.toHaveProperty("body");
    expect(terminalRecord?.request).not.toHaveProperty("query");
  });
});
