import { describe, expect, it } from "vitest";
import pretty from "pino-pretty";
import { createProductionLogger, parseLogLevel } from "../src/logging";
import { serializeFailure } from "../src/diagnostics";
import { StringDestination } from "./string-destination";
import { parseJsonRecord } from "./assertion-boundaries";

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

    const record = parseJsonRecord(lines[0]);
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

  it("optionally renders human-friendly local output", () => {
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

    const rendered = pretty.prettyFactory({
      colorize: false,
      singleLine: true,
      translateTime: "SYS:standard",
    })(destination.output);

    expect(rendered).toContain("INFO");
    expect(rendered).toContain("Test event rendered");
    expect(rendered).toContain("unshelf.test.rendered");
    expect(() => JSON.parse(rendered)).toThrow();
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
      .map(parseJsonRecord);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "warn",
      event: "unshelf.test.at_threshold",
      msg: "At threshold",
    });
  });

  it("does not reintroduce configured credentials when rendering diagnostics", () => {
    const destination = new StringDestination();
    const logger = createProductionLogger({
      level: "info",
      destination,
    });
    const clerkSecret = "sk_live_renderer-clerk-sentinel";
    const databaseUrl =
      "postgresql://unshelf:renderer-db-password-sentinel@database:5432/unshelf";
    const failure = Object.assign(
      new Error(`Item trail-42 failed: ${clerkSecret} ${databaseUrl}`),
      {
        query: `select 'TypeScript' /* ${clerkSecret} */`,
        parameters: ["trail-42", { password: "renderer-parameter-sentinel" }],
      },
    );

    logger.error({
      event: "unshelf.api.health.failed",
      msg: "API health check failed",
      dependency: "postgres",
      ...serializeFailure(failure, {
        secrets: [clerkSecret, databaseUrl],
      }),
    });

    expect(destination.output).not.toContain("sentinel");
    expect(destination.output).toContain("trail-42");
    expect(destination.output).toContain("TypeScript");
    expect(destination.output).toContain("[REDACTED]");
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
