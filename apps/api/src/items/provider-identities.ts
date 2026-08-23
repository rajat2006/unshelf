import { and, eq } from "drizzle-orm";
import type { ItemId, Type, UserId } from "@unshelf/shared";
import type { DatabaseTransaction } from "../db";
import { itemProviderIdentities, items } from "../schema";

/** Create or reuse the Library Item for one exact owned Provider identity. */
export async function findOrCreateProviderItem({
  tx,
  userId,
  provider,
  externalId,
  title,
  type,
  source,
}: {
  tx: DatabaseTransaction;
  userId: UserId;
  provider: string;
  externalId: string;
  title: string;
  type: Type;
  source: string;
}): Promise<ItemId> {
  const existing = await tx
    .select({ itemId: itemProviderIdentities.itemId })
    .from(itemProviderIdentities)
    .where(
      and(
        eq(itemProviderIdentities.userId, userId),
        eq(itemProviderIdentities.provider, provider),
        eq(itemProviderIdentities.externalId, externalId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].itemId as ItemId;

  const created = await tx
    .insert(items)
    .values({ userId, title, type, source })
    .returning({ id: items.id });
  const itemId = created[0].id as ItemId;
  await tx.insert(itemProviderIdentities).values({
    userId,
    provider,
    externalId,
    itemId,
  });
  return itemId;
}
