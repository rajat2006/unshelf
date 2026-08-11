import { and, asc, eq, ilike, inArray, notExists, sql } from "drizzle-orm";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  ItemId,
  ItemPlacementCatalog,
  ItemPlacementLearningPlan,
  StageItemCandidate,
  StageItemDisposition,
  StageDetail,
  StageId,
  LearningPlanId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  items,
  learningPlanItemPlacements,
  learningPlanNodes,
  stageItems,
  stages,
  learningPlans,
} from "../schema";
import { getStage } from "../stages/repository";
import { isUniqueConstraintViolation } from "./postgres";
import { getLearningPlan } from "../learning-plan/repository";

export {
  createStageWithItem,
  type CreateStageWithItemResult,
} from "./create-stage-with-item";

export type PlaceItemInStageResult =
  | { ok: true; stage: StageDetail }
  | { ok: false; error: "not_found" | "conflict" };

export type ReorderStageItemsResult =
  | { ok: true; stage: StageDetail }
  | { ok: false; error: "not_found" | "conflict" };

interface PlaceItemInStageInput {
  userId: UserId;
  stageId: StageId;
  itemId: ItemId;
}

const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

/**
 * Read every owned LearningPlan exactly once for one owned Item.
 *
 * A LearningPlan already containing the Item is mutually exclusive with its destination
 * list, while every other LearningPlan remains available even when it has no Stages yet.
 */
export async function getItemPlacementCatalog(
  db: Database,
  input: { userId: UserId; itemId: ItemId },
): Promise<ItemPlacementCatalog | null> {
  const [ownedItem] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)))
    .limit(1);
  if (!ownedItem) return null;

  const learningPlanRows = await db
    .select({ id: learningPlans.id, name: learningPlans.name })
    .from(learningPlans)
    .where(eq(learningPlans.userId, input.userId))
    .orderBy(asc(learningPlans.createdAt), asc(learningPlans.id));
  const stageRows = await db
    .select({
      id: stages.id,
      name: stages.name,
      learningPlanId: stages.learningPlanId,
    })
    .from(stages)
    .where(eq(stages.userId, input.userId))
    .orderBy(asc(stages.name), asc(stages.id));
  const placementRows = await db
    .select({
      learningPlanId: learningPlanItemPlacements.learningPlanId,
      nodeId: learningPlanItemPlacements.nodeId,
      stageId: learningPlanItemPlacements.stageId,
    })
    .from(learningPlanItemPlacements)
    .where(
      and(
        eq(learningPlanItemPlacements.userId, input.userId),
        eq(learningPlanItemPlacements.itemId, input.itemId),
      ),
    );

  const catalogLearningPlans: ItemPlacementLearningPlan[] =
    learningPlanRows.map((learningPlan) => {
      const learningPlanStages = stageRows.filter(
        (stage) => stage.learningPlanId === learningPlan.id,
      );
      const placement = placementRows.find(
        (candidate) => candidate.learningPlanId === learningPlan.id,
      );
      const placed = placement?.stageId
        ? learningPlanStages.find((stage) => stage.id === placement.stageId)
        : undefined;
      const learningPlanIdentity = {
        id: learningPlan.id as LearningPlanId,
        name: learningPlan.name,
      };
      if (placed) {
        return {
          kind: "placed",
          learningPlan: learningPlanIdentity,
          stage: { id: placed.id as StageId, name: placed.name },
        };
      }
      if (placement?.nodeId) {
        return {
          kind: "placed_direct",
          learningPlan: learningPlanIdentity,
        };
      }
      return {
        kind: "available",
        learningPlan: learningPlanIdentity,
        stages: learningPlanStages.map((stage) => ({
          id: stage.id as StageId,
          name: stage.name,
        })),
      };
    });

  return { itemId: input.itemId, learningPlans: catalogLearningPlans };
}

/**
 * Search the owned Library beneath one owned Stage.
 *
 * Current members are absent because the Stage renders them above this intake.
 * The capped result is presentation-ordered by title and stable Item identity.
 */
