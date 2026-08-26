import { and, asc, eq, exists, sql } from "drizzle-orm";
import {
  Status,
  StatusMode,
  type CreatePartsRequest,
  type ItemDetail,
  type ItemId,
  type PartId,
  type ReorderPartsRequest,
  type UpdatePartCompletionRequest,
  type UpdatePartRequest,
  type UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { refreshTodayEntrySnapshot } from "../daily-focus/snapshots";
import { activeItem } from "../items/active-item";
import { getItem } from "../items/repository";
import { items, parts } from "../schema";

const activeOwnedItemExists = (
  db: Database,
  input: { userId: UserId; itemId: ItemId },
) =>
  exists(
    db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.id, input.itemId),
          eq(items.userId, input.userId),
          activeItem(),
        ),
      ),
  );

export async function createParts(
  db: Database,
  input: { userId: UserId; itemId: ItemId; request: CreatePartsRequest },
): Promise<ItemDetail | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.itemId}, 0))`,
    );
    const owned = await tx
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.id, input.itemId),
          eq(items.userId, input.userId),
          activeItem(),
        ),
      )
      .limit(1);
    if (!owned[0]) return null;

    const existing = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(parts)
      .where(
        and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)),
      );
    const start = existing[0].count;
    await tx.insert(parts).values(
      input.request.titles.map((title, offset) => ({
        userId: input.userId,
        itemId: input.itemId,
        title,
        position: start + offset,
      })),
    );
    if (start > 0) await deriveItemStatus(tx, input);
    await refreshTodayEntrySnapshot(tx, input);

    return getItem(tx, input.userId, input.itemId);
  });
}

export async function updatePart(
  db: Database,
  input: {
    userId: UserId;
    itemId: ItemId;
    partId: PartId;
    request: UpdatePartRequest;
  },
): Promise<ItemDetail | null> {
  const changed = await db
    .update(parts)
    .set({ title: input.request.title })
    .where(
      and(
        eq(parts.id, input.partId),
        eq(parts.itemId, input.itemId),
        eq(parts.userId, input.userId),
        activeOwnedItemExists(db, input),
      ),
    )
    .returning({ id: parts.id });
  return changed[0] ? getItem(db, input.userId, input.itemId) : null;
}

export async function reorderParts(
  db: Database,
  input: {
    userId: UserId;
    itemId: ItemId;
    request: ReorderPartsRequest;
  },
): Promise<"ok" | "not_found" | "conflict"> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.itemId}, 0))`,
    );
    const owned = await tx
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.id, input.itemId),
          eq(items.userId, input.userId),
          activeItem(),
        ),
      )
      .limit(1);
    if (!owned[0]) return "not_found";

    const current = await tx
      .select({ id: parts.id })
      .from(parts)
      .where(
        and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)),
      );
    const currentIds = new Set(current.map(({ id }) => id));
    if (
      currentIds.size !== input.request.partIds.length ||
      input.request.partIds.some((partId) => !currentIds.has(partId))
    ) {
      return "conflict";
    }

    await tx
      .update(parts)
      .set({ position: sql`${parts.position} + ${current.length}` })
      .where(
        and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)),
      );
    for (const [position, partId] of input.request.partIds.entries()) {
      await tx
        .update(parts)
        .set({ position })
        .where(
          and(
            eq(parts.id, partId),
            eq(parts.itemId, input.itemId),
            eq(parts.userId, input.userId),
          ),
        );
    }
    return "ok";
  });
}

export async function updatePartCompletion(
  db: Database,
  input: {
    userId: UserId;
    itemId: ItemId;
    partId: PartId;
    request: UpdatePartCompletionRequest;
  },
): Promise<ItemDetail | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.itemId}, 0))`,
    );
    const current = await tx
      .select({ completed: parts.completed })
      .from(parts)
      .innerJoin(
        items,
        and(
          eq(items.id, parts.itemId),
          eq(items.userId, parts.userId),
          activeItem(),
        ),
      )
      .where(
        and(
          eq(parts.id, input.partId),
          eq(parts.itemId, input.itemId),
          eq(parts.userId, input.userId),
        ),
      )
      .limit(1);
    if (!current[0]) return null;
    if (current[0].completed === input.request.completed) {
      return getItem(tx, input.userId, input.itemId);
    }

    await tx
      .update(parts)
      .set({ completed: input.request.completed })
      .where(
        and(
          eq(parts.id, input.partId),
          eq(parts.itemId, input.itemId),
          eq(parts.userId, input.userId),
          activeOwnedItemExists(tx, input),
        ),
      );
    await deriveItemStatus(tx, input);
    await refreshTodayEntrySnapshot(tx, input);
    return getItem(tx, input.userId, input.itemId);
  });
}

export async function removePart(
  db: Database,
  input: { userId: UserId; itemId: ItemId; partId: PartId },
): Promise<ItemDetail | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.itemId}, 0))`,
    );
    const removed = await tx
      .delete(parts)
      .where(
        and(
          eq(parts.id, input.partId),
          eq(parts.itemId, input.itemId),
          eq(parts.userId, input.userId),
          activeOwnedItemExists(tx, input),
        ),
      )
      .returning({ id: parts.id });
    if (!removed[0]) return null;

    const remaining = await tx
      .select({ id: parts.id })
      .from(parts)
      .where(
        and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)),
      )
      .orderBy(asc(parts.position));
    if (remaining.length > 0) {
      await tx
        .update(parts)
        .set({ position: sql`${parts.position} + ${remaining.length + 1}` })
        .where(
          and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)),
        );
      for (const [position, part] of remaining.entries()) {
        await tx
          .update(parts)
          .set({ position })
          .where(and(eq(parts.id, part.id), eq(parts.userId, input.userId)));
      }
      await deriveItemStatus(tx, input);
    } else {
      await tx
        .update(items)
        .set({ statusMode: StatusMode.Manual })
        .where(
          and(
            eq(items.id, input.itemId),
            eq(items.userId, input.userId),
            activeItem(),
          ),
        );
    }
    await refreshTodayEntrySnapshot(tx, input);
    return getItem(tx, input.userId, input.itemId);
  });
}

async function deriveItemStatus(
  db: Database,
  input: { userId: UserId; itemId: ItemId },
): Promise<void> {
  const counts = await db
    .select({
      completed: sql<number>`count(*) filter (where ${parts.completed})::integer`,
      total: sql<number>`count(*)::integer`,
    })
    .from(parts)
    .where(and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)));
  const status =
    counts[0].completed === 0
      ? Status.NotStarted
      : counts[0].completed === counts[0].total
        ? Status.Done
        : Status.InProgress;
  await db
    .update(items)
    .set({
      completedAt: sql<Date | null>`case
        when ${items.status} <> 'done' and ${status} = 'done' then now()
        when ${items.status} = 'done' and ${status} <> 'done' then null
        else ${items.completedAt}
      end`,
      status,
      statusMode: StatusMode.Automatic,
    })
    .where(
      and(
        eq(items.id, input.itemId),
        eq(items.userId, input.userId),
        activeItem(),
      ),
    );
}

export const getStructuredItem = (
  db: Database,
  input: { userId: UserId; itemId: ItemId },
) => getItem(db, input.userId, input.itemId);
