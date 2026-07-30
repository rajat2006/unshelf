import { asc, eq } from "drizzle-orm";
import type {
  CreateLabelRequest,
  Label,
  LabelId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { labels } from "../schema";

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
  db: Database,
  userId: UserId,
  input: CreateLabelRequest,
): Promise<Label> {
  const [row] = await db
    .insert(labels)
    .values({ userId, name: input.name })
    .returning({
      id: labels.id,
      user_id: labels.userId,
      name: labels.name,
    });
  return toLabel(row);
}

export async function listLabels(
  db: Database,
  userId: UserId,
): Promise<Label[]> {
  const rows = await db
    .select({
      id: labels.id,
      user_id: labels.userId,
      name: labels.name,
    })
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.name), asc(labels.id));
  return rows.map(toLabel);
}
