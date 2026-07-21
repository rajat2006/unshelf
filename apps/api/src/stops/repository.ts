import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CreateStopRequest,
  Item,
  ItemId,
  Stop,
  StopDetail,
  StopId,
  TrailId,
  UserId,
} from "@unshelf/shared";
import type { Database } from "../db";
import { ITEM_PROJECTION, toItem, type ItemRow } from "../items/repository";
import { items, stopItems, stops, trails } from "../schema";

/**
 * Stop storage (ADR-0004). A Stop is a flat, unordered set of references to the
 * Item spine, so nothing about an Item is written here — a membership is only its
 * two ends, and everything the Stop shows about an Item is read back off the Item
 * itself through the one shared projection.
 *
 * Every function takes the authenticated User's anchor id and scopes to it, so a
 * foreign Stop or Item is indistinguishable from a missing one at the boundary.
 */

interface StopRow {
  id: string;
  user_id: string;
  name: string;
}

const toStop = (row: StopRow): Stop => ({
  id: row.id as StopId,
  userId: row.user_id as UserId,
  name: row.name,
});

/**
 * Create an empty, named Stop on one of the User's Trails (ADR-0014). A Stop
 * belongs to exactly one Trail, so creation first resolves that Trail under the
 * authenticated User and only inserts after the ownership check succeeds. When
 * the Trail is not this User's the lookup finds nothing, so this returns null and
 * the router answers 404, exactly as a missing Trail does. The schema's composite
 * owner foreign key remains the database backstop, and the name is stored exactly
 * as given.
 */
export async function createStop(
  db: Database,
  userId: UserId,
  trailId: TrailId,
  input: CreateStopRequest,
): Promise<Stop | null> {
  const ownedTrail = await db
    .select({ id: trails.id })
    .from(trails)
    .where(and(eq(trails.id, trailId), eq(trails.userId, userId)))
    .limit(1);
  if (!ownedTrail[0]) return null;

  const rows = await db
    .insert(stops)
    .values({ userId, trailId, name: input.name })
    .returning({ id: stops.id, user_id: stops.userId, name: stops.name });
  const stop = rows[0];
  return stop ? toStop(stop) : null;
}

/**
 * Every Stop belonging to a User, and only that User's. Ordered by name for the
 * same reason a Stop's Items are: Stops carry no order of their own (that is the
 * Trail's job, ADR-0004), so this is only a display convenience — but an
 * unordered read is free to shuffle between refreshes, and a list that reorders
 * itself under the User reads as change where nothing changed.
 */
export async function listStops(db: Database, userId: UserId): Promise<Stop[]> {
  const rows = await db
    .select({ id: stops.id, user_id: stops.userId, name: stops.name })
    .from(stops)
    .where(eq(stops.userId, userId))
    .orderBy(asc(stops.name));
  return rows.map(toStop);
}

/**
 * One Stop with its Items, or null when the Stop is not this User's.
 *
 * The Items are selected from `items` with membership as a subquery rather than a
 * join: it keeps exactly one `items` in scope, so `ITEM_PROJECTION` reads here
 * precisely as it does in All. The ordering is `ORDER BY title` — a display
 * convenience for a set with no order of its own (ADR-0004), chosen so the list
 * at least does not shuffle between reads. The `user_id` predicate is redundant
 * once the Stop is known to be the User's (membership can only ever join same-User
 * ends) and is kept as the belt to that braces: every read of `items` in this
 * codebase names its User.
 */
export async function getStop(
  db: Database,
  userId: UserId,
  stopId: StopId,
): Promise<StopDetail | null> {
  return getStopInScope(db, userId, stopId, null);
}

async function getStopInScope(
  db: Database,
  userId: UserId,
  stopId: StopId,
  trailId: TrailId | null,
): Promise<StopDetail | null> {
  const predicates = [eq(stops.id, stopId), eq(stops.userId, userId)];
  if (trailId) predicates.push(eq(stops.trailId, trailId));
  const rows = await db
    .select({ id: stops.id, user_id: stops.userId, name: stops.name })
    .from(stops)
    .where(and(...predicates))
    .limit(1);
  const stop = rows[0];
  if (!stop) return null;

  return { ...toStop(stop), items: await listItemsIn(db, userId, stopId) };
}