export async function searchStageItemCandidates(
  db: Database,
  input: { userId: UserId; stageId: StageId; query: string },
): Promise<StageItemCandidate[] | null> {
  const [destination] = await db
    .select({ learningPlanId: stages.learningPlanId })
    .from(stages)
    .where(and(eq(stages.id, input.stageId), eq(stages.userId, input.userId)))
    .limit(1);
  if (!destination) return null;

  const currentMembership = db
    .select({ itemId: learningPlanItemPlacements.itemId })
    .from(learningPlanItemPlacements)
    .where(
      and(
        eq(learningPlanItemPlacements.stageId, input.stageId),
        eq(learningPlanItemPlacements.itemId, items.id),
        eq(learningPlanItemPlacements.userId, input.userId),
      ),
    );
  const predicates = [
    eq(items.userId, input.userId),
    notExists(currentMembership),
  ];
  if (input.query) {
    predicates.push(ilike(items.title, `%${escapeLikePattern(input.query)}%`));
  }

  const candidates = await db
    .select({ id: items.id, title: items.title, type: items.type })
    .from(items)
    .where(and(...predicates))
    .orderBy(asc(items.title), asc(items.id))
    .limit(10);
  if (candidates.length === 0) return [];

  const conflicts = await db
    .select({
      itemId: learningPlanItemPlacements.itemId,
      nodeId: learningPlanItemPlacements.nodeId,
      stageId: learningPlanItemPlacements.stageId,
      stageName: stages.name,
    })
    .from(learningPlanItemPlacements)
    .leftJoin(stages, eq(stages.id, learningPlanItemPlacements.stageId))
    .where(
      and(
        eq(learningPlanItemPlacements.userId, input.userId),
        eq(
          learningPlanItemPlacements.learningPlanId,
          destination.learningPlanId,
        ),
        inArray(
          learningPlanItemPlacements.itemId,
          candidates.map(({ id }) => id),
        ),
      ),
    );
  const conflictByItem = new Map(
    conflicts.map((conflict) => [conflict.itemId, conflict]),
  );

  return candidates.map((candidate) => {
    const conflict = conflictByItem.get(candidate.id);
    if (conflict?.nodeId) {
      return {
        kind: "direct_conflict",
        ...candidate,
        id: candidate.id as ItemId,
      };
    }
    return conflict?.stageId && conflict.stageName
      ? {
          kind: "conflict",
          ...candidate,
          id: candidate.id as ItemId,
          stage: {
            id: conflict.stageId as StageId,
            name: conflict.stageName,
          },
        }
      : {
          kind: "available",
          ...candidate,
          id: candidate.id as ItemId,
        };
  });
}

/**
 * Place one owned Item into one owned Stage.
 *
 * An Item can appear on several LearningPlans, but only once on any one LearningPlan. A repeat
 * placement into the same Stage is idempotent; another Stage on that LearningPlan is a
 * conflict that leaves the first membership untouched.
 */
export async function placeItemInStage(
  db: Database,
  input: PlaceItemInStageInput,
): Promise<PlaceItemInStageResult> {
  const [destination] = await db
    .select({ learningPlanId: stages.learningPlanId })
    .from(stages)
    .innerJoin(
      items,
      and(eq(items.id, input.itemId), eq(items.userId, input.userId)),
    )
    .where(and(eq(stages.id, input.stageId), eq(stages.userId, input.userId)))
    .limit(1);
  if (!destination) return { ok: false, error: "not_found" };

  const [existing] = await db
    .select({ stageId: learningPlanItemPlacements.stageId })
    .from(learningPlanItemPlacements)
    .where(
      and(
        eq(learningPlanItemPlacements.itemId, input.itemId),
        eq(learningPlanItemPlacements.userId, input.userId),
        eq(
          learningPlanItemPlacements.learningPlanId,
          destination.learningPlanId,
        ),
      ),
    )
    .limit(1);

  if (existing && existing.stageId !== input.stageId) {
    return { ok: false, error: "conflict" };
  }

  if (!existing) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
        );
        const [placement] = await tx
          .insert(learningPlanItemPlacements)
          .values({
            userId: input.userId,
            learningPlanId: destination.learningPlanId,
            itemId: input.itemId,
            stageId: input.stageId,
          })
          .returning({ id: learningPlanItemPlacements.id });
        if (!placement)
          throw new Error("Stage placement insert returned no record");

        await tx.insert(stageItems).values({
          placementId: placement.id,
          userId: input.userId,
          stageId: input.stageId,
          itemId: input.itemId,
          learningPlanId: destination.learningPlanId,
          position: sql<number>`coalesce((
            select max(${stageItems.position})
            from ${stageItems}
            where ${stageItems.stageId} = ${input.stageId}
          ), -1) + 1`,
        });
      });
    } catch (error: unknown) {
      if (
        isUniqueConstraintViolation(
          error,
          "learning_plan_item_placements_item_plan_unique",
        )
      ) {
        return { ok: false, error: "conflict" };
      }
      throw error;
    }

    const [settled] = await db
      .select({ stageId: learningPlanItemPlacements.stageId })
      .from(learningPlanItemPlacements)
      .where(
        and(
          eq(learningPlanItemPlacements.itemId, input.itemId),
          eq(learningPlanItemPlacements.userId, input.userId),
          eq(
            learningPlanItemPlacements.learningPlanId,
            destination.learningPlanId,
          ),
        ),
      )
      .limit(1);
    if (settled?.stageId !== input.stageId) {
      return { ok: false, error: "conflict" };
    }
  }

  const stage = await getStage(db, input.userId, input.stageId);
  return stage ? { ok: true, stage } : { ok: false, error: "not_found" };
}

