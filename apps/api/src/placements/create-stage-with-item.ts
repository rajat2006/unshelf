import { and, eq } from "drizzle-orm";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  CreateStageWithItemRequest,
  ItemId,
  StageDetail,
  StageId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import {
  items,
  learningPlanItemPlacements,
  learningPlanNodes,
  learningPlans,
  stageItems,
  stages,
} from "../schema";
import { getStage } from "../stages/repository";
import { isUniqueConstraintViolation } from "./postgres";

export type CreateStageWithItemResult =
  | { ok: true; stage: StageDetail }
  | { ok: false; error: "not_found" | "conflict" };

/**
 * Create one ordinary, unconnected Stage and its first Item membership as one
 * command. Both ends are resolved under the authenticated User inside the same
 * transaction, so a missing/foreign end or a failed membership never leaves an
 * empty Stage behind.
 */
export async function createStageWithItem(
  db: Database,
  input: {
    userId: UserId;
    itemId: ItemId;
    placement: CreateStageWithItemRequest;
  },
): Promise<CreateStageWithItemResult> {
  try {
    return await db.transaction(async (tx) => {
      const [ownedEnds] = await tx
        .select({ learningPlanId: learningPlans.id })
        .from(learningPlans)
        .innerJoin(
          items,
          and(eq(items.id, input.itemId), eq(items.userId, input.userId)),
        )
        .where(
          and(
            eq(learningPlans.id, input.placement.learningPlanId),
            eq(learningPlans.userId, input.userId),
          ),
        )
        .limit(1);
      if (!ownedEnds) return { ok: false, error: "not_found" };

      const [existing] = await tx
        .select({ stageId: stageItems.stageId })
        .from(stageItems)
        .where(
          and(
            eq(stageItems.userId, input.userId),
            eq(stageItems.itemId, input.itemId),
            eq(stageItems.learningPlanId, input.placement.learningPlanId),
          ),
        )
        .limit(1);
      if (existing) return { ok: false, error: "conflict" };

      const [node] = await tx
        .insert(learningPlanNodes)
        .values({
          userId: input.userId,
          learningPlanId: input.placement.learningPlanId,
          kind: PlanNodeKind.Stage,
        })
        .returning({ id: learningPlanNodes.id });
      if (!node)
        throw new Error("Learning Plan node insert returned no record");

      const [created] = await tx
        .insert(stages)
        .values({
          id: node.id,
          userId: input.userId,
          learningPlanId: input.placement.learningPlanId,
          name: input.placement.name,
        })
        .returning({ id: stages.id });
      if (!created) throw new Error("Stage insert returned no record");

      const [placement] = await tx
        .insert(learningPlanItemPlacements)
        .values({
          userId: input.userId,
          learningPlanId: input.placement.learningPlanId,
          itemId: input.itemId,
          stageId: created.id,
        })
        .returning({ id: learningPlanItemPlacements.id });
      if (!placement)
        throw new Error("Stage placement insert returned no record");

      await tx.insert(stageItems).values({
        placementId: placement.id,
        userId: input.userId,
        stageId: created.id,
        itemId: input.itemId,
        learningPlanId: input.placement.learningPlanId,
        position: 0,
      });

      const stage = await getStage(tx, input.userId, created.id as StageId);
      if (!stage) throw new Error("Created Stage could not be read");
      return { ok: true, stage };
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
}
