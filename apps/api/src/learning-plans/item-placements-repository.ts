import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  ItemId,
  LearningPlanItemCandidate,
  LearningPlanId,
  LearningPlanView,
  PlanNodeId,
  StageId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { activeItem } from "../items/active-item";
import { ITEM_PROJECTION, toItem } from "../items/repository";
import {
  items,
  learningPlanItemPlacements,
  learningPlanNodes,
  learningPlans,
  stages,
} from "../schema";
import { getLearningPlan } from "../learning-plan/repository";
import { isUniqueConstraintViolation } from "../placements/postgres";

export type PlaceDirectItemResult =
  | { ok: true; learningPlan: LearningPlanView }
  | { ok: false; error: "not_found" | "conflict" };

interface DirectItemInput {
  db: Database;
  userId: UserId;
  learningPlanId: LearningPlanId;
  itemId: ItemId;
}

const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

/** Search one owned Plan's Library drawer with truthful placement context. */
export async function searchItemCandidates({
  db,
  userId,
  learningPlanId,
  query,
}: Omit<DirectItemInput, "itemId"> & {
  query: string;
}): Promise<LearningPlanItemCandidate[] | null> {
  const [ownedPlan] = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(
      and(
        eq(learningPlans.id, learningPlanId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);
  if (!ownedPlan) return null;

  const predicates = [eq(items.userId, userId), activeItem()];
  if (query) {
    predicates.push(ilike(items.title, `%${escapeLikePattern(query)}%`));
  }
  const rows = await db
    .select({
      ...ITEM_PROJECTION,
      placementNodeId: learningPlanItemPlacements.nodeId,
      placementStageId: learningPlanItemPlacements.stageId,
      stageName: stages.name,
    })
    .from(items)
    .leftJoin(
      learningPlanItemPlacements,
      and(
        eq(learningPlanItemPlacements.itemId, items.id),
        eq(learningPlanItemPlacements.userId, userId),
        eq(learningPlanItemPlacements.learningPlanId, learningPlanId),
      ),
    )
    .leftJoin(stages, eq(stages.id, learningPlanItemPlacements.stageId))
    .where(and(...predicates))
    .orderBy(asc(items.title), asc(items.id))
    .limit(10);

  return rows.map((row): LearningPlanItemCandidate => {
    const item = toItem(row);
    if (row.placementNodeId) return { kind: "direct", item };
    if (row.placementStageId && row.stageName) {
      return {
        kind: "stage",
        item,
        stage: {
          id: row.placementStageId as StageId,
          name: row.stageName,
        },
      };
    }
    return { kind: "available", item };
  });
}

/** Place one shared Item directly in a Learning Plan, idempotently. */
export async function placeDirectItem({
  db,
  userId,
  learningPlanId,
  itemId,
}: DirectItemInput): Promise<PlaceDirectItemResult> {
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
      );

      const [ownedEnds] = await tx
        .select({ learningPlanId: learningPlans.id })
        .from(learningPlans)
        .innerJoin(
          items,
          and(eq(items.id, itemId), eq(items.userId, userId), activeItem()),
        )
        .where(
          and(
            eq(learningPlans.id, learningPlanId),
            eq(learningPlans.userId, userId),
          ),
        )
        .limit(1);
      if (!ownedEnds) return { kind: "not_found" } as const;

      const [existing] = await tx
        .select({ nodeId: learningPlanItemPlacements.nodeId })
        .from(learningPlanItemPlacements)
        .where(
          and(
            eq(learningPlanItemPlacements.userId, userId),
            eq(learningPlanItemPlacements.learningPlanId, learningPlanId),
            eq(learningPlanItemPlacements.itemId, itemId),
          ),
        )
        .limit(1);
      if (existing) {
        return existing.nodeId
          ? ({ kind: "placed" } as const)
          : ({ kind: "conflict" } as const);
      }

      const [node] = await tx
        .insert(learningPlanNodes)
        .values({ userId, learningPlanId, kind: PlanNodeKind.Item })
        .returning({ id: learningPlanNodes.id });
      if (!node)
        throw new Error("Learning Plan node insert returned no record");

      await tx.insert(learningPlanItemPlacements).values({
        userId,
        learningPlanId,
        itemId,
        nodeId: node.id,
        nodeKind: PlanNodeKind.Item,
      });
      return { kind: "placed" } as const;
    });

    if (result.kind === "not_found" || result.kind === "conflict") {
      return { ok: false, error: result.kind };
    }
    const learningPlan = await getLearningPlan(db, userId, learningPlanId);
    if (!learningPlan) return { ok: false, error: "not_found" };
    return { ok: true, learningPlan };
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

/** Remove a direct placement while preserving the shared Item everywhere else. */
export async function removeDirectItem({
  db,
  userId,
  learningPlanId,
  itemId,
}: DirectItemInput): Promise<PlaceDirectItemResult> {
  const [ownedEnds] = await db
    .select({ learningPlanId: learningPlans.id })
    .from(learningPlans)
    .innerJoin(
      items,
      and(eq(items.id, itemId), eq(items.userId, userId), activeItem()),
    )
    .where(
      and(
        eq(learningPlans.id, learningPlanId),
        eq(learningPlans.userId, userId),
      ),
    )
    .limit(1);
  if (!ownedEnds) return { ok: false, error: "not_found" };

  const [placement] = await db
    .select({ nodeId: learningPlanItemPlacements.nodeId })
    .from(learningPlanItemPlacements)
    .where(
      and(
        eq(learningPlanItemPlacements.userId, userId),
        eq(learningPlanItemPlacements.learningPlanId, learningPlanId),
        eq(learningPlanItemPlacements.itemId, itemId),
      ),
    )
    .limit(1);
  if (placement && !placement.nodeId) {
    return { ok: false, error: "conflict" };
  }
  if (placement?.nodeId) {
    await db
      .delete(learningPlanNodes)
      .where(
        and(
          eq(learningPlanNodes.id, placement.nodeId as PlanNodeId),
          eq(learningPlanNodes.userId, userId),
          eq(learningPlanNodes.learningPlanId, learningPlanId),
        ),
      );
  }

  const learningPlan = await getLearningPlan(db, userId, learningPlanId);
  if (!learningPlan) return { ok: false, error: "not_found" };
  return { ok: true, learningPlan };
}
