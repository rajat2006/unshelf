import { and, eq } from "drizzle-orm";
import type {
  CreateStopWithItemRequest,
  ItemId,
  StopDetail,
  StopId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { items, stopItems, stops, trails } from "../schema";
import { getStop } from "../stops/repository";

export type CreateStopWithItemResult =
  | { ok: true; stop: StopDetail }
  | { ok: false; error: "not_found" | "conflict" };

/**
 * Create one ordinary, unconnected Stop and its first Item membership as one
 * command. Both ends are resolved under the authenticated User inside the same
 * transaction, so a missing/foreign end or a failed membership never leaves an
 * empty Stop behind.
 */
export async function createStopWithItem(
  db: Database,
  input: {
    userId: UserId;
    itemId: ItemId;
    placement: CreateStopWithItemRequest;
  },
): Promise<CreateStopWithItemResult> {
  try {
    return await db.transaction(async (tx) => {
      const [ownedEnds] = await tx
        .select({ trailId: trails.id })
        .from(trails)
        .innerJoin(
          items,
          and(eq(items.id, input.itemId), eq(items.userId, input.userId)),
        )
        .where(
          and(
            eq(trails.id, input.placement.trailId),
            eq(trails.userId, input.userId),
          ),
        )
        .limit(1);
      if (!ownedEnds) return { ok: false, error: "not_found" };

      const [existing] = await tx
        .select({ stopId: stopItems.stopId })
        .from(stopItems)
        .where(
          and(
            eq(stopItems.userId, input.userId),
            eq(stopItems.itemId, input.itemId),
            eq(stopItems.trailId, input.placement.trailId),
          ),
        )
        .limit(1);
      if (existing) return { ok: false, error: "conflict" };

      const [created] = await tx
        .insert(stops)
        .values({
          userId: input.userId,
          trailId: input.placement.trailId,
          name: input.placement.name,
        })
        .returning({ id: stops.id });
      if (!created) throw new Error("Stop insert returned no record");

      await tx.insert(stopItems).values({
        userId: input.userId,
        stopId: created.id,
        itemId: input.itemId,
        trailId: input.placement.trailId,
      });

      const stop = await getStop(tx, input.userId, created.id as StopId);
      if (!stop) throw new Error("Created Stop could not be read");
      return { ok: true, stop };
    });
  } catch (error: unknown) {
    if (isSameTrailMembershipConflict(error)) {
      return { ok: false, error: "conflict" };
    }
    throw error;
  }
}

function isSameTrailMembershipConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const postgresError = error as Error & {
    code?: unknown;
    constraint?: unknown;
  };
  return (
    postgresError.code === "23505" &&
    postgresError.constraint === "stop_items_item_trail_unique"
  );
}
