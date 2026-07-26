import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type DatabaseWithClient = Database & { $client: Pool };

/** Create the schema-aware Drizzle handle used throughout the API. */
export function createDatabase(connectionString: string): DatabaseWithClient {
  return drizzle(new Pool({ connectionString }), { schema });
}
