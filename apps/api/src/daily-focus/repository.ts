import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { deriveItemCompletion } from "@unshelf/shared";
import type {
  AddDailyFocusItemRequest,
  DailyFocus,
  DailyFocusEntry,
  DailyFocusHistory,
  DailyFocusHistoryEntry,
  DailyFocusId,
  DailyFocusOrigin,
  DailyFocusSnapshot,
  ItemId,
  LearningPlanId,
  StageId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { refreshTodayEntrySnapshot } from "./snapshots";
import { ITEM_PROJECTION, toItem } from "../items/repository";
import {
  dailyFocuses,
  dailyFocusItemOrigins,
  dailyFocusItems,
  items,
  learningPlanItemPlacements,
  learningPlans,
  stages,
} from "../schema";

interface DailyFocusIdentityRow {
  id: string;
  user_id: string;
  date: string;
}

async function ensureTodayFocus(
  db: Database,
  userId: UserId,
): Promise<DailyFocusIdentityRow> {
  const [focus] = await db
    .insert(dailyFocuses)
    .values({ userId, date: sql`current_date` })
    .onConflictDoUpdate({
      target: [dailyFocuses.userId, dailyFocuses.date],
      set: { userId },
    })
    .returning({
      id: dailyFocuses.id,
      user_id: dailyFocuses.userId,
      date: sql<string>`${dailyFocuses.date}::text`,
    });
  return focus;
}

async function readDailyFocus(
  db: Database,
  row: DailyFocusIdentityRow,
): Promise<DailyFocus> {
  const itemRows = await db
    .select({
      ...ITEM_PROJECTION,
      originLearningPlanId: learningPlans.id,
      originLearningPlanName: learningPlans.name,
      originStageId: stages.id,
      originStageName: stages.name,
      titleSnapshot: dailyFocusItems.titleSnapshot,
      typeSnapshot: dailyFocusItems.typeSnapshot,
      statusSnapshot: dailyFocusItems.statusSnapshot,
      partPercentageSnapshot: dailyFocusItems.partPercentageSnapshot,
    })
    .from(dailyFocusItems)
    .innerJoin(
      items,
      and(
        eq(items.id, dailyFocusItems.itemId),
        eq(items.userId, dailyFocusItems.userId),
      ),
    )
    .leftJoin(
      dailyFocusItemOrigins,
      and(
        eq(dailyFocusItemOrigins.dailyFocusId, dailyFocusItems.dailyFocusId),
        eq(dailyFocusItemOrigins.userId, dailyFocusItems.userId),
        eq(dailyFocusItemOrigins.itemId, dailyFocusItems.itemId),
      ),
    )
    .leftJoin(
      learningPlanItemPlacements,
      and(
        eq(learningPlanItemPlacements.id, dailyFocusItemOrigins.placementId),
        eq(learningPlanItemPlacements.userId, dailyFocusItemOrigins.userId),
        eq(learningPlanItemPlacements.itemId, dailyFocusItemOrigins.itemId),
      ),
    )
    .leftJoin(
      learningPlans,
      and(
        eq(learningPlans.id, learningPlanItemPlacements.learningPlanId),
        eq(learningPlans.userId, learningPlanItemPlacements.userId),
      ),
    )
    .leftJoin(
      stages,
      and(
        eq(stages.id, learningPlanItemPlacements.stageId),
        eq(stages.userId, learningPlanItemPlacements.userId),
      ),
    )
    .where(
      and(
        eq(dailyFocusItems.dailyFocusId, row.id),
        eq(dailyFocusItems.userId, row.user_id),
      ),
    )
    .orderBy(asc(dailyFocusItems.addedAt), asc(dailyFocusItems.itemId));
  const entries = itemRows.map((itemRow): DailyFocusEntry => {
    const item = toItem(itemRow);
    return {
      item,
      snapshot: {
        title: itemRow.titleSnapshot,
        type: itemRow.typeSnapshot,
        status: itemRow.statusSnapshot,
        partPercentage: itemRow.partPercentageSnapshot,
      },
      origin:
        itemRow.originLearningPlanId && itemRow.originLearningPlanName
          ? {
              learningPlan: {
                id: itemRow.originLearningPlanId as LearningPlanId,
                name: itemRow.originLearningPlanName,
              },
              stage:
                itemRow.originStageId && itemRow.originStageName
                  ? {
                      id: itemRow.originStageId as StageId,
                      name: itemRow.originStageName,
                    }
                  : null,
            }
          : null,
    };
  });
  return {
    id: row.id as DailyFocusId,
    userId: row.user_id as UserId,
    date: row.date,
    entries,
    ...deriveItemCompletion(entries.map((entry) => entry.item)),
  };
}

async function readDailyFocusHistory(
  db: Database,
  row: DailyFocusIdentityRow,
): Promise<DailyFocusHistory> {
  const itemRows = await db
    .select({
      itemId: dailyFocusItems.itemId,
      deletedAt: items.deletedAt,
      titleSnapshot: dailyFocusItems.titleSnapshot,
      typeSnapshot: dailyFocusItems.typeSnapshot,
      statusSnapshot: dailyFocusItems.statusSnapshot,
      partPercentageSnapshot: dailyFocusItems.partPercentageSnapshot,
      originLearningPlanId: learningPlans.id,
      originLearningPlanName: learningPlans.name,
      originStageId: stages.id,
      originStageName: stages.name,
    })
    .from(dailyFocusItems)
    .innerJoin(
      items,
      and(
        eq(items.id, dailyFocusItems.itemId),
        eq(items.userId, dailyFocusItems.userId),
      ),
    )
    .leftJoin(
      dailyFocusItemOrigins,
      and(
        eq(dailyFocusItemOrigins.dailyFocusId, dailyFocusItems.dailyFocusId),
        eq(dailyFocusItemOrigins.userId, dailyFocusItems.userId),
        eq(dailyFocusItemOrigins.itemId, dailyFocusItems.itemId),
      ),
    )
    .leftJoin(
      learningPlanItemPlacements,
      and(
        eq(learningPlanItemPlacements.id, dailyFocusItemOrigins.placementId),
        eq(learningPlanItemPlacements.userId, dailyFocusItemOrigins.userId),
        eq(learningPlanItemPlacements.itemId, dailyFocusItemOrigins.itemId),
      ),
    )
    .leftJoin(
      learningPlans,
      and(
        eq(learningPlans.id, learningPlanItemPlacements.learningPlanId),
        eq(learningPlans.userId, learningPlanItemPlacements.userId),
      ),
    )
    .leftJoin(
      stages,
      and(
        eq(stages.id, learningPlanItemPlacements.stageId),
        eq(stages.userId, learningPlanItemPlacements.userId),
      ),
    )
    .where(
      and(
        eq(dailyFocusItems.dailyFocusId, row.id),
        eq(dailyFocusItems.userId, row.user_id),
      ),
    )
    .orderBy(asc(dailyFocusItems.addedAt), asc(dailyFocusItems.itemId));

  const entries = itemRows.map((itemRow): DailyFocusHistoryEntry => {
    const snapshot: DailyFocusSnapshot = {
      title: itemRow.titleSnapshot,
      type: itemRow.typeSnapshot,
      status: itemRow.statusSnapshot,
      partPercentage: itemRow.partPercentageSnapshot,
    };
    if (itemRow.deletedAt) return { kind: "deleted", snapshot };
    return {
      kind: "available",
      itemId: itemRow.itemId as ItemId,
      snapshot,
      origin: toOrigin(itemRow),
    };
  });
  return {
    id: row.id as DailyFocusId,
    userId: row.user_id as UserId,
    date: row.date,
    entries,
    ...deriveItemCompletion(entries.map((entry) => entry.snapshot)),
  };
}

function toOrigin({
  originLearningPlanId,
  originLearningPlanName,
  originStageId,
  originStageName,
}: {
  originLearningPlanId: string | null;
  originLearningPlanName: string | null;
  originStageId: string | null;
  originStageName: string | null;
}): DailyFocusOrigin | null {
  return originLearningPlanId && originLearningPlanName
    ? {
        learningPlan: {
          id: originLearningPlanId as LearningPlanId,
          name: originLearningPlanName,
        },
        stage:
          originStageId && originStageName
            ? { id: originStageId as StageId, name: originStageName }
            : null,
      }
    : null;
}

export type AddTodayItemResult =
  | { ok: true; added: boolean; focus: DailyFocus }
  | { ok: false; error: "not_found" };

/** Explicitly add one owned Item to the database's current calendar date. */
export async function addTodayItem({
  db,
  userId,
  itemId,
  origin,
}: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
  origin: AddDailyFocusItemRequest["origin"];
}): Promise<AddTodayItemResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${itemId}, 0))`,
    );
    const [ownedItem] = await tx
      .select({
        id: items.id,
        title: items.title,
        type: items.type,
        status: items.status,
      })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.userId, userId)))
      .limit(1);
    if (!ownedItem) return { ok: false, error: "not_found" };

    const [originPlacement] = origin
      ? await tx
          .select({ id: learningPlanItemPlacements.id })
          .from(learningPlanItemPlacements)
          .innerJoin(
            learningPlans,
            and(
              eq(learningPlans.id, learningPlanItemPlacements.learningPlanId),
              eq(learningPlans.userId, learningPlanItemPlacements.userId),
            ),
          )
          .where(
            and(
              eq(learningPlanItemPlacements.userId, userId),
              eq(
                learningPlanItemPlacements.learningPlanId,
                origin.learningPlanId,
              ),
              eq(learningPlanItemPlacements.itemId, itemId),
              origin.stageId
                ? eq(learningPlanItemPlacements.stageId, origin.stageId)
                : isNull(learningPlanItemPlacements.stageId),
            ),
          )
          .limit(1)
      : [];
    if (origin && !originPlacement) {
      return { ok: false, error: "not_found" };
    }

    const focus = await ensureTodayFocus(tx, userId);
    const inserted = await tx
      .insert(dailyFocusItems)
      .values({
        dailyFocusId: focus.id,
        userId,
        itemId,
        titleSnapshot: ownedItem.title,
        typeSnapshot: ownedItem.type,
        statusSnapshot: ownedItem.status,
        partPercentageSnapshot: null,
      })
      .onConflictDoNothing()
      .returning({ itemId: dailyFocusItems.itemId });
    await refreshTodayEntrySnapshot(tx, { userId, itemId });

    if (originPlacement) {
      await tx
        .insert(dailyFocusItemOrigins)
        .values({
          dailyFocusId: focus.id,
          userId,
          itemId,
          placementId: originPlacement.id,
        })
        .onConflictDoUpdate({
          target: [
            dailyFocusItemOrigins.dailyFocusId,
            dailyFocusItemOrigins.itemId,
          ],
          set: { placementId: originPlacement.id },
        });
    }

    return {
      ok: true,
      added: inserted.length > 0,
      focus: await readDailyFocus(tx, focus),
    };
  });
}

/** Read today's focus through current shared Item facts, creating an empty shell if needed. */
export async function getTodayFocus(
  db: Database,
  userId: UserId,
): Promise<DailyFocus> {
  return db.transaction(async (tx) => {
    const focus = await ensureTodayFocus(tx, userId);
    return readDailyFocus(tx, focus);
  });
}

/** Read one elapsed focus without creating a record for an absent date. */
export async function getHistoricalFocus({
  db,
  userId,
  date,
}: {
  db: Database;
  userId: UserId;
  date: string;
}): Promise<DailyFocusHistory | null> {
  const [focus] = await db
    .select({
      id: dailyFocuses.id,
      user_id: dailyFocuses.userId,
      date: sql<string>`${dailyFocuses.date}::text`,
    })
    .from(dailyFocuses)
    .where(
      and(
        eq(dailyFocuses.userId, userId),
        eq(dailyFocuses.date, date),
        sql`${dailyFocuses.date} < current_date`,
      ),
    )
    .limit(1);
  return focus ? readDailyFocusHistory(db, focus) : null;
}

/** Remove only current focus membership, never the shared Item itself. */
export async function removeTodayItem({
  db,
  userId,
  dailyFocusId,
  itemId,
}: {
  db: Database;
  userId: UserId;
  dailyFocusId: DailyFocusId;
  itemId: ItemId;
}): Promise<DailyFocus | null> {
  return db.transaction(async (tx) => {
    const [focus] = await tx
      .select({
        id: dailyFocuses.id,
        user_id: dailyFocuses.userId,
        date: sql<string>`${dailyFocuses.date}::text`,
      })
      .from(dailyFocuses)
      .where(
        and(
          eq(dailyFocuses.id, dailyFocusId),
          eq(dailyFocuses.userId, userId),
          sql`${dailyFocuses.date} = current_date`,
        ),
      )
      .limit(1);
    if (!focus) return null;

    const removed = await tx
      .delete(dailyFocusItems)
      .where(
        and(
          eq(dailyFocusItems.dailyFocusId, dailyFocusId),
          eq(dailyFocusItems.userId, userId),
          eq(dailyFocusItems.itemId, itemId),
        ),
      )
      .returning({ itemId: dailyFocusItems.itemId });
    return removed.length > 0 ? readDailyFocus(tx, focus) : null;
  });
}
