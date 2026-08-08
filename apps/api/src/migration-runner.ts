import { serializeFailure } from "./diagnostics";
import type { Logger } from "./logging";

export type MigrationMode = "apply" | "verify";

export interface MigrationRunnerOptions {
  readonly logger: Logger;
  readonly migrate: () => Promise<void>;
  readonly monotonicNow?: () => number;
  readonly diagnosticSecrets?: readonly string[];
  readonly mode?: MigrationMode;
}

export async function runMigration({
  logger,
  migrate,
  monotonicNow = () => performance.now(),
  diagnosticSecrets,
  mode = "apply",
}: MigrationRunnerOptions): Promise<void> {
  const startedAt = monotonicNow();
  logger.info({
    event: "unshelf.migration.started",
    msg: "Migration started",
    mode,
  });

  try {
    await migrate();
  } catch (failure) {
    const durationMs = monotonicNow() - startedAt;
    try {
      logger.fatal({
        event: "unshelf.migration.failed",
        msg: "Migration failed",
        mode,
        durationMs,
        ...serializeFailure(failure, {
          secrets: diagnosticSecrets,
        }),
      });
    } catch {
      // Preserve the migration failure even if reporting it fails.
    }
    try {
      await logger.flush();
    } catch {
      // Preserve the migration failure even if flushing it fails.
    }
    throw failure;
  }

  logger.info({
    event: "unshelf.migration.completed",
    msg: "Migration completed",
    mode,
    durationMs: monotonicNow() - startedAt,
  });
}
