import { createDatabase, type DatabaseWithClient } from "./db";
import { serializeFailure } from "./diagnostics";
import {
  parseDiscoverMaintenanceCommand,
  ReportedDiscoverMaintenanceFailure,
  runDiscoverMaintenance,
} from "./discover-maintenance-runner";
import { createDiscoverMaintenanceModule } from "./discover/module";
import { createProductionLogger, parseLogLevel } from "./logging";

const diagnosticSecrets = [
  process.env.DATABASE_URL,
  process.env.YOUTUBE_API_KEY,
].filter((value): value is string => value !== undefined);
const logger = createProductionLogger({
  level: parseLogLevel(process.env.LOG_LEVEL),
});
let db: DatabaseWithClient | undefined;

try {
  const command = parseDiscoverMaintenanceCommand(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  db = createDatabase(connectionString);
  const discover = createDiscoverMaintenanceModule({
    db,
    now: () => new Date(),
    logger,
  });
  await runDiscoverMaintenance({
    command,
    discover,
    logger,
    diagnosticSecrets,
  });
} catch (failure) {
  if (!(failure instanceof ReportedDiscoverMaintenanceFailure)) {
    logger.fatal({
      event: "unshelf.discover.maintenance.process_failed",
      msg: "Discover maintenance process failed",
      ...serializeFailure(failure, { secrets: diagnosticSecrets }),
    });
    try {
      await logger.flush();
    } catch {
      // The non-zero process outcome still preserves the bootstrap failure.
    }
  }
  process.exitCode = 1;
} finally {
  if (db !== undefined) {
    try {
      await db.$client.end();
    } catch (failure) {
      logger.error({
        event: "unshelf.discover.maintenance.database_close_failed",
        msg: "Discover maintenance database close failed",
        ...serializeFailure(failure, { secrets: diagnosticSecrets }),
      });
      process.exitCode = 1;
    }
  }
}
