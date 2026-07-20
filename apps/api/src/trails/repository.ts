import type { Pool } from "pg";
import type { CreateTrailRequest, Trail, TrailId, UserId } from "@unshelf/shared";

/**
 * Trail storage (ADR-0014). The Trail is now a first-class record — one User owns
 * many, each with an opaque stable id, a name, and derived progress. This is the
 * promotion of ADR-0010's implicit "the edge set scoped to a User *is* the Trail":
 * the topology still lives in `trail_edges`, but the journey itself now has a row.
 *
 * Every function takes the authenticated User's anchor id and scopes to it, so a
 * foreign Trail is indistinguishable from a missing one at the boundary — a read
 * of someone else's id returns null, never a confirmation that the id is real.
 */

interface TrailRow {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  done: number;
  total: number;
}

const toTrail = (row: TrailRow): Trail => ({
  id: row.id as TrailId,
  userId: row.user_id as UserId,
  name: row.name,
  createdAt: row.created_at.toISOString(),
  done: row.done,
  total: row.total,
});

/**
 * Select a User's Trails, each with derived progress, restricted by an optional
 * id. Progress is counted per *distinct* Item across the Trail's Stops, so an
 * Item pulled into two of the Trail's Stops counts once — the roll-up mirrors the
 * per-node progress the Trail canvas reads (ADR-0010) but folds the whole journey
 * into one fraction. It is computed here on every read, never stored, exactly as
 * All derives `pastTarget` (ADR-0005): an empty Trail reads as 0/0 and can never
 * drift from its Stops' actual contents. Ordered by creation so the index is
 * stable across reads. Takes an id filter so `getTrail` reuses the same shape.
 */
async function selectTrails(
  pool: Pool,
  userId: UserId,
  trailId: TrailId | null,
): Promise<Trail[]> {
  const { rows } = await pool.query<TrailRow>(
    `SELECT t.id, t.user_id, t.name, t.created_at,
            count(DISTINCT i.id) FILTER (WHERE i.status = 'done')::int AS done,
            count(DISTINCT i.id)::int AS total
     FROM trails t
     LEFT JOIN stops s ON s.trail_id = t.id AND s.user_id = t.user_id
     LEFT JOIN stop_items si ON si.stop_id = s.id AND si.user_id = t.user_id
     LEFT JOIN items i ON i.id = si.item_id AND i.user_id = t.user_id
     WHERE t.user_id = $1 AND ($2::uuid IS NULL OR t.id = $2)
     GROUP BY t.id, t.user_id, t.name, t.created_at
     ORDER BY t.created_at, t.id`,
    [userId, trailId],
  );
  return rows.map(toTrail);
}

/** Every Trail a User owns, with derived progress, oldest first — and only theirs. */
export async function listTrails(pool: Pool, userId: UserId): Promise<Trail[]> {
  return selectTrails(pool, userId, null);
}

/** One Trail with its derived progress, or null when it is not this User's. */
export async function getTrail(
  pool: Pool,
  userId: UserId,
  trailId: TrailId,
): Promise<Trail | null> {
  const [trail] = await selectTrails(pool, userId, trailId);
  return trail ?? null;
}

/**
 * Create a named Trail for a User. The name is stored exactly as given; the Trail
 * starts with no Stops, so it reads back at 0/0 progress. The id and creation
 * time are database-assigned, and the fresh Trail can hold no Items yet, so this
 * hands back the new record without a second read.
 */
export async function createTrail(
  pool: Pool,
  userId: UserId,
  input: CreateTrailRequest,
): Promise<Trail> {
  const { rows } = await pool.query<TrailRow>(
    `INSERT INTO trails (user_id, name)
     VALUES ($1, $2)
     RETURNING id, user_id, name, created_at, 0 AS done, 0 AS total`,
    [userId, input.name],
  );
  return toTrail(rows[0]!);
}
