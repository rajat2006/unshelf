import type { Pool } from "pg";
import type {
  CreateItemRequest,
  Item,
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
  completed_at: Date | null;
}

const toItem = (row: ItemRow): Item => ({
  id: row.id,
  userId: row.user_id as UserId,
  title: row.title,
  source: row.source,
  type: row.type,
  status: row.status,
  targetDate: row.target_date,
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
     RETURNING id, user_id, title, source, type, status,
               target_date::text AS target_date, completed_at`,
    [userId, input.title, source, input.type],
  );
  return toItem(rows[0]!);
}

/**
 * All for a User: every Item where `user_id = me` and only that User's (ADR-0003).
 * There is no folder machinery — this query *is* All.
 */
export async function listItems(pool: Pool, userId: UserId): Promise<Item[]> {
  const { rows } = await pool.query<ItemRow>(
    `SELECT id, user_id, title, source, type, status,
            target_date::text AS target_date, completed_at
     FROM items
     WHERE user_id = $1`,
    [userId],
  );
  return rows.map(toItem);
}