/**
 * Read Stop detail only when the URL's Trail and Stop belong together. Both ids
 * are resolved under the authenticated User so a mismatch, a foreign id, and a
 * missing id all collapse to the same null result.
 */
export async function getStopOnTrail(
  db: Database,
  userId: UserId,
  trailId: TrailId,
  stopId: StopId,
): Promise<StopDetail | null> {
  return getStopInScope(db, userId, stopId, trailId);
}

async function listItemsIn(
  db: Database,
  userId: UserId,
  stopId: StopId,
): Promise<Item[]> {
  const memberItemIds = db
    .select({ itemId: stopItems.itemId })
    .from(stopItems)
    .where(
      and(eq(stopItems.stopId, stopId), eq(stopItems.userId, userId)),
    );
  const rows: ItemRow[] = await db
    .select(ITEM_PROJECTION)
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, memberItemIds)))
    .orderBy(asc(items.title));
  return rows.map(toItem);
}

/**
 * Pull an Item into a Stop, returning the Stop's new contents — or null when
 * either end is not this User's.
 *
 * The insert selects both ends under a single `user_id`, which is what makes
 * membership incapable of crossing tenants: there is no pairing of a Stop and an
 * Item belonging to different Users that this statement can write, so neither
 * "add my Item to your Stop" nor "add your Item to my Stop" has a code path.
 *
 * `ON CONFLICT` makes a repeat add a no-op — membership is a set, so adding an
 * Item already in the Stop is a request for a state that already holds, not an
 * error. The no-op `DO UPDATE` (rather than `DO NOTHING`) is what makes the
 * distinction we actually need visible: it returns a row for the already-a-member
 * case, so an empty result means one and only one thing — a Stop or Item this
 * User does not have, which is the 404.
 */
export async function addItemToStop(
  db: Database,
  userId: UserId,
  stopId: StopId,
  itemId: ItemId,
): Promise<StopDetail | null> {
  const ownedMembership = db
    .select({ userId: stops.userId, stopId: stops.id, itemId: items.id })
    .from(stops)
    .innerJoin(
      items,
      and(eq(items.id, itemId), eq(items.userId, userId)),
    )
    .where(and(eq(stops.id, stopId), eq(stops.userId, userId)));
  const rows = await db
    .insert(stopItems)
    .select(ownedMembership)
    .onConflictDoUpdate({
      target: [stopItems.stopId, stopItems.itemId],
      set: { userId },
    })
    .returning({ stopId: stopItems.stopId });
  if (rows.length === 0) return null;
  return getStop(db, userId, stopId);
}

/**
 * Remove an Item from a Stop, returning the Stop's new contents — or null when
 * the Stop is not this User's.
 *
 * Only the membership goes: the Item keeps its Status, its dates, its place in
 * All, and every other Stop it belongs to. Deleting a membership that is not
 * there succeeds, because the caller asked for a state ("that Item is not in this
 * Stop") that already holds — a set has no notion of removing something twice.
 * A Stop that is not this User's is the one real failure, and it 404s.
 *
 * The delete names the User directly on the membership. Composite owner foreign
 * keys guarantee that this is also the User on both the Stop and Item, while the
 * `getStop` that follows reports a foreign Stop as missing. One User's request can
 * therefore neither read nor alter another's membership.
 */
export async function removeItemFromStop(
  db: Database,
  userId: UserId,
  stopId: StopId,
  itemId: ItemId,
): Promise<StopDetail | null> {
  await db
    .delete(stopItems)
    .where(
      and(
        eq(stopItems.stopId, stopId),
        eq(stopItems.itemId, itemId),
        eq(stopItems.userId, userId),
      ),
    );
  return getStop(db, userId, stopId);
}
