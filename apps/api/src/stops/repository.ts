import type { Pool } from "pg";
import type {
  CreateStopRequest,
  Item,
  ItemId,
  Stop,
  StopDetail,
  StopId,
  UserId,
} from "@unshelf/shared";
import { ITEM_PROJECTION, toItem, type ItemRow } from "../items/repository";

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

/** Create an empty, named Stop for a User. The name is stored exactly as given. */
export async function createStop(
  pool: Pool,
  userId: UserId,
  input: CreateStopRequest,
): Promise<Stop> {
  const { rows } = await pool.query<StopRow>(
    `INSERT INTO stops (user_id, name)
     VALUES ($1, $2)
     RETURNING id, user_id, name`,
    [userId, input.name],
  );
  return toStop(rows[0]!);
}

/**
 * Every Stop belonging to a User, and only that User's. Ordered by name for the
 * same reason a Stop's Items are: Stops carry no order of their own (that is the
 * Trail's job, ADR-0004), so this is only a display convenience — but an
 * unordered read is free to shuffle between refreshes, and a list that reorders
 * itself under the User reads as change where nothing changed.
 */
export async function listStops(pool: Pool, userId: UserId): Promise<Stop[]> {
  const { rows } = await pool.query<StopRow>(
    `SELECT id, user_id, name
     FROM stops
     WHERE user_id = $1
     ORDER BY name`,
    [userId],
  );
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
  pool: Pool,
  userId: UserId,
  stopId: StopId,
): Promise<StopDetail | null> {
  const { rows } = await pool.query<StopRow>(
    `SELECT id, user_id, name
     FROM stops
     WHERE id = $1 AND user_id = $2`,
    [stopId, userId],
  );
  const stop = rows[0];
  if (!stop) return null;

  return { ...toStop(stop), items: await listItemsIn(pool, userId, stopId) };
}

async function listItemsIn(
  pool: Pool,
  userId: UserId,
  stopId: StopId,
): Promise<Item[]> {
  const { rows } = await pool.query<ItemRow>(
    `SELECT ${ITEM_PROJECTION}
     FROM items
     WHERE user_id = $1
       AND id IN (
         SELECT item_id FROM stop_items WHERE stop_id = $2 AND user_id = $1
       )
     ORDER BY title`,
    [userId, stopId],
  );
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
  pool: Pool,
  userId: UserId,
  stopId: StopId,
  itemId: ItemId,
): Promise<StopDetail | null> {
  const { rows } = await pool.query(
    `INSERT INTO stop_items (user_id, stop_id, item_id)
     SELECT $3, stops.id, items.id
     FROM stops, items
     WHERE stops.id = $1 AND items.id = $2
       AND stops.user_id = $3 AND items.user_id = $3
     ON CONFLICT (stop_id, item_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING stop_id`,
    [stopId, itemId, userId],
  );
  if (rows.length === 0) return null;
  return getStop(pool, userId, stopId);
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
  pool: Pool,
  userId: UserId,
  stopId: StopId,
  itemId: ItemId,
): Promise<StopDetail | null> {
  await pool.query(
    `DELETE FROM stop_items
     WHERE stop_id = $1 AND item_id = $2 AND user_id = $3`,
    [stopId, itemId, userId],
  );
  return getStop(pool, userId, stopId);
}
