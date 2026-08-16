import { describe, expect, it, vi } from "vitest";
import { createCollectingLogger } from "../src/logging/testing";
import {
  parseDiscoverMaintenanceCommand,
  runDiscoverMaintenance,
} from "../src/discover-maintenance-runner";

describe("Discover maintenance runner", () => {
  it("runs an explicit bounded expire-due dry run through the Discover facade", async () => {
    const purgeProviderData = vi.fn().mockResolvedValue({
      kind: "expire_due",
      provider: "youtube",
      dryRun: true,
      clearedRows: 0,
      skippedGenerationRows: 0,
      failedOperations: 0,
      dueRows: 4,
      deadlineRiskRows: 1,
      truncated: false,
    });
    const logger = createCollectingLogger();
    const flush = vi.fn(async () => undefined);
    logger.flush = flush;
    const command = parseDiscoverMaintenanceCommand([
      "expire-due",
      "--dry-run",
      "--batch-size",
      "25",
    ]);

    await expect(
      runDiscoverMaintenance({
        command,
        discover: { purgeProviderData },
        logger,
        monotonicNow: elapsedClock(12),
      }),
    ).resolves.toMatchObject({ dryRun: true, dueRows: 4 });

    expect(purgeProviderData).toHaveBeenCalledWith({
      kind: "expire_due",
      dryRun: true,
      batchSize: 25,
    });
    expect(logger.records).toEqual([
      expect.objectContaining({
        event: "unshelf.discover.maintenance.started",
        kind: "expire_due",
        dryRun: true,
        batchSize: 25,
      }),
      expect.objectContaining({
        event: "unshelf.discover.maintenance.completed",
        kind: "expire_due",
        dryRun: true,
        dueRows: 4,
        deadlineRiskRows: 1,
        durationMs: 12,
      }),
    ]);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("requires explicit execution and suspension/termination confirmation for complete purge", () => {
    expect(() =>
      parseDiscoverMaintenanceCommand(["complete-youtube-purge", "--execute"]),
    ).toThrow(
      "complete YouTube purge requires --execute and --confirm-suspension-termination",
    );

    expect(
      parseDiscoverMaintenanceCommand([
        "complete-youtube-purge",
        "--execute",
        "--confirm-suspension-termination",
        "--batch-size",
        "10",
      ]),
    ).toEqual({
      kind: "complete",
      provider: "youtube",
      batchSize: 10,
    });
  });

  it("flushes an honest failed-work report and fails the command", async () => {
    const logger = createCollectingLogger();
    const flush = vi.fn(async () => undefined);
    logger.flush = flush;
    const purgeProviderData = vi.fn().mockResolvedValue({
      kind: "expire_due",
      provider: "youtube",
      dryRun: false,
      clearedRows: 9,
      skippedGenerationRows: 2,
      failedOperations: 1,
      dueRows: 12,
      deadlineRiskRows: 3,
      truncated: false,
    });

    await expect(
      runDiscoverMaintenance({
        command: {
          kind: "expire_due",
          dryRun: false,
          batchSize: 100,
        },
        discover: { purgeProviderData },
        logger,
      }),
    ).rejects.toThrow("Discover maintenance completed with failed work");

    expect(logger.records.at(-1)).toMatchObject({
      level: "error",
      event: "unshelf.discover.maintenance.failed",
      clearedRows: 9,
      skippedGenerationRows: 2,
      failedOperations: 1,
      dueRows: 12,
      deadlineRiskRows: 3,
    });
    expect(flush).toHaveBeenCalledOnce();
  });

  it("redacts registered secrets from unexpected maintenance failures", async () => {
    const databaseUrl =
      "postgresql://unshelf:maintenance-password@database:5432/unshelf";
    const youtubeKey = "youtube-maintenance-secret";
    const logger = createCollectingLogger();

    await expect(
      runDiscoverMaintenance({
        command: {
          kind: "expire_due",
          dryRun: true,
          batchSize: 100,
        },
        discover: {
          purgeProviderData: async () => {
            throw new Error(`failed ${databaseUrl} ${youtubeKey}`);
          },
        },
        logger,
        diagnosticSecrets: [databaseUrl, youtubeKey],
      }),
    ).rejects.toThrow("Discover maintenance failed");

    expect(logger.records.at(-1)).toMatchObject({
      level: "fatal",
      event: "unshelf.discover.maintenance.failed",
      error: { message: "failed [REDACTED] [REDACTED]" },
    });
    expect(JSON.stringify(logger.records)).not.toContain("maintenance-secret");
    expect(JSON.stringify(logger.records)).not.toContain(
      "maintenance-password",
    );
  });
});

function elapsedClock(durationMs: number): () => number {
  const times = [0, durationMs];
  return () => times.shift() ?? durationMs;
}
