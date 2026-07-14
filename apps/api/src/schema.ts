import type { Pool } from "pg";

/**
 * The v1 walking-skeleton schema: a single seeded row the health endpoint reads
 * back to prove the api → Postgres round-trip. Real domain tables land in later
 * tickets; this is deliberately idempotent so it is safe to run on every boot.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS health_check (
  id integer PRIMARY KEY,
  message text NOT NULL
);

INSERT INTO health_check (id, message)
VALUES (1, 'unshelf api is alive')
ON CONFLICT (id) DO NOTHING;
`;

/** Apply the schema to a database. Idempotent. */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
