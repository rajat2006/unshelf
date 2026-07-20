import type {
  AddStopItemRequest,
  ConnectStopsRequest,
  CreateItemRequest,
  CreateStopRequest,
  CreateTrailRequest,
  Item,
  ItemId,
  Status,
  Stop,
  StopDetail,
  StopId,
  Trail,
  TrailId,
  TrailView,
  UpdateItemStatusRequest,
  UpdateItemTargetDateRequest,
} from "@unshelf/shared";
import type { CurrentUser } from "./application-auth";

/**
 * The thin api client the web uses for its authenticated calls. Every request
 * carries the current User's bearer token so the api resolves it to *this* User's
 * space (the tenancy round-trip T2 established); the caller passes the
 * `useCurrentUser()` handle rather than importing Clerk here.
 */

async function requestJson<ResponseBody>(
  user: CurrentUser,
  path: string,
  init?: RequestInit,
): Promise<ResponseBody> {
  const token = await user.getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw new Error(`api responded ${response.status}`);
  return (await response.json()) as ResponseBody;
}

/** Fetch All — every Item belonging to the current User. */
export async function fetchAll(user: CurrentUser): Promise<Item[]> {
  return requestJson<Item[]>(user, "/api/items");
}

/** Capture an Item — the one uniform insert (ADR-0007). Returns the new Item. */
export async function captureItem(
  user: CurrentUser,
  input: CreateItemRequest,
): Promise<Item> {
  return requestJson<Item>(user, "/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Change the Item-level Status shared by every place the Item appears. */
export async function updateItemStatus(
  user: CurrentUser,
  itemId: ItemId,
  status: Status,
): Promise<Item> {
  const body: UpdateItemStatusRequest = { status };
  return requestJson<Item>(user, `/api/items/${itemId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Set, change, or clear the Item's one soft Target date — `null` clears it.
 * Returns the Item, whose `pastTarget` the api has recomputed for this read.
 */
export async function updateItemTargetDate(
  user: CurrentUser,
  itemId: ItemId,
  targetDate: string | null,
): Promise<Item> {
  const body: UpdateItemTargetDateRequest = { targetDate };
  return requestJson<Item>(user, `/api/items/${itemId}/target-date`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Every Trail the current User owns, each with derived progress (ADR-0014). The
 * Trails index lists these; the layout is the api's, the order oldest-first.
 */
export async function fetchTrails(user: CurrentUser): Promise<Trail[]> {
  return requestJson<Trail[]>(user, "/api/trails");
}

/** Create a Trail. It starts with no Stops, so it reads back at 0/0 progress. */
export async function createTrail(
  user: CurrentUser,
  input: CreateTrailRequest,
): Promise<Trail> {
  return requestJson<Trail>(user, "/api/trails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Every Stop belonging to the current User. */
export async function fetchStops(user: CurrentUser): Promise<Stop[]> {
  return requestJson<Stop[]>(user, "/api/stops");
}

/**
 * Create a Stop on one Trail — a Stop belongs to exactly one Trail (ADR-0014,
 * #94), so creation names the Trail it lands on. It starts empty; Items are
 * pulled into it from the Library.
 */
export async function createStop(
  user: CurrentUser,
  trailId: TrailId,
  input: CreateStopRequest,
): Promise<Stop> {
  return requestJson<Stop>(user, `/api/trails/${trailId}/stops`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** One Stop with its Items, each carrying the Status every view of it shares. */
export async function fetchStop(
  user: CurrentUser,
  stopId: StopId,
): Promise<StopDetail> {
  return requestJson<StopDetail>(user, `/api/stops/${stopId}`);
}

/** Read a Stop only in the Trail context named by its detail URL. */
export async function fetchTrailStop(
  user: CurrentUser,
  trailId: TrailId,
  stopId: StopId,
): Promise<StopDetail> {
  return requestJson<StopDetail>(
    user,
    `/api/trails/${trailId}/stops/${stopId}`,
  );
}

/**
 * Pull an Item from All into a Stop — a reference, never a copy, so the Item
 * stays in All and in any other Stop. Returns the Stop's new contents.
 */
export async function addItemToStop(
  user: CurrentUser,
  stopId: StopId,
  itemId: ItemId,
): Promise<StopDetail> {
  const body: AddStopItemRequest = { itemId };
  return requestJson<StopDetail>(user, `/api/stops/${stopId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Take an Item out of a Stop. Only the membership goes — the Item itself, its
 * Status, and its other Stops are untouched. Returns the Stop's new contents.
 */
export async function removeItemFromStop(
  user: CurrentUser,
  stopId: StopId,
  itemId: ItemId,
): Promise<StopDetail> {
  return requestJson<StopDetail>(user, `/api/stops/${stopId}/items/${itemId}`, {
    method: "DELETE",
  });
}

/**
 * One Trail's topology — its Stops as nodes with derived progress, and every
 * Stop-to-Stop edge between them (ADR-0010, scoped per Trail by #94). The client
 * derives the layout from the edges, since the Trail stores no position.
 */
export async function fetchTrail(
  user: CurrentUser,
  trailId: TrailId,
): Promise<TrailView> {
  return requestJson<TrailView>(user, `/api/trails/${trailId}/topology`);
}

/**
 * Draw one edge on a Trail — place `fromStopId` ahead of `toStopId`. The api
 * refuses a link that would close a cycle (409) or touch a foreign, cross-Trail,
 * or unknown Stop (404); on success it returns the Trail's new topology. Adding an
 * edge that already exists changes nothing.
 */
export async function connectStops(
  user: CurrentUser,
  trailId: TrailId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<TrailView> {
  const body: ConnectStopsRequest = { fromStopId, toStopId };
  return requestJson<TrailView>(user, `/api/trails/${trailId}/edges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Erase one edge on a Trail, returning its new topology. Only the link goes —
 * both Stops keep their place and every other edge — which is what makes rewiring
 * free: moving a Stop is an erase and a redraw.
 */
export async function disconnectStops(
  user: CurrentUser,
  trailId: TrailId,
  fromStopId: StopId,
  toStopId: StopId,
): Promise<TrailView> {
  return requestJson<TrailView>(
    user,
    `/api/trails/${trailId}/edges/${fromStopId}/${toStopId}`,
    { method: "DELETE" },
  );
}
