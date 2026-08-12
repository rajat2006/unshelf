import { and, asc, eq, sql } from "drizzle-orm";
import { deriveItemCompletion } from "@unshelf/shared";
import type { DailyFocus, DailyFocusId, ItemId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import { ITEM_PROJECTION, toItem } from "../items/repository";
import { dailyFocuses, dailyFocusItems, items } from "../schema";

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
    .select(ITEM_PROJECTION)
    .from(dailyFocusItems)
    .innerJoin(
      items,
      and(
        eq(items.id, dailyFocusItems.itemId),
        eq(items.userId, dailyFocusItems.userId),
      ),
    )
    .where(
      and(
        eq(dailyFocusItems.dailyFocusId, row.id),
        eq(dailyFocusItems.userId, row.user_id),
      ),
    )
    .orderBy(asc(dailyFocusItems.addedAt), asc(dailyFocusItems.itemId));
  const focusItems = itemRows.map(toItem);
  return {
    id: row.id as DailyFocusId,
    userId: row.user_id as UserId,
    date: row.date,
    items: focusItems,
    ...deriveItemCompletion(focusItems),
  };
}

export type AddTodayItemResult =
  | { ok: true; added: boolean; focus: DailyFocus }
  | { ok: false; error: "not_found" };

/** Explicitly add one owned Item to the database's current calendar date. */
export async function addTodayItem({
  db,
  userId,
  itemId,
}: {
  db: Database;
  userId: UserId;
  itemId: ItemId;
}): Promise<AddTodayItemResult> {
  return db.transaction(async (tx) => {
    const [ownedItem] = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.userId, userId)))
      .limit(1);
    if (!ownedItem) return { ok: false, error: "not_found" };

    const focus = await ensureTodayFocus(tx, userId);
    const inserted = await tx
      .insert(dailyFocusItems)
      .values({ dailyFocusId: focus.id, userId, itemId })
      .onConflictDoNothing()
      .returning({ itemId: dailyFocusItems.itemId });

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
