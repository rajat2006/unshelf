import type { Pool } from "pg";
import type {
  CreateLabelRequest,
  Label,
  LabelId,
  UserId,
} from "@unshelf/shared";

interface LabelRow {
  id: string;
  user_id: string;
  name: string;
}

const toLabel = (row: LabelRow): Label => ({
  id: row.id as LabelId,
  userId: row.user_id as UserId,
  name: row.name,
});

export async function createLabel(
  pool: Pool,
  userId: UserId,
  input: CreateLabelRequest,
): Promise<Label> {
  const { rows } = await pool.query<LabelRow>(
    `INSERT INTO labels (user_id, name)
     VALUES ($1, $2)
     RETURNING id, user_id, name`,
    [userId, input.name],
  );
  return toLabel(rows[0]!);
}

export async function listLabels(
  pool: Pool,
  userId: UserId,
): Promise<Label[]> {
  const { rows } = await pool.query<LabelRow>(
    `SELECT id, user_id, name
     FROM labels
     WHERE user_id = $1
     ORDER BY name, id`,
    [userId],
  );
  return rows.map(toLabel);
}
