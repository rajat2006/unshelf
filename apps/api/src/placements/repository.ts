import { and, asc, eq, ilike, inArray, notExists, sql } from "drizzle-orm";
import type {
  ItemId,
  ItemPlacementCatalog,
  ItemPlacementTrail,
  StopItemCandidate,
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

const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

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
 * Search the owned Library beneath one owned Stop.
 *
 * Current members are absent because the Stop renders them above this intake.
 * The capped result is presentation-ordered by title and stable Item identity.
 */
export async function searchStopItemCandidates(
  db: Database,
  input: { userId: UserId; stopId: StopId; query: string },
): Promise<StopItemCandidate[] | null> {
  const [destination] = await db
    .select({ trailId: stops.trailId })
    .from(stops)
    .where(and(eq(stops.id, input.stopId), eq(stops.userId, input.userId)))
    .limit(1);
  if (!destination) return null;

  const currentMembership = db
    .select({ itemId: stopItems.itemId })
    .from(stopItems)
    .where(
      and(
        eq(stopItems.stopId, input.stopId),
        eq(stopItems.itemId, items.id),
        eq(stopItems.userId, input.userId),
      ),
    );
  const predicates = [
    eq(items.userId, input.userId),
    notExists(currentMembership),
  ];
  if (input.query) {
    predicates.push(ilike(items.title, `%${escapeLikePattern(input.query)}%`));
  }

  const candidates = await db
    .select({ id: items.id, title: items.title, type: items.type })
    .from(items)
    .where(and(...predicates))
    .orderBy(asc(items.title), asc(items.id))
    .limit(10);
  if (candidates.length === 0) return [];

  const conflicts = await db
    .select({
      itemId: stopItems.itemId,
      stopId: stops.id,
      stopName: stops.name,
    })
    .from(stopItems)
    .innerJoin(stops, eq(stops.id, stopItems.stopId))
    .where(
      and(
        eq(stopItems.userId, input.userId),
        eq(stopItems.trailId, destination.trailId),
        inArray(
          stopItems.itemId,
          candidates.map(({ id }) => id),
        ),
      ),
    );
  const conflictByItem = new Map(
    conflicts.map((conflict) => [conflict.itemId, conflict]),
  );

  return candidates.map((candidate) => {
    const conflict = conflictByItem.get(candidate.id);
    return conflict
      ? {
          kind: "conflict",
          ...candidate,
          id: candidate.id as ItemId,
          stop: {
            id: conflict.stopId as StopId,
            name: conflict.stopName,
          },
        }
      : {
          kind: "available",
          ...candidate,
          id: candidate.id as ItemId,
        };
  });
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
