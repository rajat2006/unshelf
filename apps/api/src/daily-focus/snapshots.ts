import { and, eq, sql } from "drizzle-orm";
import type { ItemId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import { dailyFocuses, dailyFocusItems, items, parts } from "../schema";

/** Refresh the dated snapshot only while its Daily Focus is still Today. */
export async function refreshTodayEntrySnapshot(
  db: Database,
  input: { userId: UserId; itemId: ItemId },
): Promise<void> {
  await db
    .update(dailyFocusItems)
    .set({
      statusSnapshot: sql`(
        select ${items.status}
        from ${items}
        where ${items.id} = ${input.itemId}
          and ${items.userId} = ${input.userId}
      )`,
      partPercentageSnapshot: sql`(
        select round(
          100.0 * count(*) filter (where ${parts.completed})
          / nullif(count(*), 0)
        )::integer
        from ${parts}
        where ${parts.itemId} = ${input.itemId}
          and ${parts.userId} = ${input.userId}
      )`,
    })
    .where(
      and(
        eq(dailyFocusItems.userId, input.userId),
        eq(dailyFocusItems.itemId, input.itemId),
        sql`exists (
          select 1
          from ${dailyFocuses}
          where ${dailyFocuses.id} = ${dailyFocusItems.dailyFocusId}
            and ${dailyFocuses.userId} = ${dailyFocusItems.userId}
            and ${dailyFocuses.date} = current_date
        )`,
      ),
    );
}
