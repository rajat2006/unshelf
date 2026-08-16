import { sql } from "drizzle-orm";
import type { ServerCalendar } from "@unshelf/shared";
import type { Database } from "../db";

/** Read Today and its expiry from one stable PostgreSQL statement timestamp. */
export async function getServerCalendar(db: Database): Promise<ServerCalendar> {
  const { rows } = await db.execute<{
    today: string;
    validUntil: string | Date;
  }>(
    sql`
      select
        current_date::text as today,
        ((current_date + 1)::timestamp at time zone current_setting('timezone'))
          as "validUntil"
    `,
  );
  const calendar = rows[0];
  if (!calendar) throw new Error("PostgreSQL returned no server calendar");

  return {
    today: calendar.today,
    validUntil: new Date(calendar.validUntil).toISOString(),
  };
}
