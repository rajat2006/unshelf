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
-- are cheap to revise, ADR-0003). \`source\`, \`target_date\` and \`completed_at\`
-- are all nullable: a link, a soft "by when", and a banked completion are each
-- optional facts about an Item, not preconditions for capturing one.
--
-- There is deliberately no \`past_target\` column beside \`target_date\`: that state
-- is a question about *today*, so it is derived on every read instead (ADR-0005,
-- see ITEM_PROJECTION). A column would need a job to stay true at midnight.
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

-- Stops: the single organising primitive (ADR-0004), scoped to a User like every
-- other domain table. There is deliberately no \`kind\` column — one uniform Stop
-- serves both a topic to learn and a project to build, because v1 makes the two
-- behave identically. Names are not unique: two Stops may share one, since a Stop
-- is identified by its id and the User is free to name their space as they like.
CREATE TABLE IF NOT EXISTS stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  name text NOT NULL
);

CREATE INDEX IF NOT EXISTS stops_user_id_idx ON stops (user_id);

-- StopItem: membership, and nothing else (ADR-0004). The composite primary key IS
-- the model — it makes the two ends the whole record, and makes a Stop's contents
-- a set at the database, so the same Item cannot be held twice however it is
-- added. There is no \`position\` (a Stop is unordered; sequencing lives on the
-- Trail) and no \`status\` (one Status lives on the Item, shared by every Stop
-- holding it) — either column would be a second place to keep the same fact true.
--
-- No user_id either: membership inherits its tenancy from both ends, which are
-- always checked to be the same User's before a row is written. Storing it a
-- third time would let the three disagree.
CREATE TABLE IF NOT EXISTS stop_items (
  stop_id uuid NOT NULL REFERENCES stops (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  PRIMARY KEY (stop_id, item_id)
);

-- The primary key already indexes stop_id (a Stop's contents); this covers the
-- other direction — every Stop holding a given Item.
CREATE INDEX IF NOT EXISTS stop_items_item_id_idx ON stop_items (item_id);
`;

/** Apply the schema to a database. Idempotent. */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
