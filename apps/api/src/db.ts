import { Pool } from "pg";

/** Create a Postgres connection pool from a connection string. */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
