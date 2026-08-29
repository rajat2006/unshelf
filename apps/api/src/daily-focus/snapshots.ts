import { and, eq, sql } from "drizzle-orm";
import type { ItemId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import { activeItem } from "../items/active-item";
import { dailyFocuses, dailyFocusItems, items, parts } from "../schema";

/** Refresh an active Item's dated snapshot only while its Daily Focus is Today. */
export async function refreshTodayEntrySnapshot(
  db: Database,
  input: { userId: UserId; itemId: ItemId },
): Promise<void> {
  await db
    .update(dailyFocusItems)
    .set({
      titleSnapshot: sql`(
        select ${items.title}
        from ${items}
        where ${items.id} = ${input.itemId}
          and ${items.userId} = ${input.userId}
          and ${activeItem()}
      )`,
      typeSnapshot: sql`(
        select ${items.type}
        from ${items}
        where ${items.id} = ${input.itemId}
          and ${items.userId} = ${input.userId}
          and ${activeItem()}
      )`,
      statusSnapshot: sql`(
        select ${items.status}
        from ${items}
        where ${items.id} = ${input.itemId}
          and ${items.userId} = ${input.userId}
          and ${activeItem()}
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
          from ${items}
          where ${items.id} = ${input.itemId}
            and ${items.userId} = ${input.userId}
            and ${activeItem()}
        )`,
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
