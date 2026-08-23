import { and, eq, sql } from "drizzle-orm";
import type { ItemId, Type, UserId } from "@unshelf/shared";
import type { DatabaseTransaction } from "../db";
import { itemProviderIdentities, items } from "../schema";

/** Create or reuse the Library Item for one exact owned Provider identity. */
export async function findOrCreateProviderItem({
  tx,
  userId,
  identity,
  title,
  type,
  source,
}: {
  tx: DatabaseTransaction;
  userId: UserId;
  identity: { provider: "youtube"; externalId: string };
  title: string;
  type: Type;
  source: string;
}): Promise<ItemId> {
  // Serialize the first mapping claim so concurrent Capture and Keep requests
  // cannot both create an Item before the identity mapping becomes visible.
  await tx.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended(
        jsonb_build_array(
          ${userId}::text,
          ${identity.provider}::text,
          ${identity.externalId}::text
        )::text,
        0
      )
    )
  `);
  const existing = await tx
    .select({ itemId: itemProviderIdentities.itemId })
    .from(itemProviderIdentities)
    .where(
      and(
        eq(itemProviderIdentities.userId, userId),
        eq(itemProviderIdentities.provider, identity.provider),
        eq(itemProviderIdentities.externalId, identity.externalId),
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
    provider: identity.provider,
    externalId: identity.externalId,
    itemId,
  });
  return itemId;
}
