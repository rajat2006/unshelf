import { sql } from "drizzle-orm";
import type {
  CreateLabelRequest,
  Label,
  LabelId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";

interface LabelRow extends Record<string, unknown> {
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
  db: Database,
  userId: UserId,
  input: CreateLabelRequest,
): Promise<Label> {
  const { rows } = await db.execute<LabelRow>(sql`
    INSERT INTO labels (user_id, name)
    VALUES (${userId}, ${input.name})
    RETURNING id, user_id, name
  `);
  return toLabel(rows[0]!);
}

export async function listLabels(
  db: Database,
  userId: UserId,
): Promise<Label[]> {
  const { rows } = await db.execute<LabelRow>(sql`
    SELECT id, user_id, name
    FROM labels
    WHERE user_id = ${userId}
    ORDER BY name, id
  `);
  return rows.map(toLabel);
}
