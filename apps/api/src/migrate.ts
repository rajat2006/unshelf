import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase, readDatabaseConfig } from "./db";
import { createProductionLogger, parseLogLevel } from "./logging";
import { runMigration, type MigrationMode } from "./migration-runner";
import { verifyMigrationHistory } from "./migration-verifier";

const databaseConfig = readDatabaseConfig(process.env);

const mode = parseMigrationMode(process.env.MIGRATION_MODE);

const logger = createProductionLogger({
  level: parseLogLevel(process.env.LOG_LEVEL),
});
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const db = createDatabase(databaseConfig);

try {
  await runMigration({
    logger,
    diagnosticSecrets: [databaseConfig.connectionString],
    mode,
    migrate: () =>
      mode === "apply"
        ? migrate(db, { migrationsFolder })
        : verifyMigrationHistory({ database: db, migrationsFolder }),
  });
} catch (migrationFailure) {
  try {
    await db.$client.end();
  } catch {
    // The migration failure is the actionable cause and must remain the
    // process outcome even if closing the failed connection also rejects.
  }
  throw migrationFailure;
}

await db.$client.end();

function parseMigrationMode(value: string | undefined): MigrationMode {
  if (value === "apply" || value === "verify") {
    return value;
  }
  throw new Error("MIGRATION_MODE must be apply or verify");
}
