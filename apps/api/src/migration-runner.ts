import { serializeFailure } from "./diagnostics";
import type { Logger } from "./logging/logger";

export interface MigrationRunnerOptions {
  readonly logger: Logger;
  readonly migrate: () => Promise<void>;
  readonly monotonicNow?: () => number;
  readonly diagnosticSecrets?: readonly string[];
}

export async function runMigration({
  logger,
  migrate,
  monotonicNow = () => performance.now(),
  diagnosticSecrets,
}: MigrationRunnerOptions): Promise<void> {
  const startedAt = monotonicNow();
  logger.info({
    event: "unshelf.migration.started",
    msg: "Migration started",
  });

  try {
    await migrate();
  } catch (failure) {
    const durationMs = monotonicNow() - startedAt;
    try {
      logger.fatal({
        event: "unshelf.migration.failed",
        msg: "Migration failed",
        durationMs,
        ...serializeFailure(failure, {
          secrets: diagnosticSecrets,
        }),
      });
    } finally {
      try {
        await logger.flush();
      } finally {
        throw failure;
      }
    }
  }

  logger.info({
    event: "unshelf.migration.completed",
    msg: "Migration completed",
    durationMs: monotonicNow() - startedAt,
  });
}
