import { sql } from "drizzle-orm";
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

export interface ItemRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  title: string;
  source: string | null;
  type: Type;
  status: Status;
  target_date: string | null;
  past_target: boolean;
  completed_at: string | null;
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
export const ITEM_PROJECTION = sql.raw(`items.id, items.user_id, items.title,
                         items.source, items.type, items.status,
                         items.target_date::text AS target_date,
                         (COALESCE(items.target_date < CURRENT_DATE, false)
                          AND items.status <> 'done') AS past_target,
                         items.completed_at,
                         COALESCE((
                           SELECT jsonb_agg(
                             jsonb_build_object(
                               'id', labels.id,
                               'userId', labels.user_id,
                               'name', labels.name
                             ) ORDER BY labels.name, labels.id
                           )
                           FROM item_labels
                           JOIN labels ON labels.id = item_labels.label_id
                           WHERE item_labels.item_id = items.id
                             AND item_labels.user_id = items.user_id
                         ), '[]'::jsonb) AS labels`);

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
  const { rows } = await db.execute<ItemRow>(sql`
    INSERT INTO items (user_id, title, source, type)
    VALUES (${userId}, ${input.title}, ${source}, ${input.type})
    RETURNING ${ITEM_PROJECTION}
  `);
  return toItem(rows[0]!);
}

/** All for a User: every Item where `user_id = me`, and only that User's. */
export async function listItems(db: Database, userId: UserId): Promise<Item[]> {
  const { rows } = await db.execute<ItemRow>(sql`
    SELECT ${ITEM_PROJECTION}
    FROM items
    WHERE user_id = ${userId}
  `);
  return rows.map(toItem);
}

/** Read one Item through both its stable identity and authenticated owner. */
export async function getItem(
  db: Database,
  userId: UserId,
  itemId: ItemId,
): Promise<Item | null> {
  const { rows } = await db.execute<ItemRow>(sql`
    SELECT ${ITEM_PROJECTION}
    FROM items
    WHERE id = ${itemId} AND user_id = ${userId}
  `);
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
  const { rows } = await db.execute<ItemRow>(sql`
    UPDATE items
    SET completed_at = CASE
          WHEN status <> 'done' AND ${status} = 'done' THEN now()
          WHEN status = 'done' AND ${status} <> 'done' THEN NULL
          ELSE completed_at
        END,
        status = ${status}
    WHERE id = ${itemId} AND user_id = ${userId}
    RETURNING ${ITEM_PROJECTION}
  `);
  return rows[0] ? toItem(rows[0]) : null;
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
  const { rows } = await db.execute<ItemRow>(sql`
    UPDATE items
    SET target_date = ${targetDate}::date
    WHERE id = ${itemId} AND user_id = ${userId}
    RETURNING ${ITEM_PROJECTION}
  `);
  return rows[0] ? toItem(rows[0]) : null;
}

/** Apply one owned Label to one owned Item; repeating the request is a no-op. */
export async function applyLabelToItem(
  db: Database,
  userId: UserId,
  itemId: ItemId,
  labelId: LabelId,
): Promise<Item | null> {
  const { rows } = await db.execute(sql`
    INSERT INTO item_labels (user_id, item_id, label_id)
    SELECT ${userId}, items.id, labels.id
    FROM items, labels
    WHERE items.id = ${itemId} AND labels.id = ${labelId}
      AND items.user_id = ${userId} AND labels.user_id = ${userId}
    ON CONFLICT (item_id, label_id) DO UPDATE
      SET user_id = EXCLUDED.user_id
    RETURNING item_id
  `);
  return rows.length > 0 ? getItem(db, userId, itemId) : null;
}

/** Remove only Label membership; repeating removal preserves the requested set. */
export async function removeLabelFromItem(
  db: Database,
  userId: UserId,
  itemId: ItemId,
  labelId: LabelId,
): Promise<Item | null> {
  const { rows } = await db.execute<{ allowed: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM items, labels
      WHERE items.id = ${itemId} AND labels.id = ${labelId}
        AND items.user_id = ${userId} AND labels.user_id = ${userId}
    ) AS allowed
  `);
  if (!rows[0]?.allowed) return null;

  await db.execute(sql`
    DELETE FROM item_labels
    WHERE item_id = ${itemId} AND label_id = ${labelId} AND user_id = ${userId}
  `);
  return getItem(db, userId, itemId);
}
