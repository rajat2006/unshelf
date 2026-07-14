import type { Pool } from "pg";
import type {
  CreateItemRequest,
  Item,
  ItemStatus,
  ItemType,
} from "@unshelf/shared";

interface ItemRow {
  id: string;
  user_id: string;
  title: string;
  source: string | null;
  type: ItemType;
  status: ItemStatus;
  target_date: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

const toItem = (row: ItemRow): Item => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  source: row.source,
  type: row.type,
  status: row.status,
  // A DATE column comes back as a `Date` at UTC midnight; keep only the calendar
  // day so a soft target never drifts across a timezone.
  targetDate: row.target_date
    ? row.target_date.toISOString().slice(0, 10)
    : null,
  completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
});

/**
 * Capture an Item for a User — the one uniform manual insert (ADR-0007). Title
 * and type land exactly as given; `source` is stored verbatim and unvalidated (a
 * blank or omitted link becomes NULL). Nothing is fetched and nothing is mutated;
 * `status` defaults to *not started* and the same input twice yields two distinct
 * rows (no dedupe, ADR-0003). Scoped to `userId`, which is never taken from the
 * client — the caller passes the authenticated User's anchor id.
 */
export async function createItem(
  pool: Pool,
  userId: string,
  input: CreateItemRequest,
): Promise<Item> {
  const source = input.source && input.source.length > 0 ? input.source : null;
  const { rows } = await pool.query<ItemRow>(
    `INSERT INTO items (user_id, title, source, type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, title, source, type, status,
               target_date, completed_at, created_at`,
    [userId, input.title, source, input.type],
  );
  return toItem(rows[0]!);
}

/**
 * All for a User: every Item where `user_id = me` and only that User's (ADR-0003).
 * There is no folder machinery — this query *is* All. Newest capture first so the
 * list reads most-recent-on-top.
 */
export async function listItems(pool: Pool, userId: string): Promise<Item[]> {
  const { rows } = await pool.query<ItemRow>(
    `SELECT id, user_id, title, source, type, status,
            target_date, completed_at, created_at
     FROM items
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.map(toItem);
}
