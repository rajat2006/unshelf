import { and, eq, isNull } from "drizzle-orm";
import type { DiscoverFollowId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import { discoverFollows } from "../schema";

export type UnfollowChannelResult =
  { ok: true } | { ok: false; error: "not_found" };

/** Soft-delete one owned Follow without changing shared data or Candidates. */
export async function unfollowChannel({
  db,
  userId,
  followId,
  now,
}: {
  db: Database;
  userId: UserId;
  followId: DiscoverFollowId;
  now: Date;
}): Promise<UnfollowChannelResult> {
  return db.transaction(async (tx) => {
    const [follow] = await tx
      .select({ id: discoverFollows.id })
      .from(discoverFollows)
      .where(
        and(
          eq(discoverFollows.id, followId),
          eq(discoverFollows.userId, userId),
        ),
      )
      .limit(1)
      .for("update");
    if (!follow) return { ok: false, error: "not_found" };

    await tx
      .update(discoverFollows)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(discoverFollows.id, followId),
          eq(discoverFollows.userId, userId),
          isNull(discoverFollows.deletedAt),
        ),
      );

    return { ok: true };
  });
}
