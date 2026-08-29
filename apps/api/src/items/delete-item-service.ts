import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { CandidateState, type ItemId, type UserId } from "@unshelf/shared";
import type { Database } from "../db";
import {
  dailyFocuses,
  dailyFocusItems,
  dailyPlanningSuppressions,
  discoverCandidates,
  discoverProviderResults,
  itemProviderIdentities,
  itemLabels,
  items,
  learningPlanItemPlacements,
  learningPlanNodes,
  parts,
} from "../schema";

export type DeleteItemResult = { ok: true } | { ok: false; error: "not_found" };

/** Permanently end one owned Item, or accept replay against its tombstone. */
export async function deleteItem({
  db,
  userId,
  itemId,
}: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
}): Promise<DeleteItemResult> {
  return db.transaction(async (tx) => {
    const [ownedRow] = await tx
      .select({ deletedAt: items.deletedAt })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.userId, userId)))
      .for("update")
      .limit(1);
    if (!ownedRow) return { ok: false, error: "not_found" };
    if (ownedRow.deletedAt) return { ok: true };

    const providerIdentities = await tx
      .select({
        provider: itemProviderIdentities.provider,
        externalId: itemProviderIdentities.externalId,
      })
      .from(itemProviderIdentities)
      .where(
        and(
          eq(itemProviderIdentities.userId, userId),
          eq(itemProviderIdentities.itemId, itemId),
        ),
      );
    for (const identity of providerIdentities) {
      const matchingResults = await tx
        .select({ id: discoverProviderResults.id })
        .from(discoverProviderResults)
        .where(
          and(
            eq(discoverProviderResults.provider, identity.provider),
            eq(discoverProviderResults.externalId, identity.externalId),
          ),
        );
      const resultIds = matchingResults.map(({ id }) => id);
      if (resultIds.length > 0) {
        await tx
          .delete(discoverCandidates)
          .where(
            and(
              eq(discoverCandidates.userId, userId),
              eq(discoverCandidates.state, CandidateState.Kept),
              inArray(discoverCandidates.resultId, resultIds),
            ),
          );
      }
    }
    await tx
      .delete(itemProviderIdentities)
      .where(
        and(
          eq(itemProviderIdentities.userId, userId),
          eq(itemProviderIdentities.itemId, itemId),
        ),
      );

    const currentFocuses = tx
      .select({ id: dailyFocuses.id })
      .from(dailyFocuses)
      .where(
        and(
          eq(dailyFocuses.userId, userId),
          eq(dailyFocuses.date, sql`current_date`),
        ),
      );
    await tx
      .delete(dailyFocusItems)
      .where(
        and(
          eq(dailyFocusItems.userId, userId),
          eq(dailyFocusItems.itemId, itemId),
          inArray(dailyFocusItems.dailyFocusId, currentFocuses),
        ),
      );
    await tx
      .delete(dailyPlanningSuppressions)
      .where(
        and(
          eq(dailyPlanningSuppressions.userId, userId),
          eq(dailyPlanningSuppressions.itemId, itemId),
        ),
      );
    await tx
      .delete(itemLabels)
      .where(and(eq(itemLabels.userId, userId), eq(itemLabels.itemId, itemId)));
    await tx
      .delete(parts)
      .where(and(eq(parts.userId, userId), eq(parts.itemId, itemId)));

    const directPlacements = await tx
      .select({ nodeId: learningPlanItemPlacements.nodeId })
      .from(learningPlanItemPlacements)
      .where(
        and(
          eq(learningPlanItemPlacements.userId, userId),
          eq(learningPlanItemPlacements.itemId, itemId),
          isNotNull(learningPlanItemPlacements.nodeId),
        ),
      );
    const directNodeIds = directPlacements.flatMap(({ nodeId }) =>
      nodeId ? [nodeId] : [],
    );
    if (directNodeIds.length > 0) {
      await tx
        .delete(learningPlanNodes)
        .where(
          and(
            eq(learningPlanNodes.userId, userId),
            inArray(learningPlanNodes.id, directNodeIds),
          ),
        );
    }
    await tx
      .delete(learningPlanItemPlacements)
      .where(
        and(
          eq(learningPlanItemPlacements.userId, userId),
          eq(learningPlanItemPlacements.itemId, itemId),
        ),
      );

    await tx
      .update(items)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(items.id, itemId), eq(items.userId, userId)));
    return { ok: true };
  });
}
