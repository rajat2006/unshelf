import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  Type,
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
import { getItem } from "../items/repository";
import { items, parts, partConfirmationReceipts } from "../schema";

export async function createParts(
  db: Database,
  input: { userId: UserId; itemId: ItemId; request: CreatePartsRequest },
): Promise<ItemDetail | null> {
  const result = await createPartsAtomically(db, input);
  return result.ok ? result.item : null;
}

export async function createPartsAtomically(
  db: Database,
  input: {
    userId: UserId;
    itemId: ItemId;
    request: CreatePartsRequest;
    confirmationKey?: string;
  },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.itemId}, 0))`,
    );
    const owned = await tx
      .select({ id: items.id, type: items.type })
      .from(items)
      .where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)))
      .limit(1);
    if (!owned[0]) return { ok: false as const, error: "not_found" as const };

    const payloadDigest = createHash("sha256")
      .update(JSON.stringify(input.request.titles))
      .digest("hex");
    if (input.confirmationKey) {
      const [receipt] = await tx
        .select()
        .from(partConfirmationReceipts)
        .where(
          and(
            eq(partConfirmationReceipts.userId, input.userId),
            eq(partConfirmationReceipts.itemId, input.itemId),
            eq(partConfirmationReceipts.confirmationKey, input.confirmationKey),
          ),
        );
      if (receipt) {
        if (receipt.payloadDigest !== payloadDigest)
          return { ok: false as const, error: "conflict" as const };
        return {
          ok: true as const,
          item: (await getItem(tx, input.userId, input.itemId))!,
        };
      }
    }

    const existing = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(parts)
      .where(
        and(eq(parts.itemId, input.itemId), eq(parts.userId, input.userId)),
      );
    const start = existing[0].count;
    if (input.confirmationKey && (start > 0 || owned[0].type !== Type.Book)) {
      return { ok: false as const, error: "conflict" as const };
    }
    await tx.insert(parts).values(
      input.request.titles.map((title, offset) => ({
        userId: input.userId,
        itemId: input.itemId,
        title,
        position: start + offset,
      })),
    );
    if (input.confirmationKey) {
      await tx.insert(partConfirmationReceipts).values({
        userId: input.userId,
        itemId: input.itemId,
        confirmationKey: input.confirmationKey,
        payloadDigest,
      });
    }
    if (start > 0) await deriveItemStatus(tx, input);
    await refreshTodayEntrySnapshot(tx, input);

    return {
      ok: true as const,
      item: (await getItem(tx, input.userId, input.itemId))!,
    };
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
      .where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)))
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
        .where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)));
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
    .where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)));
}

export const getStructuredItem = (
  db: Database,
  input: { userId: UserId; itemId: ItemId },
) => getItem(db, input.userId, input.itemId);
