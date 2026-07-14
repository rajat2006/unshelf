import type { Pool } from "pg";

/**
 * The v1 schema. Idempotent so it is safe to run on every boot; later tickets
 * append their domain tables here.
 *
 * `users` is the tenancy anchor (ADR-0001, ADR-0009): `id` is *our* user id,
 * which every domain table's foreign key will point at, and `clerk_user_id`
 * holds Clerk's id purely as an external reference — domain data never
 * foreign-keys to Clerk's id.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS health_check (
  id integer PRIMARY KEY,
  message text NOT NULL
);

INSERT INTO health_check (id, message)
VALUES (1, 'unshelf api is alive')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/** Apply the schema to a database. Idempotent. */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
