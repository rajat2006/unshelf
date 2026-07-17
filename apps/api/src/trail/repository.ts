import type { Pool, PoolClient } from "pg";
import type {
  StopId,
  TrailEdge,
  TrailNode,
  TrailView,
  UserId,
} from "@unshelf/shared";

/** Either a pool or a live transaction client — both can run a query. */
type Queryable = Pick<Pool, "query">;

/**
 * Trail storage (ADR-0010). The Trail is the adjacency edge list scoped to a
 * User — it is not a table of its own but a derived view whose nodes are the
 * User's Stops and whose edges are `trail_edges` rows. So there is nothing to
 * create or name here: a User's Trail exists the moment they have Stops, and this
 * module only draws and erases the edges between them.
 *
 * Every function takes the authenticated User's anchor id and scopes to it, so a
 * foreign Stop is indistinguishable from a missing one at the boundary. The one
 * invariant the schema cannot cheaply declare — acyclicity — is owned here, at
 * the write seam, exactly where the API-boundary tests exercise it.
 */

interface EdgeRow {
  user_id: string;
  from_stop_id: string;
  to_stop_id: string;
}

const toEdge = (row: EdgeRow): TrailEdge => ({
  userId: row.user_id as UserId,
  fromStopId: row.from_stop_id as StopId,
  toStopId: row.to_stop_id as StopId,
});

interface NodeRow {
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

/**
 * Read a User's whole Trail — its nodes and its edges — in one consistent view.
 * Both are ordered stably (nodes by name like the Stops list, edges by endpoint)
 * for the same reason a Stop's Items are: an unordered read is free to shuffle
 * between refreshes, and a list that reorders itself reads as change where nothing
 * changed. Takes any `Queryable` so `connectStops` can re-read inside its own
 * transaction (seeing the just-inserted edge) without a second connection.
 *
 * The nodes are the User's Stops, each carrying *derived* progress — the count of
 * its Items that are *done* over its Item count — read here exactly the way All
 * derives `pastTarget` (ADR-0005), never stored. An empty Stop reads as 0/0. The
 * two counts are computed in one grouped pass over the same membership the Stops
 * view uses, so what a Stop shows on the Trail can never drift from what it shows
 * when opened.
 */
async function selectTrail(
  queryable: Queryable,
  userId: UserId,
): Promise<TrailView> {
  const nodes = await queryable.query<NodeRow>(
    `SELECT s.id, s.name,
            count(i.id)::int AS total,
            count(i.id) FILTER (WHERE i.status = 'done')::int AS done
     FROM stops s
     LEFT JOIN stop_items si ON si.stop_id = s.id AND si.user_id = s.user_id
     LEFT JOIN items i ON i.id = si.item_id AND i.user_id = s.user_id
     WHERE s.user_id = $1
     GROUP BY s.id, s.name
     ORDER BY s.name`,
    [userId],
  );
  const edges = await queryable.query<EdgeRow>(
    `SELECT user_id, from_stop_id, to_stop_id
     FROM trail_edges
     WHERE user_id = $1
     ORDER BY from_stop_id, to_stop_id`,
    [userId],
  );
  return { nodes: nodes.rows.map(toNode), edges: edges.rows.map(toEdge) };
}

/**
 * The User's whole Trail: their Stops as nodes (with derived progress) and the
 * edges between them, and only theirs. The client derives the layout from the
 * edges; this hands back the topology, never a position.
 */
export async function getTrail(
  pool: Pool,
  userId: UserId,
): Promise<TrailView> {
  return selectTrail(pool, userId);
}

/**
 * The outcome of a `connect`. Every failure is a distinct, nameable reason so the
 * router can answer each one honestly: a Stop that is not the User's is a 404, a
 * link that would close a cycle is a 409, and success hands back the new Trail.
 */
export type ConnectResult =
  | { kind: "ok"; trail: TrailView }
  | { kind: "not_found" }
  | { kind: "cycle" };

/**
 * Draw an edge `from → to`, enforcing the DAG. A `connect` is refused when the
 * target can already reach the source, because that back-edge would close a cycle
 * (ADR-0010) — Postgres cannot forbid this declaratively, so the check and the
 * insert must be one atomic step or a race could still slip a cycle in between
 * them. A transaction-level advisory lock keyed on the User serialises that
 * User's connects, so the reachability read the insert depends on cannot go stale
 * under a concurrent writer; other Users are unaffected.
 *
 * Both ends are proven to be the User's *inside* the transaction; a duplicate
 * edge is a no-op (`ON CONFLICT DO NOTHING`), because the edge set is a set and
 * drawing an edge that already exists is a request for a state that already
 * holds. A self-loop never reaches here — the router rejects `from === to` — and
 * the schema's CHECK is the backstop.
 */
export async function connectStops(
  pool: Pool,
  userId: UserId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<ConnectResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise this User's connects: the cycle check and the insert below must
    // see a consistent edge set, and this lock releases automatically on commit.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      userId,
    ]);

    if (!(await bothStopsBelongToUser(client, userId, fromStopId, toStopId))) {
      await client.query("ROLLBACK");
      return { kind: "not_found" };
    }

    if (await targetReachesSource(client, userId, fromStopId, toStopId)) {
      await client.query("ROLLBACK");
      return { kind: "cycle" };
    }

    await client.query(
      `INSERT INTO trail_edges (user_id, from_stop_id, to_stop_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, fromStopId, toStopId],
    );

    const trail = await selectTrail(client, userId);
    await client.query("COMMIT");
    return { kind: "ok", trail };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Both ids name a Stop this User owns. Distinctness is the caller's to enforce. */
async function bothStopsBelongToUser(
  client: PoolClient,
  userId: UserId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<boolean> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::int AS count
     FROM stops
     WHERE user_id = $1 AND id IN ($2, $3)`,
    [userId, fromStopId, toStopId],
  );
  return Number(rows[0]?.count) === 2;
}

/**
 * Can `to` already reach `from` by following edges? If so, adding `from → to`
 * would close a cycle. The recursive CTE walks out-edges from `to`; a hit on
 * `from` is the back-edge that must be refused.
 */
async function targetReachesSource(
  client: PoolClient,
  userId: UserId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<boolean> {
  const { rows } = await client.query(
    `WITH RECURSIVE reachable(node) AS (
       SELECT to_stop_id FROM trail_edges
       WHERE user_id = $1 AND from_stop_id = $2
       UNION
       SELECT e.to_stop_id FROM trail_edges e
       JOIN reachable r ON e.from_stop_id = r.node
       WHERE e.user_id = $1
     )
     SELECT 1 FROM reachable WHERE node = $3 LIMIT 1`,
    [userId, toStopId, fromStopId],
  );
  return rows.length > 0;
}

/**
 * Erase an edge, returning the Trail's new edge set. Removing an edge that is not
 * there succeeds, because the caller asked for a state ("those Stops are not
 * linked") that already holds — a set has no notion of removing something twice.
 * The delete names the User directly on the edge, and the read that follows is
 * scoped to them, so one User can neither read nor rewire another's Trail.
 */
export async function disconnectStops(
  pool: Pool,
  userId: UserId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<TrailView> {
  await pool.query(
    `DELETE FROM trail_edges
     WHERE user_id = $1 AND from_stop_id = $2 AND to_stop_id = $3`,
    [userId, fromStopId, toStopId],
  );
  return getTrail(pool, userId);
}
