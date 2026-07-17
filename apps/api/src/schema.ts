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

-- Composite owner keys let membership reference an Item together with its User.
-- id remains the model identity; this index exists only for tenant-consistency
-- foreign keys on cross-domain joins.
CREATE UNIQUE INDEX IF NOT EXISTS items_id_user_id_idx ON items (id, user_id);

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

-- As for Items, expose the owner beside the id so StopItem can prove both ends
-- belong to the User recorded on the membership.
CREATE UNIQUE INDEX IF NOT EXISTS stops_id_user_id_idx ON stops (id, user_id);

-- StopItem: membership plus its mandatory tenancy anchor, and nothing else
-- (ADR-0001, ADR-0004, ADR-0009). The composite primary key makes the two ends
-- the membership identity and a Stop's contents a set, so the same Item cannot
-- be held twice however it is added. There is no \`position\` (a Stop is
-- unordered; sequencing lives on the Trail) and no \`status\` (one Status lives
-- on the Item, shared by every Stop holding it) — either column would be a second
-- place to keep the same domain fact true.
--
-- user_id is deliberately repeated as a security constraint: the paired foreign
-- keys below make disagreement impossible at the database boundary, even for a
-- write that bypasses the repository. Every domain table therefore points at our
-- User anchor, as ADR-0009 requires.
CREATE TABLE IF NOT EXISTS stop_items (
  user_id uuid,
  stop_id uuid NOT NULL REFERENCES stops (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  PRIMARY KEY (stop_id, item_id)
);

-- Upgrade databases that booted an earlier version of this branch. Backfill from
-- the Stop owner, then make the anchor mandatory before adding the constraints.
ALTER TABLE stop_items ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE stop_items AS membership
SET user_id = stops.user_id
FROM stops
WHERE membership.stop_id = stops.id AND membership.user_id IS NULL;

ALTER TABLE stop_items ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stop_items_user_id_fkey'
      AND conrelid = 'stop_items'::regclass
  ) THEN
    ALTER TABLE stop_items
      ADD CONSTRAINT stop_items_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stop_items_stop_owner_fk'
      AND conrelid = 'stop_items'::regclass
  ) THEN
    ALTER TABLE stop_items
      ADD CONSTRAINT stop_items_stop_owner_fk
      FOREIGN KEY (stop_id, user_id) REFERENCES stops (id, user_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stop_items_item_owner_fk'
      AND conrelid = 'stop_items'::regclass
  ) THEN
    ALTER TABLE stop_items
      ADD CONSTRAINT stop_items_item_owner_fk
      FOREIGN KEY (item_id, user_id) REFERENCES items (id, user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- The primary key already indexes stop_id (a Stop's contents); this covers the
-- other direction — every Stop holding a given Item.
CREATE INDEX IF NOT EXISTS stop_items_item_id_idx ON stop_items (item_id);

-- trail_edges: the Trail's adjacency edge list (ADR-0010). One row per directed
-- Stop-to-Stop edge, scoped to a User. The Trail is not a table — like All it is
-- a derived view: its nodes are the User's Stops, its edges are these rows. "One
-- Trail per User" needs no \`trails\` row; the edge set scoped to a User *is* the
-- Trail. There is deliberately no \`position\` and no \`x\`/\`y\`: parallel forks are
-- unordered and canvas layout is derived from topology on read (like the derived
-- \`past_target\`), so the Trail stays a lightweight topology and there is no
-- second place for the plan to drift.
--
-- The shape mirrors stop_items exactly: a mandatory tenancy anchor plus composite
-- owner foreign keys \`(from_stop_id, user_id)\` and \`(to_stop_id, user_id)\` into
-- \`stops (id, user_id)\`, so an edge can only ever join two of the *same* User's
-- Stops — there is no pairing of Stops belonging to different Users this table can
-- hold. Both cascade, so deleting a Stop takes every edge touching it with it.
-- The primary key makes the edge set a set (no duplicate edge), and the CHECK
-- forbids a self-loop at the database. Acyclicity is the one invariant the schema
-- cannot cheaply declare, so the repository owns it at the API write seam.
CREATE TABLE IF NOT EXISTS trail_edges (
  user_id uuid NOT NULL REFERENCES users (id),
  from_stop_id uuid NOT NULL,
  to_stop_id uuid NOT NULL,
  PRIMARY KEY (user_id, from_stop_id, to_stop_id),
  CHECK (from_stop_id <> to_stop_id),
  FOREIGN KEY (from_stop_id, user_id)
    REFERENCES stops (id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (to_stop_id, user_id)
    REFERENCES stops (id, user_id) ON DELETE CASCADE
);

-- The primary key indexes out-edges (a Stop's successors, keyed from the front);
-- this covers the other direction — every edge leading into a given Stop, which
-- the layout's longest-path layering walks.
CREATE INDEX IF NOT EXISTS trail_edges_to_stop_id_idx
  ON trail_edges (user_id, to_stop_id);
`;

/** Apply the schema to a database. Idempotent. */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
