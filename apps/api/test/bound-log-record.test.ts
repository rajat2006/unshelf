import { describe, expect, it } from "vitest";
import {
  boundLogRecord,
  MAX_SERIALIZED_EVENT_BYTES,
} from "../src/logging/internal/bound-log-record";
import type { LogBindings, LogEvent, LogLevel } from "../src/logging";

describe("bounded log record", () => {
  it("preserves the envelope and error identity while truncating diagnostics", () => {
    const stack = `Error: query failed\n${"s".repeat(40_000)}`;
    const record = boundLogRecord(
      "error",
      { requestId: "bounded-request", route: "/api/health" },
      {
        event: "unshelf.api.health.failed",
        msg: "API health check failed",
        dependency: "postgres",
        error: {
          type: "DatabaseError",
          code: "XX000",
          message: "query failed",
          stack,
        },
        database: {
          query: "select * from health_check",
          parameters: ["p".repeat(40_000)],
        },
      },
    );

    expect(serializedBytes("error", record)).toBeLessThanOrEqual(
      MAX_SERIALIZED_EVENT_BYTES,
    );
    expect(record).toMatchObject({
      event: "unshelf.api.health.failed",
      msg: "API health check failed",
      requestId: "bounded-request",
      route: "/api/health",
      diagnosticTruncated: true,
      error: {
        type: "DatabaseError",
        code: "XX000",
        message: "query failed",
        stack,
      },
      database: {
        query: "select * from health_check",
        parameters: "[TRUNCATED]",
      },
    });
  });

  it("keeps correlation and error identity when priority fields exceed the budget", () => {
    const record = boundLogRecord(
      "error",
      { requestId: "priority-request" },
      {
        event: "unshelf.api.health.failed",
        msg: "API health check failed",
        dependency: "postgres",
        error: {
          type: `DatabaseError-${"t".repeat(70_000)}`,
          code: "XX000",
          message: "query failed",
        },
      },
    );

    expect(serializedBytes("error", record)).toBeLessThanOrEqual(
      MAX_SERIALIZED_EVENT_BYTES,
    );
    expect(record).toMatchObject({
      event: "unshelf.api.health.failed",
      msg: "API health check failed",
      requestId: "priority-request",
      dependency: "postgres",
      diagnosticTruncated: true,
      error: {
        type: expect.stringMatching(/^DatabaseError-.*\[TRUNCATED\]$/),
        code: "XX000",
        message: "query failed",
      },
    });
  });

  it("does not truncate error identity for a different oversized priority field", () => {
    const record = boundLogRecord(
      "error",
      { requestId: "priority-request" },
      {
        event: "unshelf.api.health.failed",
        msg: "API health check failed",
        dependency: `postgresql-${"d".repeat(70_000)}`,
        error: {
          type: "DatabaseError",
          code: "XX000",
          message: "query failed",
        },
      },
    );

    expect(record).toMatchObject({
      requestId: "priority-request",
      dependency: expect.stringMatching(/^postgresql-.*\[TRUNCATED\]$/),
      error: {
        type: "DatabaseError",
        code: "XX000",
        message: "query failed",
      },
    });
  });

  it("keeps complete error identity after dropping enough lower-priority data", () => {
    const message = `query failed: ${"context".repeat(140)}`;
    const record = boundLogRecord(
      "error",
      {},
      {
        event: "unshelf.api.health.failed",
        msg: "API health check failed",
        dependency: "postgres",
        error: {
          type: "DatabaseError",
          code: "XX000",
          message,
        },
        database: {
          detail: Array.from({ length: 12_000 }, () => "row detail"),
        },
      },
    );

    expect(record).toMatchObject({
      diagnosticTruncated: true,
      error: {
        type: "DatabaseError",
        code: "XX000",
        message,
      },
    });
  });

  it("bounds object-valued priority fields", () => {
    const oversizedCode = Object.fromEntries(
      Array.from({ length: 12_000 }, (_, index) => [
        `field-${index}`,
        `value-${index}`,
      ]),
    );
    const record = boundLogRecord(
      "error",
      {},
      {
        event: "unshelf.api.health.failed",
        msg: "API health check failed",
        error: {
          type: "DatabaseError",
          code: oversizedCode,
          message: "query failed",
        },
      },
    );

    expect(serializedBytes("error", record)).toBeLessThanOrEqual(
      MAX_SERIALIZED_EVENT_BYTES,
    );
    expect(record).toMatchObject({
      diagnosticTruncated: true,
      error: {
        type: "DatabaseError",
        code: "[TRUNCATED]",
        message: "query failed",
      },
    });
  });
});

function serializedBytes(
  level: LogLevel,
  record: LogEvent & LogBindings,
): number {
  return (
    Buffer.byteLength(
      JSON.stringify({
        time: "2026-07-27T00:00:00.000Z",
        level,
        ...record,
      }),
      "utf8",
    ) + 1
  );
}
