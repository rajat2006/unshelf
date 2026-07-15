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

-- The Item spine (ADR-0003): one table for every Type, scoped to a User. All is
-- not a table — it is the query "every item where user_id = me", so this is the
-- only table capture and All need. \`type\` and \`status\` are text with CHECK
-- constraints mirroring the shared ITEM_TYPES / ITEM_STATUSES enums (enum values
-- are cheap to revise, ADR-0003); \`source\`, \`target_date\`, \`completed_at\` are
-- nullable fields later tracking tickets write over.
CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  title text NOT NULL,
  source text,
  type text NOT NULL
    CHECK (type IN ('article', 'video', 'playlist', 'course', 'book', 'other')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'done')),
  target_date date,
  completed_at timestamptz
);

ALTER TABLE items DROP COLUMN IF EXISTS created_at;

-- All lists a User's Items; every read is scoped by user_id, so index it.
CREATE INDEX IF NOT EXISTS items_user_id_idx ON items (user_id);
`;

/** Apply the schema to a database. Idempotent. */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
