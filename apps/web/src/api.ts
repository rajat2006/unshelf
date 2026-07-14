import type { CreateItemRequest, Item } from "@unshelf/shared";
import type { CurrentUser } from "./auth";

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
