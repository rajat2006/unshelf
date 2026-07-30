import { describe, expect, it, vi } from "vitest";
import { createCollectingLogger } from "../src/logging/collecting-logger";
import { runMigration } from "../src/migration-runner";

describe("migration runner", () => {
  it("reports a successful migration lifecycle with elapsed duration", async () => {
    const logger = createCollectingLogger();
    const migrate = vi.fn().mockResolvedValue(undefined);

    await runMigration({
      logger,
      migrate,
      monotonicNow: elapsedClock(24.5),
    });

    expect(migrate).toHaveBeenCalledOnce();
    expect(logger.records).toEqual([
      {
        level: "info",
        event: "unshelf.migration.started",
        msg: "Migration started",
      },
      {
        level: "info",
        event: "unshelf.migration.completed",
        msg: "Migration completed",
        durationMs: 24.5,
      },
    ]);
  });

  it("reports and flushes a credential-safe failure before rethrowing it", async () => {
    const databaseUrl =
      "postgresql://unshelf:database-password-sentinel@db:5432/unshelf";
    const configuredSecret = "configured-secret-sentinel";
    const cause = new Error(
      `connection rejected for ${databaseUrl}`,
    );
    const failure = Object.assign(
      new Error(`migration failed for ${configuredSecret}`, {
        cause,
      }),
      {
        query: `ALTER TABLE items /* ${configuredSecret} */`,
        parameters: ["safe item title", databaseUrl],
        severity: "ERROR",
        detail: "constraint violation for safe-item-id",
        schema: "public",
        table: "items",
        constraint: "items_pkey",
      },
    );
    const logger = createCollectingLogger();
    let recordsAtFlush: typeof logger.records = [];
    logger.flush = vi.fn(async () => {
      recordsAtFlush = [...logger.records];
    });

    await expect(
      runMigration({
        logger,
        migrate: async () => {
          throw failure;
        },
        monotonicNow: elapsedClock(13),
        diagnosticSecrets: [databaseUrl, configuredSecret],
      }),
    ).rejects.toBe(failure);

    expect(recordsAtFlush).toEqual(logger.records);
    expect(logger.flush).toHaveBeenCalledOnce();
    expect(logger.records).toHaveLength(2);
    expect(logger.records[0]).toEqual({
      level: "info",
      event: "unshelf.migration.started",
      msg: "Migration started",
    });
    expect(logger.records[1]).toMatchObject({
      level: "fatal",
      event: "unshelf.migration.failed",
      msg: "Migration failed",
      durationMs: 13,
      error: {
        type: "Error",
        message: "migration failed for [REDACTED]",
        cause: {
          type: "Error",
          message: "connection rejected for [REDACTED]",
        },
      },
      database: {
        query: "ALTER TABLE items /* [REDACTED] */",
        parameters: ["safe item title", "[REDACTED]"],
        severity: "ERROR",
        detail: "constraint violation for safe-item-id",
        schema: "public",
        table: "items",
        constraint: "items_pkey",
      },
    });
    expect(JSON.stringify(logger.records)).not.toContain("sentinel");
  });
});

function elapsedClock(durationMs: number): () => number {
  const times = [0, durationMs];
  return () => times.shift() ?? durationMs;
}
