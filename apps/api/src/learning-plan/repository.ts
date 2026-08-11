import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  StageId,
  LearningPlanEdge,
  LearningPlanId,
  LearningPlanNode,
  LearningPlanView,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  items,
  stageItems,
  stages,
  learningPlanEdges,
  learningPlans,
} from "../schema";

/**
 * LearningPlan topology storage (ADR-0010, scoped per LearningPlan by ADR-0014). The LearningPlan's
 * shape is still the adjacency edge list — it is not a table of its own but a
 * derived view whose nodes are the LearningPlan's Stages and whose edges are
 * `learningPlan_edges` rows — but now every read and write names *one* LearningPlan, not the
 * whole User. So there is nothing to create or name here: a LearningPlan's topology
 * exists the moment it has Stages, and this module only draws and erases the edges
 * between the Stages on that one LearningPlan.
 *
 * Every function takes the authenticated User's anchor id *and* the LearningPlan id and
 * scopes to both, so a foreign or cross-LearningPlan Stage is indistinguishable from a
 * missing one at the boundary. The one invariant the schema cannot cheaply
 * declare — acyclicity — is owned here, at the write seam, exactly where the
 * API-boundary tests exercise it.
 */

interface EdgeRow {
  user_id: string;
  from_node_id: string;
  to_node_id: string;
}

const toEdge = (row: EdgeRow): LearningPlanEdge => ({
  userId: row.user_id as UserId,
  fromNodeId: row.from_node_id as StageId,
  toNodeId: row.to_node_id as StageId,
});

interface NodeRow {
  id: string;
  name: string;
  done: number;
  total: number;
}

const toNode = (row: NodeRow): LearningPlanNode => ({
  kind: PlanNodeKind.Stage,
  id: row.id as StageId,
  name: row.name,
  done: row.done,
  total: row.total,
});

/** Whether this LearningPlan is the User's — a foreign or unknown id reads as false. */
async function learningPlanBelongsToUser(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
): Promise<boolean> {
  const rows = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.id, learningPlanId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Read one LearningPlan's whole topology — its nodes and its edges — in one consistent
 * view. Both are ordered stably (nodes by name like the Stages list, edges by
 * endpoint) for the same reason a Stage's Items are: an unordered read is free to
 * shuffle between refreshes, and a list that reorders itself reads as change where
 * nothing changed. The Drizzle transaction handle has the same database shape,
 * so `connectLearningPlanNodes` can re-read inside its own transaction (seeing the
 * just-inserted edge) without a second connection or adapter type.
 *
 * The nodes are the *LearningPlan's* Stages — those whose `learningPlan_id` is this LearningPlan — each
 * carrying *derived* progress read exactly the way All derives `pastTarget`
 * (ADR-0005), never stored. An empty Stage reads as 0/0. The Stages and the edges
 * are both scoped to the one LearningPlan, so what a Stage shows on this LearningPlan can never
 * include another LearningPlan's waypoints or links.
 */
async function selectLearningPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
): Promise<LearningPlanView> {
  const nodes: NodeRow[] = await db
    .select({
      id: stages.id,
      name: stages.name,
      total: count(items.id).mapWith(Number),
      done: sql<number>`count(${items.id}) filter (
        where ${items.status} = 'done'
      )`.mapWith(Number),
    })
    .from(stages)
    .leftJoin(
      stageItems,
      and(
        eq(stageItems.stageId, stages.id),
        eq(stageItems.userId, stages.userId),
      ),
    )
    .leftJoin(
      items,
      and(eq(items.id, stageItems.itemId), eq(items.userId, stages.userId)),
    )
    .where(
      and(eq(stages.userId, userId), eq(stages.learningPlanId, learningPlanId)),
    )
    .groupBy(stages.id, stages.name)
    .orderBy(asc(stages.name));
  const edges: EdgeRow[] = await db
    .select({
      user_id: learningPlanEdges.userId,
      from_node_id: learningPlanEdges.fromNodeId,
      to_node_id: learningPlanEdges.toNodeId,
    })
    .from(learningPlanEdges)
    .where(
      and(
        eq(learningPlanEdges.userId, userId),
        eq(learningPlanEdges.learningPlanId, learningPlanId),
      ),
    )
    .orderBy(
      asc(learningPlanEdges.fromNodeId),
      asc(learningPlanEdges.toNodeId),
    );
  return { nodes: nodes.map(toNode), edges: edges.map(toEdge) };
}

/**
 * One LearningPlan's whole topology: its Stages as nodes (with derived progress) and the
 * edges between them, and only if the LearningPlan is this User's — a foreign or unknown
 * LearningPlan reads back as null, never a confirmation the id is real. The client
 * derives the layout from the edges; this hands back the topology, never a
 * position.
 */
export async function getLearningPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
): Promise<LearningPlanView | null> {
  if (!(await learningPlanBelongsToUser(db, userId, learningPlanId)))
    return null;
  return selectLearningPlan(db, userId, learningPlanId);
}

/**
 * The outcome of a `connect`. Every failure is a distinct, nameable reason so the
 * router can answer each one honestly: a Stage that is not on this LearningPlan (whether
 * foreign, cross-LearningPlan, or unknown) is a 404, a link that would close a cycle is a
 * 409, and success hands back the new LearningPlan.
 */
