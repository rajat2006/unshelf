import type { CreateItemRequest, Item } from "@unshelf/shared";
import type { CurrentUser } from "./auth";

/**
 * The thin api client the web uses for its authenticated calls. Every request
 * carries the current User's bearer token so the api resolves it to *this* User's
 * space (the tenancy round-trip T2 established); the caller passes the
 * `useCurrentUser()` handle rather than importing Clerk here.
 */

async function authedFetch(
  user: CurrentUser,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await user.getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

/** Fetch All — every Item belonging to the current User. */
export async function fetchAll(user: CurrentUser): Promise<Item[]> {
  const res = await authedFetch(user, "/api/items");
  if (!res.ok) throw new Error(`api responded ${res.status}`);
  return (await res.json()) as Item[];
}

/** Capture an Item — the one uniform insert (ADR-0007). Returns the new Item. */
export async function captureItem(
  user: CurrentUser,
  input: CreateItemRequest,
): Promise<Item> {
  const res = await authedFetch(user, "/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`api responded ${res.status}`);
  return (await res.json()) as Item;
}
