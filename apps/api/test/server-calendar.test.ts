import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServerCalendar } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

describe("GET /api/server-calendar", () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await startTestApp({ timeZone: "America/Los_Angeles" });
  });

  afterAll(async () => {
    await harness.stop();
  });

  it("returns the authenticated User's PostgreSQL calendar document without caching it", async () => {
    const response = await request(harness.app)
      .get("/api/server-calendar")
      .set(TEST_USER_HEADER, "clerk_server_calendar");

    expect(response.status, JSON.stringify(harness.logger.records)).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");

    const calendar = response.body as ServerCalendar;
    expect(calendar.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(calendar.validUntil).toISOString()).toBe(
      calendar.validUntil,
    );

    const databaseCalendar = await harness.pool.query<
      ServerCalendar & { timeZone: string }
    >(`
      select
        current_date::text as today,
        ((current_date + 1)::timestamp at time zone current_setting('timezone'))
          as "validUntil",
        current_setting('timezone') as "timeZone"
    `);
    expect(databaseCalendar.rows[0].timeZone).toBe("America/Los_Angeles");
    expect(calendar).toEqual({
      today: databaseCalendar.rows[0].today,
      validUntil: new Date(databaseCalendar.rows[0].validUntil).toISOString(),
    });
  });

  it("rejects an unauthenticated calendar read", async () => {
    const response = await request(harness.app).get("/api/server-calendar");

    expect(response.status).toBe(401);
  });
});
