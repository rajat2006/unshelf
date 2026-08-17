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
      .post("/api/source-inspections?attempt=signed-out-query-sentinel")
      .send({ source })
      .expect(401, { error: "unauthenticated" });

    expect(inspect).not.toHaveBeenCalled();
    const serialized = JSON.stringify(harness.logger.records);
    expect(serialized).not.toContain("source-sentinel");
    expect(serialized).not.toContain("signed-out-query-sentinel");
    const terminalRecord = [...harness.logger.records]
      .reverse()
      .find((record) => record.event === "unshelf.api.request.ended");
    expect(terminalRecord?.request).not.toHaveProperty("body");
    expect(terminalRecord?.request).not.toHaveProperty("query");
  });

  it.each([
    [{}, "body.source"],
    [{ source: 42 }, "body.source"],
    [{ source, title: "undeclared" }, "body.$unknown"],
  ])("strictly validates the request document", async (body, issuePath) => {
    const response = await request(harness.app)
      .post("/api/source-inspections?attempt=validation-query-sentinel")
      .set(TEST_USER_HEADER, clerkUserId)
      .send(body)
      .expect(400);

    expect(response.body).toMatchObject({
      error: "invalid_request",
      issues: [{ path: issuePath }],
    });
    expect(inspect).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.logger.records)).not.toContain(
      "validation-query-sentinel",
    );
    const terminalRecord = [...harness.logger.records]
      .reverse()
      .find((record) => record.event === "unshelf.api.request.ended");
    expect(terminalRecord?.request).not.toHaveProperty("body");
    expect(terminalRecord?.request).not.toHaveProperty("query");
  });

  it("keeps malformed request failures no-store and payload-free", async () => {
    const response = await request(harness.app)
      .post("/api/source-inspections?attempt=malformed-query-sentinel")
      .set("Content-Type", "application/json")
      .send('{"source":"malformed-body-sentinel"')
      .expect(400, {
        error: "invalid_json",
        message: "Request body must be valid JSON",
      });

    expect(response.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(harness.logger.records)).not.toContain(
      "malformed-body-sentinel",
    );
    expect(JSON.stringify(harness.logger.records)).not.toContain(
      "malformed-query-sentinel",
    );
  });

  it.each([
    {
      status: "suggested" as const,
      title: "A canonical YouTube title",
      titleEvidence: "youtube_oembed" as const,
      type: Type.Video,
      typeEvidence: "youtube_route" as const,
    },
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
      observeCompletion: anyValue(Function),
    });
  });

  it("records one bounded privacy-safe completion event", async () => {
    inspect.mockImplementationOnce(async (input) => {
      input.observeCompletion?.({
        strategy: "generic",
        terminalCode: "suggested",
        suggestedTitle: true,
        suggestedType: false,
        durationMs: 42,
        phaseTimingsMs: {
          dns: 3,
          responseHeaders: 12,
          body: 8,
        },
        redirectCountBucket: "1",
        byteCountBucket: "1-65536",
      });
      return {
        ok: true,
        response: {
          status: "suggested",
          title: "source-sentinel-title",
          titleEvidence: "document_title",
        },
      };
    });

    await request(harness.app)
      .post("/api/source-inspections?attempt=query-sentinel")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ source })
      .expect(200);

    const records = harness.logger.records.filter(
      (record) => record.event === "unshelf.source_inspection.completed",
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "unshelf.source_inspection.completed",
      requestId: anyValue(String),
      userId: anyValue(String),
      strategy: "generic",
      terminalCode: "suggested",
      suggestedTitle: true,
      suggestedType: false,
      durationMs: 42,
      phaseTimingsMs: {
        dns: 3,
        responseHeaders: 12,
        body: 8,
      },
      redirectCountBucket: "1",
      byteCountBucket: "1-65536",
    });
    expect(Object.keys(records[0] ?? {}).sort()).toEqual([
      "byteCountBucket",
      "durationMs",
      "event",
      "level",
      "msg",
      "phaseTimingsMs",
      "redirectCountBucket",
      "requestId",
      "strategy",
      "suggestedTitle",
      "suggestedType",
      "terminalCode",
      "userId",
    ]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("source-sentinel");
    expect(serialized).not.toContain("query-sentinel");
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

  it("keeps an aborted inspection snapshot payload-free", async () => {
    let inspectionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      inspectionStarted = resolve;
    });
    inspect.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          inspectionStarted();
          input.signal.addEventListener(
            "abort",
            () => {
              input.observeCompletion?.({
                strategy: "generic",
                terminalCode: "cancelled",
                suggestedTitle: false,
                suggestedType: false,
                durationMs: 10,
                phaseTimingsMs: {},
                redirectCountBucket: "0",
                byteCountBucket: "0",
              });
              resolve({
                ok: true,
                response: { status: "unavailable" },
              });
            },
            { once: true },
          );
        }),
    );
    const pending = request(harness.app)
      .post("/api/source-inspections?attempt=aborted-query-sentinel")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({
        source: "https://aborted-source-sentinel.example/article",
      });
    const settled = pending.then(
      () => undefined,
      () => undefined,
    );
    await started;

    pending.abort();
    await settled;
    await vi.waitFor(() => {
      expect(
        harness.logger.records.some(
          (record) =>
            record.event === "unshelf.api.request.ended" &&
            record.termination === "aborted",
        ),
      ).toBe(true);
    });

    const serialized = JSON.stringify(harness.logger.records);
    expect(serialized).not.toContain("aborted-source-sentinel");
    expect(serialized).not.toContain("aborted-query-sentinel");
    const terminalRecord = [...harness.logger.records]
      .reverse()
      .find(
        (record) =>
          record.event === "unshelf.api.request.ended" &&
          record.termination === "aborted",
      );
    expect(terminalRecord?.request).not.toHaveProperty("body");
    expect(terminalRecord?.request).not.toHaveProperty("query");
  });
});
