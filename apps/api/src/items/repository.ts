import { and, eq, sql } from "drizzle-orm";
import type {
  CreateItemRequest,
  Item,
  ItemId,
  Label,
  LabelId,
  Status,
  Type,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { itemLabels, items, labels } from "../schema";

export interface ItemRow {
  id: string;
  user_id: string;
  title: string;
  source: string | null;
  type: Type;
  status: Status;
  target_date: string | null;
  past_target: boolean;
  completed_at: Date | null;
  labels: Label[];
}

/**
 * Every read of an Item goes through this one projection, so *past target* is
 * computed the same way everywhere and can never disagree with itself. Reading an
 * Item inside a Stop is the same read as reading it in All — the Stop repository
 * imports this rather than writing its own, so a Stop can never show a User an
 * Item that disagrees with All about its own state.
 *
 * It is derived here, in the read, rather than stored (ADR-0005): the state is a
 * question about today, and today moves on its own. A column would need a job to
 * keep it honest at midnight — this needs nothing, because there is nothing to go
 * stale. `COALESCE` makes a missing date simply not past, rather than unknown.
 * "Today" is the database's, the single clock all Users are compared against.
 *
 * Columns are qualified against `items`; Stop and Label membership stay in
 * subqueries so this projection still reads the same shared Item at every seam.
 */
export const ITEM_PROJECTION = {
  id: items.id,
  user_id: items.userId,
  title: items.title,
  source: items.source,
  type: items.type,
  status: items.status,
  target_date: sql<string | null>`${items.targetDate}::text`,
  past_target: sql<boolean>`(
    coalesce(${items.targetDate} < current_date, false)
    and ${items.status} <> 'done'
  )`,
  completed_at: items.completedAt,
  labels: sql<Label[]>`coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', labels.id,
        'userId', labels.user_id,
        'name', labels.name
      ) order by labels.name, labels.id
    )
    from item_labels
    join labels on labels.id = item_labels.label_id
    where item_labels.item_id = items.id
      and item_labels.user_id = items.user_id
  ), '[]'::jsonb)`,
} as const;

export const toItem = (row: ItemRow): Item => ({
  id: row.id as ItemId,
  userId: row.user_id as UserId,
  title: row.title,
  source: row.source,
  type: row.type,
  status: row.status,
  targetDate: row.target_date,
  pastTarget: row.past_target,
  completedAt: row.completed_at
    ? new Date(row.completed_at).toISOString()
    : null,
  labels: row.labels,
});

/**
 * Capture an Item for a User — the one uniform manual insert (ADR-0007). Title
 * and type land exactly as given; `source` is stored verbatim and unvalidated when
 * supplied, while an omitted source becomes NULL. Nothing is fetched or mutated;
 * `status` defaults to *not started* and the same input twice yields two distinct
 * rows (no dedupe, ADR-0003). Scoped to `userId`, which is never taken from the
 * client — the caller passes the authenticated User's anchor id.
 */
export async function createItem(
  db: Database,
  userId: UserId,
  input: CreateItemRequest,
): Promise<Item> {
  const source = input.source ?? null;
  const rows = await db
    .insert(items)
    .values({ userId, title: input.title, source, type: input.type })
    .returning({ id: items.id });
  return (await getItem(db, userId, rows[0]!.id as ItemId))!;
}

/** All for a User: every Item where `user_id = me`, and only that User's. */
export async function listItems(db: Database, userId: UserId): Promise<Item[]> {
  const rows = await db
    .select(ITEM_PROJECTION)
    .from(items)
    .where(eq(items.userId, userId));
  return rows.map(toItem);
}

/** Read one Item through both its stable identity and authenticated owner. */
export async function getItem(
  db: Database,
  userId: UserId,
  itemId: ItemId,
): Promise<Item | null> {
  const rows = await db
    .select(ITEM_PROJECTION)
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);
  return rows[0] ? toItem(rows[0]) : null;
}

/**
 * Change an Item's single shared Status. Completion is banked only when entering
 * done and cleared when leaving it; writing the current Status again preserves
 * the original completion moment. The User predicate makes a foreign Item
 * indistinguishable from a missing one at the API boundary.
 */
export async function updateItemStatus(
  db: Database,
  userId: UserId,
  itemId: ItemId,
  status: Status,
): Promise<Item | null> {
  const rows = await db
    .update(items)
    .set({
      completedAt: sql<Date | null>`case
        when ${items.status} <> 'done' and ${status} = 'done' then now()
        when ${items.status} = 'done' and ${status} <> 'done' then null
        else ${items.completedAt}
      end`,
      status,
    })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows[0] ? getItem(db, userId, itemId) : null;
}

/**
 * Set, change, or clear an Item's one soft Target date — `null` clears it. The
 * date is only ever written here: Status changes leave it alone, so a finished
 * Item keeps the date as history (ADR-0005). Nothing is scheduled off this write;
 * *past target* follows from the stored date on the next read. The User predicate
 * makes a foreign Item indistinguishable from a missing one at the API boundary.
 */
export async function updateItemTargetDate(
  db: Database,
  userId: UserId,
  itemId: ItemId,
  targetDate: string | null,
): Promise<Item | null> {
  const rows = await db
    .update(items)
    .set({ targetDate })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows[0] ? getItem(db, userId, itemId) : null;
}

/** Apply one owned Label to one owned Item; repeating the request is a no-op. */
export async function applyLabelToItem(
  db: Database,
  userId: UserId,
  itemId: ItemId,
  labelId: LabelId,
): Promise<Item | null> {
  const ownedMembership = db
    .select({ userId: items.userId, itemId: items.id, labelId: labels.id })
    .from(items)
    .innerJoin(labels, and(eq(labels.id, labelId), eq(labels.userId, userId)))
    .where(and(eq(items.id, itemId), eq(items.userId, userId)));
  const rows = await db
    .insert(itemLabels)
    .select(ownedMembership)
    .onConflictDoUpdate({
      target: [itemLabels.itemId, itemLabels.labelId],
      set: { userId },
    })
    .returning({ itemId: itemLabels.itemId });
  return rows.length > 0 ? getItem(db, userId, itemId) : null;
}

/** Remove only Label membership; repeating removal preserves the requested set. */
export async function removeLabelFromItem(
  db: Database,
  userId: UserId,
  itemId: ItemId,
  labelId: LabelId,
): Promise<Item | null> {
  const allowed = await db
    .select({ itemId: items.id })
    .from(items)
    .innerJoin(labels, and(eq(labels.id, labelId), eq(labels.userId, userId)))
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);
  if (!allowed[0]) return null;

  await db
    .delete(itemLabels)
    .where(
      and(
        eq(itemLabels.itemId, itemId),
        eq(itemLabels.labelId, labelId),
        eq(itemLabels.userId, userId),
      ),
    );
  return getItem(db, userId, itemId);
}
