import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseWithClient = Database & { $client: Pool };

/** Create the schema-aware Drizzle handle in Unshelf's configured calendar. */
export function createDatabase({
  connectionString,
  timeZone,
}: {
  connectionString: string;
  timeZone: string;
}): DatabaseWithClient {
  if (!/^[A-Za-z0-9._+/-]+$/.test(timeZone)) {
    throw new Error("DATABASE_TIME_ZONE must be a PostgreSQL timezone name");
  }

  return drizzle(
    new Pool({ connectionString, options: `-c timezone=${timeZone}` }),
    { schema },
  );
}
