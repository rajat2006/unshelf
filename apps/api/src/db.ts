import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type DatabaseWithClient = Database & { $client: Pool };

export interface DatabaseConfig {
  connectionString: string;
  timeZone: string;
}

/** Read the one database connection and calendar configuration contract. */
export function readDatabaseConfig(environment: {
  DATABASE_URL?: string;
  DATABASE_TIME_ZONE?: string;
}): DatabaseConfig {
  const connectionString = environment.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const timeZone = environment.DATABASE_TIME_ZONE;
  if (!timeZone) throw new Error("DATABASE_TIME_ZONE is required");
  return { connectionString, timeZone };
}

/** Create the schema-aware Drizzle handle in Unshelf's configured calendar. */
export function createDatabase({
  connectionString,
  timeZone,
}: DatabaseConfig): DatabaseWithClient {
  if (!/^[A-Za-z0-9._+/-]+$/.test(timeZone)) {
    throw new Error("DATABASE_TIME_ZONE must be a PostgreSQL timezone name");
  }

  return drizzle(
    new Pool({ connectionString, options: `-c timezone=${timeZone}` }),
    { schema },
  );
}
