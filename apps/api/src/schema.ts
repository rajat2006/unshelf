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

-- Labels are the User-owned, flat categorisation axis over the Library
-- (ADR-0014). Names are free text and need not be unique: identity lives in the
-- opaque id, while user_id keeps every Label inside one private space.
CREATE TABLE IF NOT EXISTS labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  name text NOT NULL
);

CREATE INDEX IF NOT EXISTS labels_user_id_idx ON labels (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS labels_id_user_id_idx ON labels (id, user_id);

-- Label membership is a bare many-to-many set independent of Stop placement.
-- The repeated User anchor plus paired owner foreign keys make it impossible to
-- categorise one User's Item with another User's Label at the database boundary.
CREATE TABLE IF NOT EXISTS item_labels (
  user_id uuid NOT NULL REFERENCES users (id),
  item_id uuid NOT NULL,
  label_id uuid NOT NULL,
  PRIMARY KEY (item_id, label_id),
  CONSTRAINT item_labels_item_owner_fk FOREIGN KEY (item_id, user_id)
    REFERENCES items (id, user_id) ON DELETE CASCADE,
  CONSTRAINT item_labels_label_owner_fk FOREIGN KEY (label_id, user_id)
    REFERENCES labels (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS item_labels_label_id_idx ON item_labels (label_id);

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

-- trails: the Trail promoted to a first-class, User-owned record (ADR-0014). Until
-- this ticket the Trail was not a table — it was the edge set scoped to a User
-- (ADR-0010). The redesign gives one User *many* Trails, so the journey needs an
-- identity of its own: an opaque \`id\` that a URL carries and that survives a
-- rename, a \`name\`, and \`created_at\` (the stable order the index lists in). There
-- is deliberately no progress column — a Trail's progress is *derived* on read
-- from its Stops' Items (like the derived \`past_target\`, ADR-0005), never stored.
CREATE TABLE IF NOT EXISTS trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trails_user_id_idx ON trails (user_id);

-- Expose the owner beside the id, as items and stops do, so a later membership
-- (a Stop belonging to a Trail) can prove both ends belong to the same User.
CREATE UNIQUE INDEX IF NOT EXISTS trails_id_user_id_idx ON trails (id, user_id);

-- A Stop belongs to exactly one Trail (ADR-0014, Stop-as-waypoint). The column is
-- added nullable here so existing Stops can be adopted by the migration below
-- before the constraint that makes it mandatory lands with the Stop-scoping slice
-- (#94). The composite owner foreign key keeps a Stop and its Trail owned by the
-- same User — an edge this table can never cross even when \`trail_id\` is set by a
-- write that bypasses the repository.
ALTER TABLE stops ADD COLUMN IF NOT EXISTS trail_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stops_trail_owner_fk'
      AND conrelid = 'stops'::regclass
  ) THEN
    ALTER TABLE stops
      ADD CONSTRAINT stops_trail_owner_fk
      FOREIGN KEY (trail_id, user_id) REFERENCES trails (id, user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stops_trail_id_idx ON stops (trail_id);

-- Migrate each existing User's implicit Trail into one explicit Trail (ADR-0014).
-- Before this ticket a User's Stops and edges *were* their one Trail with no row
-- of its own; promotion mints exactly that row and adopts the orphaned Stops into
-- it, losing nothing — the Stops, their edges, and their Item memberships are all
-- untouched, only newly owned by a named Trail.
--
-- Both steps are idempotent, so this is safe on every boot. A Trail is minted only
-- for a User who has a Stop not yet on any Trail *and* has no Trail yet, so a
-- second run mints nothing; the backfill only touches Stops whose \`trail_id\` is
-- still null. New Users have no orphaned Stops, so they start with an empty index.
INSERT INTO trails (user_id, name)
SELECT DISTINCT s.user_id, 'My Trail'
FROM stops s
WHERE s.trail_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM trails t WHERE t.user_id = s.user_id);

UPDATE stops s
SET trail_id = (
  SELECT t.id FROM trails t
  WHERE t.user_id = s.user_id
  ORDER BY t.created_at, t.id
  LIMIT 1
)
WHERE s.trail_id IS NULL
  AND EXISTS (SELECT 1 FROM trails t WHERE t.user_id = s.user_id);

-- Scope a Stop's edges to its Trail (#94, ADR-0014). Until now \`trail_edges\`
-- carried only the User anchor (ADR-0010): the edge set scoped to a User *was*
-- the Trail. The redesign gives a User many Trails, so an edge must also name the
-- one Trail it belongs to, and *both* of its endpoints must be Stops on that Trail
-- — a link can never span two Trails.
--
-- \`trail_id\` is enforced with composite owner foreign keys \`(from_stop_id,
-- trail_id)\` and \`(to_stop_id, trail_id)\` into \`stops (id, trail_id)\`, the same
-- belt-and-braces shape the same-User keys already use: an edge can only ever join
-- two Stops that share its Trail, so there is no pairing of Stops on different
-- Trails this table can hold, even for a write that bypasses the repository. The
-- pre-existing \`(from_stop_id, user_id)\` / \`(to_stop_id, user_id)\` keys stay, so
-- same-User is still enforced directly too. Both new keys cascade, so an edge dies
-- with either endpoint exactly as before.
--
-- Like \`stops.trail_id\`, the column is added nullable and backfilled from each
-- edge's \`from\` Stop (which the migration above has just adopted into a Trail), so
-- a database that booted a pre-#94 branch keeps every edge, now scoped to the same
-- Trail its Stops belong to. It stays nullable rather than \`NOT NULL\` only so the
-- implicit-Trail migration can still simulate and adopt a legacy edge that predates
-- the column; every edge the repository writes names its Trail.
CREATE UNIQUE INDEX IF NOT EXISTS stops_id_trail_id_idx ON stops (id, trail_id);

ALTER TABLE trail_edges ADD COLUMN IF NOT EXISTS trail_id uuid;

UPDATE trail_edges e
SET trail_id = s.trail_id
FROM stops s
WHERE e.from_stop_id = s.id
  AND e.user_id = s.user_id
  AND e.trail_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trail_edges_from_trail_fk'
      AND conrelid = 'trail_edges'::regclass
  ) THEN
    ALTER TABLE trail_edges
      ADD CONSTRAINT trail_edges_from_trail_fk
      FOREIGN KEY (from_stop_id, trail_id) REFERENCES stops (id, trail_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trail_edges_to_trail_fk'
      AND conrelid = 'trail_edges'::regclass
  ) THEN
    ALTER TABLE trail_edges
      ADD CONSTRAINT trail_edges_to_trail_fk
      FOREIGN KEY (to_stop_id, trail_id) REFERENCES stops (id, trail_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Reading and rewiring a Trail always scopes by \`(user_id, trail_id)\`, so index
-- the Trail an edge belongs to.
CREATE INDEX IF NOT EXISTS trail_edges_trail_id_idx
  ON trail_edges (user_id, trail_id);
`;

/** Apply the schema to a database. Idempotent. */
export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
