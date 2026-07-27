import { and, asc, countDistinct, eq, sql } from "drizzle-orm";
import type {
  CreateTrailRequest,
  Trail,
  TrailId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { items, stopItems, stops, trails } from "../schema";

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
  db: Database,
  userId: UserId,
  trailId: TrailId | null,
): Promise<Trail[]> {
  const rows = await db
    .select({
      id: trails.id,
      user_id: trails.userId,
      name: trails.name,
      created_at: trails.createdAt,
      done: sql<number>`count(distinct ${items.id}) filter (where ${items.status} = 'done')::int`.mapWith(
        Number,
      ),
      total: countDistinct(items.id).mapWith(Number),
    })
    .from(trails)
    .leftJoin(
      stops,
      and(eq(stops.trailId, trails.id), eq(stops.userId, trails.userId)),
    )
    .leftJoin(
      stopItems,
      and(eq(stopItems.stopId, stops.id), eq(stopItems.userId, trails.userId)),
    )
    .leftJoin(
      items,
      and(eq(items.id, stopItems.itemId), eq(items.userId, trails.userId)),
    )
    .where(
      trailId
        ? and(eq(trails.userId, userId), eq(trails.id, trailId))
        : eq(trails.userId, userId),
    )
    .groupBy(trails.id, trails.userId, trails.name, trails.createdAt)
    .orderBy(asc(trails.createdAt), asc(trails.id));
  return rows.map(toTrail);
}

/** Every Trail a User owns, with derived progress, oldest first — and only theirs. */
export async function listTrails(
  db: Database,
  userId: UserId,
): Promise<Trail[]> {
  return selectTrails(db, userId, null);
}

/** One Trail with its derived progress, or null when it is not this User's. */
export async function getTrail(
  db: Database,
  userId: UserId,
  trailId: TrailId,
): Promise<Trail | null> {
  const [trail] = await selectTrails(db, userId, trailId);
  return trail ?? null;
}

/**
 * Create a named Trail for a User. The name is stored exactly as given; the Trail
 * starts with no Stops, so it reads back at 0/0 progress. The id and creation
 * time are database-assigned, and the fresh Trail can hold no Items yet, so this
 * hands back the new record without a second read.
 */
export async function createTrail(
  db: Database,
  userId: UserId,
  input: CreateTrailRequest,
): Promise<Trail> {
  const [row] = await db
    .insert(trails)
    .values({ userId, name: input.name })
    .returning({
      id: trails.id,
      user_id: trails.userId,
      name: trails.name,
      created_at: trails.createdAt,
      done: sql<number>`0`.mapWith(Number),
      total: sql<number>`0`.mapWith(Number),
    });
  return toTrail(row!);
}