/**
 * Remove one Item–Stage membership without changing the Item or its placements on
 * other LearningPlans. Repeating removal is idempotent; only a missing or foreign Stage
 * fails the private boundary.
 */
export async function removeItemFromStage(
  db: Database,
  input: { userId: UserId; stageId: StageId; itemId: ItemId },
): Promise<StageDetail | null> {
  await db
    .delete(learningPlanItemPlacements)
    .where(
      and(
        eq(learningPlanItemPlacements.stageId, input.stageId),
        eq(learningPlanItemPlacements.itemId, input.itemId),
        eq(learningPlanItemPlacements.userId, input.userId),
      ),
    );
  return getStage(db, input.userId, input.stageId);
}

/** Replace one Stage's complete local order without changing any placement identity. */
export async function reorderStageItems(
  db: Database,
  input: { userId: UserId; stageId: StageId; itemIds: ItemId[] },
): Promise<ReorderStageItemsResult> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    );
    const [ownedStage] = await tx
      .select({ id: stages.id })
      .from(stages)
      .where(and(eq(stages.id, input.stageId), eq(stages.userId, input.userId)))
      .limit(1);
    if (!ownedStage) return "not_found" as const;

    const current = await tx
      .select({ itemId: stageItems.itemId })
      .from(stageItems)
      .where(
        and(
          eq(stageItems.stageId, input.stageId),
          eq(stageItems.userId, input.userId),
        ),
      );
    const currentIds = new Set(current.map(({ itemId }) => itemId));
    if (
      currentIds.size !== input.itemIds.length ||
      input.itemIds.some((itemId) => !currentIds.has(itemId))
    ) {
      return "conflict" as const;
    }

    await tx
      .update(stageItems)
      .set({ position: sql`-${stageItems.position} - 1` })
      .where(
        and(
          eq(stageItems.stageId, input.stageId),
          eq(stageItems.userId, input.userId),
        ),
      );
    for (const [position, itemId] of input.itemIds.entries()) {
      await tx
        .update(stageItems)
        .set({ position })
        .where(
          and(
            eq(stageItems.stageId, input.stageId),
            eq(stageItems.itemId, itemId),
            eq(stageItems.userId, input.userId),
          ),
        );
    }
    return "ok" as const;
  });

  if (result !== "ok") return { ok: false, error: result };
  const stage = await getStage(db, input.userId, input.stageId);
  return stage ? { ok: true, stage } : { ok: false, error: "not_found" };
}