export type ConnectResult =
  | { kind: "ok"; learningPlan: LearningPlanView }
  | { kind: "not_found" }
  | { kind: "cycle" };

/**
 * Draw an edge `from → to` on one LearningPlan, enforcing the DAG. A `connect` is refused
 * when the target can already reach the source, because that back-edge would close
 * a cycle (ADR-0010) — Postgres cannot forbid this declaratively, so the check and
 * the insert must be one atomic step or a race could still slip a cycle in between
 * them. A transaction-level advisory lock keyed on the User serialises that User's
 * connects, so the reachability read the insert depends on cannot go stale under a
 * concurrent writer; other Users are unaffected.
 *
 * Both ends are proven to be Stages *on this LearningPlan* inside the transaction, so a
 * foreign, cross-LearningPlan, or unknown endpoint is a `not_found`; the database's
 * same-LearningPlan foreign keys are the backstage. A duplicate edge is a no-op
 * (`ON CONFLICT DO NOTHING`), because the edge set is a set and drawing an edge
 * that already exists is a request for a state that already holds. A self-loop
 * never reaches here — the router rejects `from === to` — and the schema's CHECK
 * is the backstage.
 */
export async function connectLearningPlanNodes(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  fromNodeId: StageId,
  toNodeId: StageId,
): Promise<ConnectResult> {
  return db.transaction(async (tx) => {
    // Serialise this User's connects: the cycle check and the insert below must
    // see a consistent edge set, and this lock releases automatically on commit.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `);

    if (
      !(await bothStagesOnLearningPlan(
        tx,
        userId,
        learningPlanId,
        fromNodeId,
        toNodeId,
      ))
    ) {
      return { kind: "not_found" };
    }

    if (
      await targetReachesSource(
        tx,
        userId,
        learningPlanId,
        fromNodeId,
        toNodeId,
      )
    ) {
      return { kind: "cycle" };
    }

    await tx
      .insert(learningPlanEdges)
      .values({ userId, learningPlanId, fromNodeId, toNodeId })
      .onConflictDoNothing();

    const learningPlan = await selectLearningPlan(tx, userId, learningPlanId);
    return { kind: "ok", learningPlan };
  });
}

/**
 * Both ids name a Stage the User owns *and that sits on this LearningPlan*. Scoping by
 * `learningPlan_id` is what refuses a cross-LearningPlan link — a Stage on another of the User's
 * LearningPlans is not found here, exactly as a foreign Stage is not. Distinctness is the
 * caller's to enforce.
 */
async function bothStagesOnLearningPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  fromNodeId: StageId,
  toNodeId: StageId,
): Promise<boolean> {
  const rows = await db
    .select({ count: count().mapWith(Number) })
    .from(stages)
    .where(
      and(
        eq(stages.userId, userId),
        eq(stages.learningPlanId, learningPlanId),
        inArray(stages.id, [fromNodeId, toNodeId]),
      ),
    );
  return Number(rows[0]?.count) === 2;
}

/**
 * Can `to` already reach `from` by following edges on this LearningPlan? If so, adding
 * `from → to` would close a cycle. The recursive CTE walks out-edges from `to`
 * within the one LearningPlan; a hit on `from` is the back-edge that must be refused.
 */
async function targetReachesSource(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  fromNodeId: StageId,
  toNodeId: StageId,
): Promise<boolean> {
  const { rows } = await db.execute(sql`
    WITH RECURSIVE reachable(node) AS (
      SELECT to_node_id FROM learning_plan_edges
      WHERE user_id = ${userId} AND learning_plan_id = ${learningPlanId}
        AND from_node_id = ${toNodeId}
      UNION
      SELECT e.to_node_id FROM learning_plan_edges e
      JOIN reachable r ON e.from_node_id = r.node
      WHERE e.user_id = ${userId} AND e.learning_plan_id = ${learningPlanId}
    )
    SELECT 1 FROM reachable WHERE node = ${fromNodeId} LIMIT 1
  `);
  return rows.length > 0;
}

/**
 * Erase an edge on one LearningPlan, returning the LearningPlan's new edge set — or null when
 * the LearningPlan is not this User's. Removing an edge that is not there succeeds,
 * because the caller asked for a state ("those Stages are not linked") that already
 * holds — a set has no notion of removing something twice. The delete names the
 * User and LearningPlan directly on the edge, and the read that follows is scoped to
 * both, so one User can neither read nor rewire another's LearningPlan.
 */
export async function disconnectLearningPlanNodes(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  fromNodeId: StageId,
  toNodeId: StageId,
): Promise<LearningPlanView | null> {
  if (!(await learningPlanBelongsToUser(db, userId, learningPlanId)))
    return null;
  await db
    .delete(learningPlanEdges)
    .where(
      and(
        eq(learningPlanEdges.userId, userId),
        eq(learningPlanEdges.learningPlanId, learningPlanId),
        eq(learningPlanEdges.fromNodeId, fromNodeId),
        eq(learningPlanEdges.toNodeId, toNodeId),
      ),
    );
  return selectLearningPlan(db, userId, learningPlanId);
}
