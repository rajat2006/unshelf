import { sql } from "drizzle-orm";
import type {
  StopId,
  TrailEdge,
  TrailId,
  TrailNode,
  TrailView,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";

/**
 * Trail topology storage (ADR-0010, scoped per Trail by ADR-0014). The Trail's
 * shape is still the adjacency edge list — it is not a table of its own but a
 * derived view whose nodes are the Trail's Stops and whose edges are
 * `trail_edges` rows — but now every read and write names *one* Trail, not the
 * whole User. So there is nothing to create or name here: a Trail's topology
 * exists the moment it has Stops, and this module only draws and erases the edges
 * between the Stops on that one Trail.
 *
 * Every function takes the authenticated User's anchor id *and* the Trail id and
 * scopes to both, so a foreign or cross-Trail Stop is indistinguishable from a
 * missing one at the boundary. The one invariant the schema cannot cheaply
 * declare — acyclicity — is owned here, at the write seam, exactly where the
 * API-boundary tests exercise it.
 */

interface EdgeRow extends Record<string, unknown> {
  user_id: string;
  from_stop_id: string;
  to_stop_id: string;
}

const toEdge = (row: EdgeRow): TrailEdge => ({
  userId: row.user_id as UserId,
  fromStopId: row.from_stop_id as StopId,
  toStopId: row.to_stop_id as StopId,
});

interface NodeRow extends Record<string, unknown> {
  id: string;
  name: string;
  done: number;
  total: number;
}

const toNode = (row: NodeRow): TrailNode => ({
  id: row.id as StopId,
  name: row.name,
  done: row.done,
  total: row.total,
});

/** Whether this Trail is the User's — a foreign or unknown id reads as false. */
async function trailBelongsToUser(
  db: Database,
  userId: UserId,
  trailId: TrailId,
): Promise<boolean> {
  const { rows } = await db.execute<{ exists: boolean }>(sql`
    SELECT true AS exists FROM trails
    WHERE id = ${trailId} AND user_id = ${userId}
  `);
  return rows.length > 0;
}

/**
 * Read one Trail's whole topology — its nodes and its edges — in one consistent
 * view. Both are ordered stably (nodes by name like the Stops list, edges by
 * endpoint) for the same reason a Stop's Items are: an unordered read is free to
 * shuffle between refreshes, and a list that reorders itself reads as change where
 * nothing changed. The Drizzle transaction handle has the same database shape,
 * so `connectStops` can re-read inside its own transaction (seeing the
 * just-inserted edge) without a second connection or adapter type.
 *
 * The nodes are the *Trail's* Stops — those whose `trail_id` is this Trail — each
 * carrying *derived* progress read exactly the way All derives `pastTarget`
 * (ADR-0005), never stored. An empty Stop reads as 0/0. The Stops and the edges
 * are both scoped to the one Trail, so what a Stop shows on this Trail can never
 * include another Trail's waypoints or links.
 */
async function selectTrail(
  db: Database,
  userId: UserId,
  trailId: TrailId,
): Promise<TrailView> {
  const nodes = await db.execute<NodeRow>(sql`
    SELECT s.id, s.name,
           count(i.id)::int AS total,
           count(i.id) FILTER (WHERE i.status = 'done')::int AS done
    FROM stops s
    LEFT JOIN stop_items si ON si.stop_id = s.id AND si.user_id = s.user_id
    LEFT JOIN items i ON i.id = si.item_id AND i.user_id = s.user_id
    WHERE s.user_id = ${userId} AND s.trail_id = ${trailId}
    GROUP BY s.id, s.name
    ORDER BY s.name
  `);
  const edges = await db.execute<EdgeRow>(sql`
    SELECT user_id, from_stop_id, to_stop_id
    FROM trail_edges
    WHERE user_id = ${userId} AND trail_id = ${trailId}
    ORDER BY from_stop_id, to_stop_id
  `);
  return { nodes: nodes.rows.map(toNode), edges: edges.rows.map(toEdge) };
}

/**
 * One Trail's whole topology: its Stops as nodes (with derived progress) and the
 * edges between them, and only if the Trail is this User's — a foreign or unknown
 * Trail reads back as null, never a confirmation the id is real. The client
 * derives the layout from the edges; this hands back the topology, never a
 * position.
 */
export async function getTrail(
  db: Database,
  userId: UserId,
  trailId: TrailId,
): Promise<TrailView | null> {
  if (!(await trailBelongsToUser(db, userId, trailId))) return null;
  return selectTrail(db, userId, trailId);
}

/**
 * The outcome of a `connect`. Every failure is a distinct, nameable reason so the
 * router can answer each one honestly: a Stop that is not on this Trail (whether
 * foreign, cross-Trail, or unknown) is a 404, a link that would close a cycle is a
 * 409, and success hands back the new Trail.
 */
export type ConnectResult =
  | { kind: "ok"; trail: TrailView }
  | { kind: "not_found" }
  | { kind: "cycle" };

/**
 * Draw an edge `from → to` on one Trail, enforcing the DAG. A `connect` is refused
 * when the target can already reach the source, because that back-edge would close
 * a cycle (ADR-0010) — Postgres cannot forbid this declaratively, so the check and
 * the insert must be one atomic step or a race could still slip a cycle in between
 * them. A transaction-level advisory lock keyed on the User serialises that User's
 * connects, so the reachability read the insert depends on cannot go stale under a
 * concurrent writer; other Users are unaffected.
 *
 * Both ends are proven to be Stops *on this Trail* inside the transaction, so a
 * foreign, cross-Trail, or unknown endpoint is a `not_found`; the database's
 * same-Trail foreign keys are the backstop. A duplicate edge is a no-op
 * (`ON CONFLICT DO NOTHING`), because the edge set is a set and drawing an edge
 * that already exists is a request for a state that already holds. A self-loop
 * never reaches here — the router rejects `from === to` — and the schema's CHECK
 * is the backstop.
 */
export async function connectStops(
  db: Database,
  userId: UserId,
  trailId: TrailId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<ConnectResult> {
  return db.transaction(async (tx) => {
    // Serialise this User's connects: the cycle check and the insert below must
    // see a consistent edge set, and this lock releases automatically on commit.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `);

    if (
      !(await bothStopsOnTrail(tx, userId, trailId, fromStopId, toStopId))
    ) {
      return { kind: "not_found" };
    }

    if (
      await targetReachesSource(tx, userId, trailId, fromStopId, toStopId)
    ) {
      return { kind: "cycle" };
    }

    await tx.execute(sql`
      INSERT INTO trail_edges (user_id, trail_id, from_stop_id, to_stop_id)
      VALUES (${userId}, ${trailId}, ${fromStopId}, ${toStopId})
      ON CONFLICT DO NOTHING
    `);

    const trail = await selectTrail(tx, userId, trailId);
    return { kind: "ok", trail };
  });
}

/**
 * Both ids name a Stop the User owns *and that sits on this Trail*. Scoping by
 * `trail_id` is what refuses a cross-Trail link — a Stop on another of the User's
 * Trails is not found here, exactly as a foreign Stop is not. Distinctness is the
 * caller's to enforce.
 */
async function bothStopsOnTrail(
  db: Database,
  userId: UserId,
  trailId: TrailId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<boolean> {
  const { rows } = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM stops
    WHERE user_id = ${userId} AND trail_id = ${trailId}
      AND id IN (${fromStopId}, ${toStopId})
  `);
  return Number(rows[0]?.count) === 2;
}

/**
 * Can `to` already reach `from` by following edges on this Trail? If so, adding
 * `from → to` would close a cycle. The recursive CTE walks out-edges from `to`
 * within the one Trail; a hit on `from` is the back-edge that must be refused.
 */
async function targetReachesSource(
  db: Database,
  userId: UserId,
  trailId: TrailId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<boolean> {
  const { rows } = await db.execute(sql`
    WITH RECURSIVE reachable(node) AS (
      SELECT to_stop_id FROM trail_edges
      WHERE user_id = ${userId} AND trail_id = ${trailId}
        AND from_stop_id = ${toStopId}
      UNION
      SELECT e.to_stop_id FROM trail_edges e
      JOIN reachable r ON e.from_stop_id = r.node
      WHERE e.user_id = ${userId} AND e.trail_id = ${trailId}
    )
    SELECT 1 FROM reachable WHERE node = ${fromStopId} LIMIT 1
  `);
  return rows.length > 0;
}

/**
 * Erase an edge on one Trail, returning the Trail's new edge set — or null when
 * the Trail is not this User's. Removing an edge that is not there succeeds,
 * because the caller asked for a state ("those Stops are not linked") that already
 * holds — a set has no notion of removing something twice. The delete names the
 * User and Trail directly on the edge, and the read that follows is scoped to
 * both, so one User can neither read nor rewire another's Trail.
 */
export async function disconnectStops(
  db: Database,
  userId: UserId,
  trailId: TrailId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<TrailView | null> {
  if (!(await trailBelongsToUser(db, userId, trailId))) return null;
  await db.execute(sql`
    DELETE FROM trail_edges
    WHERE user_id = ${userId} AND trail_id = ${trailId}
      AND from_stop_id = ${fromStopId} AND to_stop_id = ${toStopId}
  `);
  return selectTrail(db, userId, trailId);
}
