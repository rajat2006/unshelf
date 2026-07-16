import type { Pool } from "pg";
import type {
  CreateItemRequest,
  Item,
  ItemId,
  Status,
  Type,
  UserId,
} from "@unshelf/shared";

interface ItemRow {
  id: string;
  user_id: string;
  title: string;
  source: string | null;
  type: Type;
  status: Status;
  target_date: string | null;
  past_target: boolean;
  completed_at: Date | null;
}

/**
 * Every read of an Item goes through this one projection, so *past target* is
 * computed the same way everywhere and can never disagree with itself.
 *
 * It is derived here, in the read, rather than stored (ADR-0005): the state is a
 * question about today, and today moves on its own. A column would need a job to
 * keep it honest at midnight — this needs nothing, because there is nothing to go
 * stale. `COALESCE` makes a missing date simply not past, rather than unknown.
 * "Today" is the database's, the single clock all Users are compared against.
 */
const ITEM_PROJECTION = `id, user_id, title, source, type, status,
                         target_date::text AS target_date,
                         (COALESCE(target_date < CURRENT_DATE, false)
                          AND status <> 'done') AS past_target,
                         completed_at`;

const toItem = (row: ItemRow): Item => ({
  id: row.id as ItemId,
  userId: row.user_id as UserId,
  title: row.title,
  source: row.source,
  type: row.type,
  status: row.status,
  targetDate: row.target_date,
  pastTarget: row.past_target,
  completedAt: row.completed_at ? row.completed_at.toISOString() : null,
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
  pool: Pool,
  userId: UserId,
  input: CreateItemRequest,
): Promise<Item> {
  const source = input.source ?? null;
  const { rows } = await pool.query<ItemRow>(
    `INSERT INTO items (user_id, title, source, type)
     VALUES ($1, $2, $3, $4)
     RETURNING ${ITEM_PROJECTION}`,
    [userId, input.title, source, input.type],
  );
  return toItem(rows[0]!);
}

/** All for a User: every Item where `user_id = me`, and only that User's. */
export async function listItems(pool: Pool, userId: UserId): Promise<Item[]> {
  const { rows } = await pool.query<ItemRow>(
    `SELECT ${ITEM_PROJECTION}
     FROM items
     WHERE user_id = $1`,
    [userId],
  );
  return rows.map(toItem);
}

/**
 * Change an Item's single shared Status. Completion is banked only when entering
 * done and cleared when leaving it; writing the current Status again preserves
 * the original completion moment. The User predicate makes a foreign Item
 * indistinguishable from a missing one at the API boundary.
 */
export async function updateItemStatus(
  pool: Pool,
  userId: UserId,
  itemId: ItemId,
  status: Status,
): Promise<Item | null> {
  const { rows } = await pool.query<ItemRow>(
    `UPDATE items
     SET completed_at = CASE
           WHEN status <> 'done' AND $3 = 'done' THEN now()
           WHEN status = 'done' AND $3 <> 'done' THEN NULL
           ELSE completed_at
         END,
         status = $3
     WHERE id = $1 AND user_id = $2
     RETURNING ${ITEM_PROJECTION}`,
    [itemId, userId, status],
  );
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
  pool: Pool,
  userId: UserId,
  itemId: ItemId,
  targetDate: string | null,
): Promise<Item | null> {
  const { rows } = await pool.query<ItemRow>(
    `UPDATE items
     SET target_date = $3::date
     WHERE id = $1 AND user_id = $2
     RETURNING ${ITEM_PROJECTION}`,
    [itemId, userId, targetDate],
  );
  return rows[0] ? toItem(rows[0]) : null;
}
