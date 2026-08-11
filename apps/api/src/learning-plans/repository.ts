import { and, asc, countDistinct, eq, sql } from "drizzle-orm";
import type {
  CreateLearningPlanRequest,
  LearningPlan,
  LearningPlanId,
  UpdateLearningPlanRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { items, stageItems, stages, learningPlans } from "../schema";

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
  done: number;
  total: number;
}

const toLearningPlan = (row: LearningPlanRow): LearningPlan => ({
  id: row.id as LearningPlanId,
  userId: row.user_id as UserId,
  name: row.name,
  createdAt: row.created_at.toISOString(),
  done: row.done,
  total: row.total,
});

/**
 * Select a User's LearningPlans, each with derived progress, restricted by an optional
 * id. Progress is counted per *distinct* Item across the LearningPlan's Stages, so an
 * Item pulled into two of the LearningPlan's Stages counts once — the roll-up mirrors the
 * per-node progress the LearningPlan canvas reads (ADR-0010) but folds the whole journey
 * into one fraction. It is computed here on every read, never stored, exactly as
 * All derives `pastTarget` (ADR-0005): an empty LearningPlan reads as 0/0 and can never
 * drift from its Stages' actual contents. Ordered by creation so the index is
 * stable across reads. Takes an id filter so `getLearningPlan` reuses the same shape.
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
      done: sql<number>`count(distinct ${items.id}) filter (where ${items.status} = 'done')::int`.mapWith(
        Number,
      ),
      total: countDistinct(items.id).mapWith(Number),
    })
    .from(learningPlans)
    .leftJoin(
      stages,
      and(
        eq(stages.learningPlanId, learningPlans.id),
        eq(stages.userId, learningPlans.userId),
      ),
    )
    .leftJoin(
      stageItems,
      and(
        eq(stageItems.stageId, stages.id),
        eq(stageItems.userId, learningPlans.userId),
      ),
    )
    .leftJoin(
      items,
      and(
        eq(items.id, stageItems.itemId),
        eq(items.userId, learningPlans.userId),
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
      done: sql<number>`0`.mapWith(Number),
      total: sql<number>`0`.mapWith(Number),
    });
  return toLearningPlan(row);
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
