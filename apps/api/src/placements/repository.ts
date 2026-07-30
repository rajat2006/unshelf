import { and, asc, eq, sql } from "drizzle-orm";
import type {
  ItemId,
  ItemPlacementCatalog,
  ItemPlacementTrail,
  StopDetail,
  StopId,
  TrailId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { items, stopItems, stops, trails } from "../schema";
import { getStop } from "../stops/repository";

export type PlaceItemInStopResult =
  | { ok: true; stop: StopDetail }
  | { ok: false; error: "not_found" | "conflict" };

interface PlaceItemInStopInput {
  userId: UserId;
  stopId: StopId;
  itemId: ItemId;
}

/**
 * Read every owned Trail exactly once for one owned Item.
 *
 * A Trail already containing the Item is mutually exclusive with its destination
 * list, while every other Trail remains available even when it has no Stops yet.
 */
export async function getItemPlacementCatalog(
  db: Database,
  input: { userId: UserId; itemId: ItemId },
): Promise<ItemPlacementCatalog | null> {
  const [ownedItem] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)))
    .limit(1);
  if (!ownedItem) return null;

  const trailRows = await db
    .select({ id: trails.id, name: trails.name })
    .from(trails)
    .where(eq(trails.userId, input.userId))
    .orderBy(asc(trails.createdAt), asc(trails.id));
  const stopRows = await db
    .select({
      id: stops.id,
      name: stops.name,
      trailId: stops.trailId,
      placed: sql<boolean>`exists (
        select 1
        from ${stopItems}
        where ${stopItems.stopId} = ${stops.id}
          and ${stopItems.itemId} = ${input.itemId}
          and ${stopItems.userId} = ${input.userId}
      )`,
    })
    .from(stops)
    .where(eq(stops.userId, input.userId))
    .orderBy(asc(stops.name), asc(stops.id));

  const catalogTrails: ItemPlacementTrail[] = trailRows.map((trail) => {
    const trailStops = stopRows.filter((stop) => stop.trailId === trail.id);
    const placed = trailStops.find((stop) => stop.placed);
    const trailIdentity = {
      id: trail.id as TrailId,
      name: trail.name,
    };
    if (placed) {
      return {
        kind: "placed",
        trail: trailIdentity,
        stop: { id: placed.id as StopId, name: placed.name },
      };
    }
    return {
      kind: "available",
      trail: trailIdentity,
      stops: trailStops.map((stop) => ({
        id: stop.id as StopId,
        name: stop.name,
      })),
    };
  });

  return { itemId: input.itemId, trails: catalogTrails };
}

/**
 * Place one owned Item into one owned Stop.
 *
 * An Item can appear on several Trails, but only once on any one Trail. A repeat
 * placement into the same Stop is idempotent; another Stop on that Trail is a
 * conflict that leaves the first membership untouched.
 */
export async function placeItemInStop(
  db: Database,
  input: PlaceItemInStopInput,
): Promise<PlaceItemInStopResult> {
  const [destination] = await db
    .select({ trailId: stops.trailId })
    .from(stops)
    .innerJoin(
      items,
      and(eq(items.id, input.itemId), eq(items.userId, input.userId)),
    )
    .where(and(eq(stops.id, input.stopId), eq(stops.userId, input.userId)))
    .limit(1);
  if (!destination) return { ok: false, error: "not_found" };

  const [existing] = await db
    .select({ stopId: stopItems.stopId })
    .from(stopItems)
    .where(
      and(
        eq(stopItems.itemId, input.itemId),
        eq(stopItems.userId, input.userId),
        eq(stopItems.trailId, destination.trailId),
      ),
    )
    .limit(1);

  if (existing && existing.stopId !== input.stopId) {
    return { ok: false, error: "conflict" };
  }

  if (!existing) {
    await db
      .insert(stopItems)
      .values({
        userId: input.userId,
        stopId: input.stopId,
        itemId: input.itemId,
        trailId: destination.trailId,
      })
      .onConflictDoNothing();

    const [settled] = await db
      .select({ stopId: stopItems.stopId })
      .from(stopItems)
      .where(
        and(
          eq(stopItems.itemId, input.itemId),
          eq(stopItems.userId, input.userId),
          eq(stopItems.trailId, destination.trailId),
        ),
      )
      .limit(1);
    if (settled?.stopId !== input.stopId) {
      return { ok: false, error: "conflict" };
    }
  }

  const stop = await getStop(db, input.userId, input.stopId);
  return stop ? { ok: true, stop } : { ok: false, error: "not_found" };
}

/**
 * Remove one Item–Stop membership without changing the Item or its placements on
 * other Trails. Repeating removal is idempotent; only a missing or foreign Stop
 * fails the private boundary.
 */
export async function removeItemFromStop(
  db: Database,
  input: { userId: UserId; stopId: StopId; itemId: ItemId },
): Promise<StopDetail | null> {
  await db
    .delete(stopItems)
    .where(
      and(
        eq(stopItems.stopId, input.stopId),
        eq(stopItems.itemId, input.itemId),
        eq(stopItems.userId, input.userId),
      ),
    );
  return getStop(db, input.userId, input.stopId);
}
