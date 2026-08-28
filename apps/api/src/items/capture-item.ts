import type { CreateItemRequest, Item, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import { findOrCreateProviderItem } from "./provider-identities";
import { createItem, getItemSummary } from "./repository";
import { parseYouTubeVideoIdentity } from "./youtube-video-identity";

/** Capture immediately, reusing only an exact owned YouTube video identity. */
export async function captureItem({
  db,
  userId,
  input,
}: {
  db: Database;
  userId: UserId;
  input: CreateItemRequest;
}): Promise<Item> {
  const source = input.source;
  if (typeof source !== "string") return createItem(db, userId, input);

  const identity = parseYouTubeVideoIdentity(source);
  if (identity === null) return createItem(db, userId, input);

  const itemId = await db.transaction((tx) =>
    findOrCreateProviderItem({
      tx,
      userId,
      identity,
      title: input.title,
      type: input.type,
      source,
    }),
  );
  const item = await getItemSummary(db, userId, itemId);
  if (!item) throw new Error("captured Item is unavailable");
  return item;
}
