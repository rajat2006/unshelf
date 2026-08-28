import {
  and,
  asc,
  countDistinct,
  eq,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type {
  CreateLearningPlanRequest,
  LearningPlan,
  LearningPlanId,
  UpdateLearningPlanRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { activeItem } from "../items/active-item";
import { items, learningPlanItemPlacements, learningPlans } from "../schema";

/**
 * LearningPlan storage (ADR-0014). The LearningPlan is now a first-class record — one User owns
 * many, each with an opaque stable id, a name, and derived progress. This is the
 * promotion of ADR-0010's implicit "the edge set scoped to a User *is* the LearningPlan":
 * the topology still lives in `learningPlan_edges`, but the journey itself now has a row.
 *
 * Every function takes the authenticated User's anchor id and scopes to it, so a
 * foreign LearningPlan is indistinguishable from a missing one at the boundary — a read
 * of someone else's id returns null, never a confirmation that the id is real.
 */

interface LearningPlanRow {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  archived_at: Date | null;
  done: number;
  total: number;
}

const toLearningPlan = (row: LearningPlanRow): LearningPlan => ({
  id: row.id as LearningPlanId,
  userId: row.user_id as UserId,
  name: row.name,
  createdAt: row.created_at.toISOString(),
  archivedAt: row.archived_at?.toISOString() ?? null,
  done: row.done,
  total: row.total,
});

/**
 * Select a User's LearningPlans, each with derived progress, restricted by an optional
 * id. Progress is counted through the plan's unique placement registry, so direct
 * and staged Items each contribute exactly once. The roll-up is computed here on
 * every read, never stored, exactly as Library derives `pastTarget` (ADR-0005):
 * an empty Learning Plan reads as 0/0 and can never drift from its current Items.
 * Ordered by creation so the index is stable across reads. Takes an id filter so
 * `getLearningPlan` reuses the same shape.
 */
async function selectLearningPlans(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId | null,
): Promise<LearningPlan[]> {
  const rows = await db
    .select({
      id: learningPlans.id,
      user_id: learningPlans.userId,
      name: learningPlans.name,
      created_at: learningPlans.createdAt,
      archived_at: learningPlans.archivedAt,
      done: sql<number>`count(distinct ${items.id}) filter (where ${items.status} = 'done')::int`.mapWith(
        Number,
      ),
      total: countDistinct(items.id).mapWith(Number),
    })
    .from(learningPlans)
    .leftJoin(
      learningPlanItemPlacements,
      and(
        eq(learningPlanItemPlacements.learningPlanId, learningPlans.id),
        eq(learningPlanItemPlacements.userId, learningPlans.userId),
      ),
    )
    .leftJoin(
      items,
      and(
        eq(items.id, learningPlanItemPlacements.itemId),
        eq(items.userId, learningPlans.userId),
        activeItem(),
      ),
    )
    .where(
      learningPlanId
        ? and(
            eq(learningPlans.userId, userId),
            eq(learningPlans.id, learningPlanId),
          )
        : eq(learningPlans.userId, userId),
    )
    .groupBy(
      learningPlans.id,
      learningPlans.userId,
      learningPlans.name,
      learningPlans.createdAt,
      learningPlans.archivedAt,
    )
    .orderBy(asc(learningPlans.createdAt), asc(learningPlans.id));
  return rows.map(toLearningPlan);
}

/** Every LearningPlan a User owns, with derived progress, oldest first — and only theirs. */
export async function listLearningPlans(
  db: Database,
  userId: UserId,
): Promise<LearningPlan[]> {
  return selectLearningPlans(db, userId, null);
}

/** One LearningPlan with its derived progress, or null when it is not this User's. */
export async function getLearningPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
): Promise<LearningPlan | null> {
  const [learningPlan] = await selectLearningPlans(db, userId, learningPlanId);
  return learningPlan ?? null;
}

/**
 * Create a named LearningPlan for a User. The name is stored exactly as given; the LearningPlan
 * starts with no Stages, so it reads back at 0/0 progress. The id and creation
 * time are database-assigned, and the fresh LearningPlan can hold no Items yet, so this
 * hands back the new record without a second read.
 */
export async function createLearningPlan(
  db: Database,
  userId: UserId,
  input: CreateLearningPlanRequest,
): Promise<LearningPlan> {
  const [row] = await db
    .insert(learningPlans)
    .values({ userId, name: input.name })
    .returning({
      id: learningPlans.id,
      user_id: learningPlans.userId,
      name: learningPlans.name,
      created_at: learningPlans.createdAt,
      archived_at: learningPlans.archivedAt,
      done: sql<number>`0`.mapWith(Number),
      total: sql<number>`0`.mapWith(Number),
    });
  return toLearningPlan(row);
}

/** Change one owned Learning Plan's lifecycle state without touching its structure. */
export async function setLearningPlanArchived({
  db,
  userId,
  learningPlanId,
  archived,
}: {
  db: Database;
  userId: UserId;
  learningPlanId: LearningPlanId;
  archived: boolean;
}): Promise<LearningPlan | null> {
  const [updated] = await db
    .update(learningPlans)
    .set({ archivedAt: archived ? new Date() : null })
    .where(
      and(
        eq(learningPlans.id, learningPlanId),
        eq(learningPlans.userId, userId),
        archived
          ? isNull(learningPlans.archivedAt)
          : isNotNull(learningPlans.archivedAt),
      ),
    )
    .returning({ id: learningPlans.id });
  return updated ? getLearningPlan(db, userId, learningPlanId) : null;
}

/** Rename one owned Learning Plan while preserving its stable identity. */
export async function updateLearningPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  input: UpdateLearningPlanRequest,
): Promise<LearningPlan | null> {
  const [updated] = await db
    .update(learningPlans)
    .set({ name: input.name })
    .where(
      and(
        eq(learningPlans.id, learningPlanId),
        eq(learningPlans.userId, userId),
      ),
    )
    .returning({ id: learningPlans.id });
  return updated ? getLearningPlan(db, userId, learningPlanId) : null;
}
