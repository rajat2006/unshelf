import { and, asc, eq } from "drizzle-orm";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  CreateStageRequest,
  Item,
  Stage,
  StageDetail,
  StageId,
  LearningPlanId,
  UpdateStageRequest,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { activeItem } from "../items/active-item";
import { ITEM_PROJECTION, toItem, type ItemRow } from "../items/repository";
import {
  items,
  learningPlanNodes,
  learningPlans,
  stageItems,
  stages,
} from "../schema";

/**
 * Stage storage (ADR-0018). A Stage is an optional named grouping whose Item
 * placements have a local order. Everything the Stage shows about an Item is
 * still read from the one shared Item projection.
 *
 * Every function takes the authenticated User's anchor id and scopes to it, so a
 * foreign Stage or Item is indistinguishable from a missing one at the boundary.
 */

interface StageRow {
  id: string;
  user_id: string;
  learning_plan_id: string;
  name: string;
}

const toStage = (row: StageRow): Stage => ({
  id: row.id as StageId,
  userId: row.user_id as UserId,
  learningPlanId: row.learning_plan_id as LearningPlanId,
  name: row.name,
});

/**
 * Create an empty, named Stage on one of the User's LearningPlans (ADR-0014). A Stage
 * belongs to exactly one LearningPlan, so creation first resolves that LearningPlan under the
 * authenticated User and only inserts after the ownership check succeeds. When
 * the LearningPlan is not this User's the lookup finds nothing, so this returns null and
 * the router answers 404, exactly as a missing LearningPlan does. The schema's composite
 * owner foreign key remains the database backstage, and the name is stored exactly
 * as given.
 */
export async function createStage(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  input: CreateStageRequest,
): Promise<Stage | null> {
  return db.transaction(async (tx) => {
    const ownedLearningPlan = await tx
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(
        and(
          eq(learningPlans.id, learningPlanId),
          eq(learningPlans.userId, userId),
        ),
      )
      .limit(1);
    if (!ownedLearningPlan[0]) return null;

    const [node] = await tx
      .insert(learningPlanNodes)
      .values({ userId, learningPlanId, kind: PlanNodeKind.Stage })
      .returning({ id: learningPlanNodes.id });
    if (!node) throw new Error("Learning Plan node insert returned no record");

    const [stage] = await tx
      .insert(stages)
      .values({ id: node.id, userId, learningPlanId, name: input.name })
      .returning({
        id: stages.id,
        user_id: stages.userId,
        learning_plan_id: stages.learningPlanId,
        name: stages.name,
      });
    return stage ? toStage(stage) : null;
  });
}

/**
 * Every Stage belonging to a User, and only that User's. Stages carry no order
 * relative to one another (that is the Learning Plan topology's job), so name is
 * only a display convenience — but an
 * unordered read is free to shuffle between refreshes, and a list that reorders
 * itself under the User reads as change where nothing changed.
 */
export async function listStages(
  db: Database,
  userId: UserId,
): Promise<Stage[]> {
  const rows = await db
    .select({
      id: stages.id,
      user_id: stages.userId,
      learning_plan_id: stages.learningPlanId,
      name: stages.name,
    })
    .from(stages)
    .where(eq(stages.userId, userId))
    .orderBy(asc(stages.name));
  return rows.map(toStage);
}

/**
 * One Stage with its Items, or null when the Stage is not this User's.
 *
 * The Items are selected from `items` through their placements so
 * `ITEM_PROJECTION` reads here precisely as it does in the Library. Their stored
 * positions are the Stage's stable local order. The `user_id` predicate is redundant
 * once the Stage is known to be the User's (membership can only ever join same-User
 * ends) and is kept as the belt to that braces: every read of `items` in this
 * codebase names its User.
 */
export async function getStage(
  db: Database,
  userId: UserId,
  stageId: StageId,
): Promise<StageDetail | null> {
  return getStageInScope(db, userId, stageId, null);
}

async function getStageInScope(
  db: Database,
  userId: UserId,
  stageId: StageId,
  learningPlanId: LearningPlanId | null,
): Promise<StageDetail | null> {
  const predicates = [eq(stages.id, stageId), eq(stages.userId, userId)];
  if (learningPlanId)
    predicates.push(eq(stages.learningPlanId, learningPlanId));
  const rows = await db
    .select({
      id: stages.id,
      user_id: stages.userId,
      learning_plan_id: stages.learningPlanId,
      name: stages.name,
    })
    .from(stages)
    .where(and(...predicates))
    .limit(1);
  const stage = rows[0];
  if (!stage) return null;

  return { ...toStage(stage), items: await listItemsIn(db, userId, stageId) };
}

/**
 * Read Stage detail only when the URL's LearningPlan and Stage belong together. Both ids
 * are resolved under the authenticated User so a mismatch, a foreign id, and a
 * missing id all collapse to the same null result.
 */
export async function getStageOnLearningPlan(
  db: Database,
  userId: UserId,
  learningPlanId: LearningPlanId,
  stageId: StageId,
): Promise<StageDetail | null> {
  return getStageInScope(db, userId, stageId, learningPlanId);
}

/** Rename one owned Stage without changing its node identity or Items. */
export async function updateStage(
  db: Database,
  userId: UserId,
  stageId: StageId,
  input: UpdateStageRequest,
): Promise<StageDetail | null> {
  const [updated] = await db
    .update(stages)
    .set({ name: input.name })
    .where(and(eq(stages.id, stageId), eq(stages.userId, userId)))
    .returning({ id: stages.id });
  return updated ? getStage(db, userId, stageId) : null;
}

async function listItemsIn(
  db: Database,
  userId: UserId,
  stageId: StageId,
): Promise<Item[]> {
  const rows: ItemRow[] = await db
    .select(ITEM_PROJECTION)
    .from(items)
    .innerJoin(
      stageItems,
      and(eq(stageItems.itemId, items.id), eq(stageItems.userId, items.userId)),
    )
    .where(
      and(
        eq(items.userId, userId),
        eq(stageItems.stageId, stageId),
        activeItem(),
      ),
    )
    .orderBy(asc(stageItems.position));
  return rows.map(toItem);
}
