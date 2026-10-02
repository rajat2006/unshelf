import { sql } from "drizzle-orm";
import type { Database } from "../db";
import type { UserId } from "@unshelf/shared";

export async function reserve({
  db,
  userId,
  claim,
  now,
}: {
  db: Database;
  userId: UserId;
  claim: string;
  now?: Date;
}): Promise<boolean> {
  // One upsert locks the User's row across instances, including the UTC rollover.
  const result = await db.execute(sql`
    with clock as (select coalesce(${now?.toISOString() ?? null}::timestamptz, statement_timestamp()) as time)
    insert into chapter_research_admission (user_id, day, dispatched, claim, expires_at)
    select ${userId}, (time at time zone 'UTC')::date, 1, ${claim}, time + interval '65 seconds' from clock
    on conflict (user_id) do update set
      day = excluded.day,
      dispatched = case when chapter_research_admission.day = excluded.day then chapter_research_admission.dispatched + 1 else 1 end,
      claim = excluded.claim, expires_at = excluded.expires_at
    where (chapter_research_admission.claim is null or chapter_research_admission.expires_at <= (select time from clock))
      and (chapter_research_admission.day <> excluded.day or chapter_research_admission.dispatched < 10)
    returning user_id
  `);
  return result.rowCount === 1;
}
export async function release({
  db,
  userId,
  claim,
  undispatched = false,
}: {
  db: Database;
  userId: UserId;
  claim: string;
  undispatched?: boolean;
}): Promise<void> {
  // A crashed or late request must never release its successor's claim.
  await db.execute(sql`update chapter_research_admission set claim = null, expires_at = null,
    dispatched = dispatched - ${undispatched ? 1 : 0}
    where user_id = ${userId} and claim = ${claim}`);
}
