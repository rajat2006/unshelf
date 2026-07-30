import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./db";
import { createProductionLogger, parseLogLevel } from "./logging/pino-logger";
import { runMigration } from "./migration-runner";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const logger = createProductionLogger({
  level: parseLogLevel(process.env.LOG_LEVEL),
});
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const db = createDatabase(connectionString);

try {
  await runMigration({
    logger,
    diagnosticSecrets: [connectionString],
    migrate: () => migrate(db, { migrationsFolder }),
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