/** Move one existing plan placement without copying its Item or shared facts. */
export async function moveLearningPlanItem(
  db: Database,
  input: {
    userId: UserId;
    learningPlanId: LearningPlanId;
    itemId: ItemId;
    stageId: StageId | null;
  },
) {
  const moved = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    );
    const [placement] = await tx
      .select({
        id: learningPlanItemPlacements.id,
        nodeId: learningPlanItemPlacements.nodeId,
        stageId: learningPlanItemPlacements.stageId,
      })
      .from(learningPlanItemPlacements)
      .innerJoin(
        learningPlans,
        and(
          eq(learningPlans.id, learningPlanItemPlacements.learningPlanId),
          eq(learningPlans.userId, input.userId),
        ),
      )
      .innerJoin(
        items,
        and(
          eq(items.id, learningPlanItemPlacements.itemId),
          eq(items.userId, input.userId),
        ),
      )
      .where(
        and(
          eq(learningPlanItemPlacements.userId, input.userId),
          eq(learningPlanItemPlacements.learningPlanId, input.learningPlanId),
          eq(learningPlanItemPlacements.itemId, input.itemId),
        ),
      )
      .limit(1);
    if (!placement) return false;

    if (input.stageId) {
      const [destination] = await tx
        .select({ id: stages.id })
        .from(stages)
        .where(
          and(
            eq(stages.id, input.stageId),
            eq(stages.userId, input.userId),
            eq(stages.learningPlanId, input.learningPlanId),
          ),
        )
        .limit(1);
      if (!destination) return false;
    }
    if (placement.stageId === input.stageId) return true;

    if (placement.stageId) {
      await tx
        .delete(stageItems)
        .where(
          and(
            eq(stageItems.placementId, placement.id),
            eq(stageItems.userId, input.userId),
          ),
        );
    }

    if (input.stageId) {
      await tx
        .update(learningPlanItemPlacements)
        .set({ stageId: input.stageId, nodeId: null, nodeKind: null })
        .where(eq(learningPlanItemPlacements.id, placement.id));
      if (placement.nodeId) {
        await tx
          .delete(learningPlanNodes)
          .where(eq(learningPlanNodes.id, placement.nodeId));
      }
      await tx.insert(stageItems).values({
        placementId: placement.id,
        userId: input.userId,
        learningPlanId: input.learningPlanId,
        stageId: input.stageId,
        itemId: input.itemId,
        position: sql<number>`coalesce((
          select max(${stageItems.position})
          from ${stageItems}
          where ${stageItems.stageId} = ${input.stageId}
        ), -1) + 1`,
      });
    } else {
      await convertPlacementToDirect(tx, {
        placementId: placement.id,
        userId: input.userId,
        learningPlanId: input.learningPlanId,
      });
    }
    return true;
  });

  return moved ? getLearningPlan(db, input.userId, input.learningPlanId) : null;
}

/** Remove a Stage only after the caller chooses what happens to its placements. */
export async function removeStageWithDisposition(
  db: Database,
  input: {
    userId: UserId;
    stageId: StageId;
    itemDisposition: StageItemDisposition;
  },
) {
  const learningPlanId = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`,
    );
    const [stage] = await tx
      .select({ learningPlanId: stages.learningPlanId })
      .from(stages)
      .where(and(eq(stages.id, input.stageId), eq(stages.userId, input.userId)))
      .limit(1);
    if (!stage) return null;
    if (input.itemDisposition === "place_directly") {
      const placements = await tx
        .select({
          id: learningPlanItemPlacements.id,
          itemId: learningPlanItemPlacements.itemId,
        })
        .from(learningPlanItemPlacements)
        .where(
          and(
            eq(learningPlanItemPlacements.stageId, input.stageId),
            eq(learningPlanItemPlacements.userId, input.userId),
          ),
        );
      await tx
        .delete(stageItems)
        .where(
          and(
            eq(stageItems.stageId, input.stageId),
            eq(stageItems.userId, input.userId),
          ),
        );
      for (const placement of placements) {
        await convertPlacementToDirect(tx, {
          placementId: placement.id,
          userId: input.userId,
          learningPlanId: stage.learningPlanId as LearningPlanId,
        });
      }
    }

    await tx
      .delete(learningPlanNodes)
      .where(
        and(
          eq(learningPlanNodes.id, input.stageId),
          eq(learningPlanNodes.userId, input.userId),
          eq(learningPlanNodes.learningPlanId, stage.learningPlanId),
        ),
      );
    return stage.learningPlanId as LearningPlanId;
  });

  return learningPlanId
    ? getLearningPlan(db, input.userId, learningPlanId)
    : null;
}

async function convertPlacementToDirect(
  db: Database,
  input: {
    placementId: string;
    userId: UserId;
    learningPlanId: LearningPlanId;
  },
) {
  const [node] = await db
    .insert(learningPlanNodes)
    .values({
      userId: input.userId,
      learningPlanId: input.learningPlanId,
      kind: PlanNodeKind.Item,
    })
    .returning({ id: learningPlanNodes.id });
  if (!node) throw new Error("Learning Plan node insert returned no record");
  await db
    .update(learningPlanItemPlacements)
    .set({ stageId: null, nodeId: node.id, nodeKind: PlanNodeKind.Item })
    .where(eq(learningPlanItemPlacements.id, input.placementId));
}
