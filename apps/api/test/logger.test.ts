import { describe, expect, it } from "vitest";
import {
  createCollectingLogger,
  createProductionLogger,
  parseLogLevel,
} from "../src/logger";
import { StringDestination } from "./string-destination";

describe("production logger", () => {
  it("renders one structured JSON event per line", () => {
    const destination = new StringDestination();
    const logger = createProductionLogger({
      level: "info",
      destination,
    });

    logger.info({
      event: "unshelf.test.rendered",
      msg: "Test event rendered",
      usefulValue: 42,
    });

    const lines = destination.output.trimEnd().split("\n");
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: "info",
      event: "unshelf.test.rendered",
      msg: "Test event rendered",
      usefulValue: 42,
    });
    expect(typeof record.time).toBe("string");
    expect(new Date(record.time as string).toISOString()).toBe(record.time);
    expect(record).not.toHaveProperty("pid");
    expect(record).not.toHaveProperty("hostname");
  });

  it("omits events below the configured threshold", () => {
    const destination = new StringDestination();
    const logger = createProductionLogger({
      level: "warn",
      destination,
    });

    logger.info({
      event: "unshelf.test.below_threshold",
      msg: "Below threshold",
    });
    logger.warn({
      event: "unshelf.test.at_threshold",
      msg: "At threshold",
    });

    const records = destination.output
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "warn",
      event: "unshelf.test.at_threshold",
      msg: "At threshold",
    });
  });
});

describe("collecting logger", () => {
  it("collects child-bound events synchronously", () => {
    const logger = createCollectingLogger();
    const requestLogger = logger.child({ requestId: "request-123" });

    requestLogger.warn({
      event: "unshelf.test.collected",
      msg: "Test event collected",
      reason: "test",
    });

    expect(logger.records).toEqual([
      {
        level: "warn",
        requestId: "request-123",
        event: "unshelf.test.collected",
        msg: "Test event collected",
        reason: "test",
      },
    ]);
  });
});

describe("log-level configuration", () => {
  it("defaults to info", () => {
    expect(parseLogLevel(undefined)).toBe("info");
  });

  it.each(["debug", "info", "warn", "error", "fatal"] as const)(
    "accepts %s",
    (level) => {
      expect(parseLogLevel(level)).toBe(level);
    },
  );

  it("rejects unsupported values", () => {
    expect(() => parseLogLevel("verbose")).toThrowError(
      "Invalid LOG_LEVEL: verbose",
    );
  });
});
