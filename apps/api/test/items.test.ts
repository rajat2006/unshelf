import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { ITEM_STATUSES, ITEM_TYPES, type Item } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * Capture and All at the HTTP boundary (issue #17), driven against a real
 * ephemeral Postgres. These are the load-bearing guarantees of the Item spine:
 * Capture creates immediately and reuses only an exact owned YouTube identity,
 * All is the query "every Item where user = me", and one User's Items are never
 * visible to another. Every assertion runs through the same auth seam T2
 * established — a header names the acting User, no Clerk involved.
 */
let harness: TestApp;
let app: Express;

const capture = (clerkUserId: string, body: object) =>
  request(app).post("/api/items").set(TEST_USER_HEADER, clerkUserId).send(body);

const listAll = (clerkUserId: string) =>
  request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId);

const readItem = (clerkUserId: string, itemId: string) =>
  request(app).get(`/api/items/${itemId}`).set(TEST_USER_HEADER, clerkUserId);

const setStatus = (clerkUserId: string, itemId: string, status: string) =>
  request(app)
    .patch(`/api/items/${itemId}/status`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ status });

const setTargetDate = (clerkUserId: string, itemId: string, body: object) =>
  request(app)
    .patch(`/api/items/${itemId}/target-date`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

/**
 * A calendar date relative to *the database's* today. `past target` is derived
 * against the database clock, so the tests anchor to that same clock rather than
 * to the test process's — otherwise a timezone gap between the two could make
 * "yesterday" ambiguous exactly at the boundary the derivation turns on.
 */
const databaseDate = async (offsetDays: number): Promise<string> => {
  const { rows } = await harness.pool.query<{ date: string }>(
    "SELECT (CURRENT_DATE + $1::integer)::text AS date",
    [offsetDays],
  );
  return rows[0].date;
};

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("POST /api/items — capture", () => {
  it("captures title + type + optional source in one insert, scoped to the User", async () => {
    const res = await capture("clerk_cap_basic", {
      title: "A Philosophy of Software Design",
      type: "book",
      source: "https://example.com/aposd",
    });

    expect(res.status).toBe(201);
    const item = res.body as Item;
    expect(item.id).toBeTruthy();
    expect(item.title).toBe("A Philosophy of Software Design");
    expect(item.type).toBe("book");
    expect(item.source).toBe("https://example.com/aposd");
    expect(typeof item.userId).toBe("string");
    expect(item.userId).not.toBe("clerk_cap_basic"); // our anchor id, not Clerk's
  });

  it("lands a new Item at status not started, with no Target date and nothing banked", async () => {
    const res = await capture("clerk_cap_status", {
      title: "Untracked",
      type: "article",
    });

    const item = res.body as Item;
    expect(item.status).toBe("not_started");
    expect(item.targetDate).toBeNull();
    expect(item.pastTarget).toBe(false);
    expect(item.completedAt).toBeNull();
    expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);
  });

  it("adds an offline Item by title alone — source is optional", async () => {
    const res = await capture("clerk_cap_offline", {
      title: "A paper library book",
      type: "book",
    });

    expect(res.status).toBe(201);
    expect((res.body as Item).source).toBeNull();
  });

  it("trims only the title boundary and stores source verbatim", async () => {
    const messy = "  not even a url — kept As-Is  ";
    const res = await capture("clerk_cap_verbatim", {
      title: "  spaces   inside the title  ",
      type: "other",
      source: messy,
    });

    expect(res.status).toBe(201);
    const item = res.body as Item;
    expect(item.source).toBe(messy);
    expect(item.title).toBe("spaces   inside the title");
  });

  it("preserves an explicitly supplied blank source", async () => {
    const res = await capture("clerk_cap_blank_source", {
      title: "Blank source",
      type: "other",
      source: "",
    });

    expect(res.status).toBe(201);
    expect((res.body as Item).source).toBe("");
  });

  it("does not dedupe — the same link captured twice yields two distinct Items", async () => {
    const body = {
      title: "Twice",
      type: "video",
      source: "https://dup.example",
    };
    const first = (await capture("clerk_cap_dupe", body)).body as Item;
    const second = (await capture("clerk_cap_dupe", body)).body as Item;

    expect(first.id).not.toBe(second.id);
    const all = (await listAll("clerk_cap_dupe")).body as Item[];
    expect(
      all.filter((item) => item.source === "https://dup.example"),
    ).toHaveLength(2);
  });

  it("reuses one Item for equivalent exact YouTube video identities", async () => {
    const first = (
      await capture("clerk_cap_youtube_identity", {
        title: "First confirmed title",
        type: "video",
        source: "https://youtu.be/abc_DEF-123?t=90",
      })
    ).body as Item;
    const second = (
      await capture("clerk_cap_youtube_identity", {
        title: "Later confirmation",
        type: "course",
        source: "https://m.youtube.com/watch?v=abc_DEF-123&feature=share",
      })
    ).body as Item;
    const third = (
      await capture("clerk_cap_youtube_identity", {
        title: "Short URL confirmation",
        type: "book",
        source: "https://www.youtube.com/shorts/abc_DEF-123/?si=tracking",
      })
    ).body as Item;

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(first).toMatchObject({
      title: "First confirmed title",
      type: "video",
      source: "https://youtu.be/abc_DEF-123?t=90",
    });
    expect((await listAll("clerk_cap_youtube_identity")).body).toHaveLength(1);
  });

  it.each([
    "https://youtube.com/watch?v=abcdefghij",
    "https://youtube.com/watch?v=abcdefghijk&v=abcdefghijk",
    "https://youtube.com/watch?v=abcdefghijk&list=0123456789",
    "https://youtube.com/channel/abcdefghijk",
    "https://youtube.com/playlist?list=0123456789",
    "https://example.com/watch?v=abcdefghijk",
  ])("keeps identity-less Source captures distinct: %s", async (source) => {
    const user = `clerk_cap_identityless_${Buffer.from(source).toString("hex")}`;
    const body = { title: "Independent capture", type: "video", source };

    const first = (await capture(user, body)).body as Item;
    const second = (await capture(user, body)).body as Item;

    expect(second.id).not.toBe(first.id);
    expect((await listAll(user)).body).toHaveLength(2);
  });

  it("scopes exact YouTube identity reuse to one User", async () => {
    const body = {
      title: "Privately captured",
      type: "video",
      source: "https://youtube.com/shorts/abc_DEF-123",
    };

    const owner = (await capture("clerk_cap_identity_owner", body))
      .body as Item;
    const other = (await capture("clerk_cap_identity_other", body))
      .body as Item;

    expect(other.id).not.toBe(owner.id);
    expect(other.userId).not.toBe(owner.userId);
  });

  it("requires a title", async () => {
    expect((await capture("clerk_cap_bad", { type: "article" })).status).toBe(
      400,
    );
    expect(
      (await capture("clerk_cap_bad", { title: "   ", type: "article" }))
        .status,
    ).toBe(400);
  });

  it("requires a valid, chosen type — no default", async () => {
    expect((await capture("clerk_cap_bad", { title: "No type" })).status).toBe(
      400,
    );
    expect(
      (await capture("clerk_cap_bad", { title: "Bad type", type: "podcast" }))
        .status,
    ).toBe(400);
  });

  it("rejects unknown fields with safe issues and leaves All unchanged", async () => {
    const clerkUserId = "clerk_cap_unknown";
    const res = await capture(clerkUserId, {
      title: "Looks valid",
      type: "article",
      secret: "must not be reflected",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [
        {
          path: "body.$unknown",
          message: "Contains unrecognized fields",
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain("must not be reflected");
    expect((await listAll(clerkUserId)).body).toEqual([]);
  });

  it.each(ITEM_TYPES)(
    "keeps the shared %s type aligned with the database constraint",
    async (type) => {
      const res = await capture(`clerk_type_contract_${type}`, {
        title: `Contract: ${type}`,
        type,
      });

      expect(res.status).toBe(201);
      expect((res.body as Item).type).toBe(type);
    },
  );

  it("refuses an unauthenticated capture", async () => {
    const res = await request(app)
      .post("/api/items")
      .send({ title: "Anon", type: "article" });
    expect(res.status).toBe(401);
  });
});

describe("shared Item vocabulary", () => {
  it.each(ITEM_STATUSES)(
    "keeps the shared %s status aligned with the database constraint",
    async (status) => {
      const clerkUserId = `clerk_status_contract_${status}`;
      const captured = await capture(clerkUserId, {
        title: `Contract: ${status}`,
        type: "article",
      });
      const item = captured.body as Item;

      await harness.pool.query("UPDATE items SET status = $1 WHERE id = $2", [
        status,
        item.id,
      ]);

      const all = (await listAll(clerkUserId)).body as Item[];
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe(status);
    },
  );
});

describe("GET /api/items/:itemId — canonical Item read", () => {
  it("reads the authenticated User's Item at its canonical endpoint", async () => {
    const item = (
      await capture("clerk_item_read_owner", {
        title: "Canonical Item",
        type: "article",
      })
    ).body as Item;

    const res = await readItem("clerk_item_read_owner", item.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...item, parts: [], partPercentage: null });
  });

  it("treats another User's Item as missing", async () => {
    const item = (
      await capture("clerk_item_read_private", {
        title: "Private Item",
        type: "book",
      })
    ).body as Item;

    const foreign = await readItem("clerk_item_read_intruder", item.id);
    const missing = await readItem(
      "clerk_item_read_intruder",
      "00000000-0000-0000-0000-000000000000",
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it("rejects a malformed Item id before repository work", async () => {
    const res = await readItem("clerk_item_bad_id", "item-123");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.itemId", message: "Must be a valid UUID" }],
    });
  });
});

describe("PATCH /api/items/:itemId/status — track Status", () => {
  it.each(ITEM_STATUSES)("sets Status to %s", async (status) => {
    const clerkUserId = `clerk_set_status_${status}`;
    const item = (
      await capture(clerkUserId, {
        title: `Set ${status}`,
        type: "article",
      })
    ).body as Item;

    const res = await setStatus(clerkUserId, item.id, status);

    expect(res.status).toBe(200);
    expect((res.body as Item).status).toBe(status);
  });

  it("banks the completion moment only on the transition into done", async () => {
    const clerkUserId = "clerk_status_done";
    const item = (
      await capture(clerkUserId, { title: "Finish me", type: "course" })
    ).body as Item;

    const done = await setStatus(clerkUserId, item.id, "done");

    expect(done.status).toBe(200);
    const completedAt = (done.body as Item).completedAt;
    expect(completedAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(completedAt!))).toBe(false);

    const stillDone = await setStatus(clerkUserId, item.id, "done");
    expect((stillDone.body as Item).completedAt).toBe(completedAt);
  });

  it.each(["not_started", "in_progress"])(
    "clears the completion moment on the transition from done to %s",
    async (status) => {
      const clerkUserId = `clerk_status_reopen_${status}`;
      const item = (
        await capture(clerkUserId, { title: "Reopen me", type: "book" })
      ).body as Item;
      expect(
        ((await setStatus(clerkUserId, item.id, "done")).body as Item)
          .completedAt,
      ).not.toBeNull();

      const reopened = await setStatus(clerkUserId, item.id, status);

      expect(reopened.status).toBe(200);
      expect((reopened.body as Item).status).toBe(status);
      expect((reopened.body as Item).completedAt).toBeNull();
    },
  );

  it("reads the changed Status from the single Item shared by every view", async () => {
    const clerkUserId = "clerk_status_shared_item";
    const item = (
      await capture(clerkUserId, { title: "Shared Item", type: "video" })
    ).body as Item;

    await setStatus(clerkUserId, item.id, "in_progress");

    const all = (await listAll(clerkUserId)).body as Item[];
    expect(all.find((listed) => listed.id === item.id)?.status).toBe(
      "in_progress",
    );
  });

  it("rejects an unknown Status", async () => {
    const clerkUserId = "clerk_status_invalid";
    const item = (
      await capture(clerkUserId, { title: "Invalid", type: "other" })
    ).body as Item;

    const res = await setStatus(clerkUserId, item.id, "almost_done");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "body.status", message: "Invalid value" }],
    });
    expect(((await readItem(clerkUserId, item.id)).body as Item).status).toBe(
      "not_started",
    );
  });

  it("cannot change another User's Item", async () => {
    const item = (
      await capture("clerk_status_owner", {
        title: "Owner only",
        type: "playlist",
      })
    ).body as Item;

    const res = await setStatus("clerk_status_intruder", item.id, "done");

    expect(res.status).toBe(404);
    const ownerAll = (await listAll("clerk_status_owner")).body as Item[];
    expect(ownerAll[0]?.status).toBe("not_started");
    expect(ownerAll[0]?.completedAt).toBeNull();
  });
});

describe("PATCH /api/items/:itemId/target-date — the soft Target date", () => {
  it("sets, changes, and clears the one soft date", async () => {
    const clerkUserId = "clerk_target_lifecycle";
    const item = (
      await capture(clerkUserId, { title: "By when?", type: "course" })
    ).body as Item;
    expect(item.targetDate).toBeNull();

    const set = await setTargetDate(clerkUserId, item.id, {
      targetDate: "2026-03-01",
    });
    expect(set.status).toBe(200);
    expect((set.body as Item).targetDate).toBe("2026-03-01");

    const changed = await setTargetDate(clerkUserId, item.id, {
      targetDate: "2026-04-15",
    });
    expect(changed.status).toBe(200);
    expect((changed.body as Item).targetDate).toBe("2026-04-15");

    const cleared = await setTargetDate(clerkUserId, item.id, {
      targetDate: null,
    });
    expect(cleared.status).toBe(200);
    expect((cleared.body as Item).targetDate).toBeNull();
    expect((cleared.body as Item).pastTarget).toBe(false);
  });

  it("stores one date on the Item, read back by every view of it", async () => {
    const clerkUserId = "clerk_target_shared_item";
    const item = (
      await capture(clerkUserId, { title: "Shared date", type: "video" })
    ).body as Item;

    await setTargetDate(clerkUserId, item.id, { targetDate: "2026-05-20" });

    const all = (await listAll(clerkUserId)).body as Item[];
    expect(all.find((listed) => listed.id === item.id)?.targetDate).toBe(
      "2026-05-20",
    );
  });

  it("leaves the Target date untouched when Status changes", async () => {
    const clerkUserId = "clerk_target_survives_status";
    const item = (
      await capture(clerkUserId, { title: "Date keeper", type: "book" })
    ).body as Item;
    await setTargetDate(clerkUserId, item.id, { targetDate: "2026-06-30" });

    const moved = await setStatus(clerkUserId, item.id, "in_progress");

    expect((moved.body as Item).targetDate).toBe("2026-06-30");
  });

  it("rejects a date that is not a YYYY-MM-DD calendar date", async () => {
    const clerkUserId = "clerk_target_invalid";
    const item = (await capture(clerkUserId, { title: "Bad", type: "other" }))
      .body as Item;

    for (const targetDate of [
      "next tuesday",
      "01/02/2026",
      "2026-2-3",
      "2026-02-30", // a well-formed date that does not exist
      "0000-01-01", // JavaScript accepts year zero; PostgreSQL does not
      "",
      42,
      true,
    ]) {
      const res = await setTargetDate(clerkUserId, item.id, { targetDate });
      expect(res.status, `expected 400 for ${JSON.stringify(targetDate)}`).toBe(
        400,
      );
    }

    // The rejected writes left the Item's date alone.
    expect(
      ((await listAll(clerkUserId)).body as Item[])[0].targetDate,
    ).toBeNull();
  });

  it("requires the targetDate field — an empty body is not a clear", async () => {
    const clerkUserId = "clerk_target_missing_field";
    const item = (
      await capture(clerkUserId, { title: "Empty", type: "article" })
    ).body as Item;

    const res = await setTargetDate(clerkUserId, item.id, {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "body.targetDate", message: "Has an invalid type" }],
    });
  });

  it("cannot set a Target date on another User's Item", async () => {
    const item = (
      await capture("clerk_target_owner", {
        title: "Owner only",
        type: "playlist",
      })
    ).body as Item;

    const res = await setTargetDate("clerk_target_intruder", item.id, {
      targetDate: "2026-07-01",
    });

    expect(res.status).toBe(404);
    expect(
      ((await listAll("clerk_target_owner")).body as Item[])[0].targetDate,
    ).toBeNull();
  });

  it("refuses an unauthenticated Target date change", async () => {
    const item = (
      await capture("clerk_target_anon_owner", {
        title: "Anon",
        type: "article",
      })
    ).body as Item;

    const res = await request(app)
      .patch(`/api/items/${item.id}/target-date`)
      .send({ targetDate: "2026-08-01" });

    expect(res.status).toBe(401);
  });
});

describe("application error boundary", () => {
  it("returns safe JSON for malformed request JSON", async () => {
    const res = await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, "clerk_malformed_json")
      .set("Content-Type", "application/json")
      .send('{"title":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_json",
      message: "Request body must be valid JSON",
    });
    expect(res.text).not.toContain("SyntaxError");
  });

  it("returns field issues when valid JSON does not match the body schema", async () => {
    const res = await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, "clerk_primitive_json")
      .set("Content-Type", "application/json")
      .send("42");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "body", message: "Has an invalid type" }],
    });
  });

  it("returns a generic JSON 500 without leaking database diagnostics", async () => {
    await harness.pool.query("ALTER TABLE items RENAME TO unavailable_items");
    try {
      const res = await listAll("clerk_unexpected_failure");

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: "internal_server_error",
        message: "An unexpected error occurred",
      });
      expect(res.text).not.toContain("unavailable_items");
      expect(res.text).not.toContain("relation");
    } finally {
      await harness.pool.query("ALTER TABLE unavailable_items RENAME TO items");
    }
  });
});

describe("past target — derived, never stored, never nagging", () => {
  it("shows past target once the date is past and the Item is not done", async () => {
    const clerkUserId = "clerk_past_target_yes";
    const item = (
      await capture(clerkUserId, { title: "Slipped", type: "course" })
    ).body as Item;

    const res = await setTargetDate(clerkUserId, item.id, {
      targetDate: await databaseDate(-1),
    });

    expect((res.body as Item).pastTarget).toBe(true);
  });

  it.each([
    ["today — a target is not past on the day itself", 0],
    ["a future date", 1],
  ])("shows no past target for %s", async (_label, offset) => {
    const clerkUserId = `clerk_past_target_no_${offset}`;
    const item = (
      await capture(clerkUserId, { title: "On track", type: "article" })
    ).body as Item;

    const res = await setTargetDate(clerkUserId, item.id, {
      targetDate: await databaseDate(offset),
    });

    expect((res.body as Item).pastTarget).toBe(false);
  });

  it("clears past target once done, but keeps the date as history", async () => {
    const clerkUserId = "clerk_past_target_done";
    const yesterday = await databaseDate(-1);
    const item = (
      await capture(clerkUserId, {
        title: "Finished after target",
        type: "book",
      })
    ).body as Item;
    expect(
      (
        (await setTargetDate(clerkUserId, item.id, { targetDate: yesterday }))
          .body as Item
      ).pastTarget,
    ).toBe(true);

    const done = (await setStatus(clerkUserId, item.id, "done")).body as Item;

    expect(done.pastTarget).toBe(false);
    expect(done.targetDate).toBe(yesterday);
  });

  it.each(["not_started", "in_progress"])(
    "shows past target again when a done Item is reopened to %s",
    async (status) => {
      const clerkUserId = `clerk_past_target_reopen_${status}`;
      const yesterday = await databaseDate(-1);
      const item = (
        await capture(clerkUserId, { title: "Reopened", type: "video" })
      ).body as Item;
      await setTargetDate(clerkUserId, item.id, { targetDate: yesterday });
      await setStatus(clerkUserId, item.id, "done");

      const reopened = (await setStatus(clerkUserId, item.id, status))
        .body as Item;

      expect(reopened.pastTarget).toBe(true);
      expect(reopened.targetDate).toBe(yesterday);
    },
  );

  it("derives past target live on read — no stored flag, no job", async () => {
    const clerkUserId = "clerk_past_target_derived";
    const item = (
      await capture(clerkUserId, { title: "Derived", type: "other" })
    ).body as Item;
    await setTargetDate(clerkUserId, item.id, {
      targetDate: await databaseDate(1),
    });
    expect(((await listAll(clerkUserId)).body as Item[])[0].pastTarget).toBe(
      false,
    );

    // Nothing ran in between: moving the stored date into the past is enough for
    // the very next read to report it, because the state is computed, not kept.
    await harness.pool.query(
      "UPDATE items SET target_date = CURRENT_DATE - 1 WHERE id = $1",
      [item.id],
    );

    expect(((await listAll(clerkUserId)).body as Item[])[0].pastTarget).toBe(
      true,
    );
  });

  it("keeps no past-target column to go stale", async () => {
    const { rows } = await harness.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'items'`,
    );
    const columns = rows.map((row) => row.column_name);

    expect(columns).toContain("target_date");
    expect(columns.some((name) => /past|overdue|late/.test(name))).toBe(false);
  });
});

describe("GET /api/items — All", () => {
  it("lists every Item belonging to the current User", async () => {
    await capture("clerk_all_owner", { title: "One", type: "article" });
    await capture("clerk_all_owner", { title: "Two", type: "course" });

    const res = await listAll("clerk_all_owner");
    expect(res.status).toBe(200);
    const titles = (res.body as Item[]).map((item) => item.title);
    expect(titles).toContain("One");
    expect(titles).toContain("Two");
  });

  it("includes derived Structured Item progress for Library presentations", async () => {
    const clerkUserId = "clerk_all_structured_progress";
    const item = (
      await capture(clerkUserId, { title: "Structured course", type: "course" })
    ).body as Item;
    const structured = await request(app)
      .post(`/api/items/${item.id}/parts`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ titles: ["First", "Second"] });
    await request(app)
      .patch(
        `/api/items/${item.id}/parts/${structured.body.parts[0].id}/completion`,
      )
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ completed: true });

    const listed = (await listAll(clerkUserId)).body as Item[];

    expect(listed[0].partPercentage).toBe(50);
  });

  it("lists recently captured Items first with stable identity as the tie-breaker", async () => {
    const clerkUserId = "clerk_all_recent";
    const first = (
      await capture(clerkUserId, { title: "Same-time B", type: "article" })
    ).body as Item;
    const second = (
      await capture(clerkUserId, { title: "Newest", type: "video" })
    ).body as Item;
    const third = (
      await capture(clerkUserId, { title: "Same-time A", type: "book" })
    ).body as Item;
    await harness.pool.query(
      `UPDATE items
       SET created_at = CASE
         WHEN id = $1 THEN '2026-01-02T00:00:00.000Z'::timestamptz
         ELSE '2026-01-01T00:00:00.000Z'::timestamptz
       END
       WHERE id = ANY($2::uuid[])`,
      [second.id, [first.id, second.id, third.id]],
    );

    const listed = (await listAll(clerkUserId)).body as Item[];
    const tied = [first, third].sort((left, right) =>
      left.id.localeCompare(right.id),
    );

    expect(listed.map((item) => item.id)).toEqual([
      second.id,
      ...tied.map((item) => item.id),
    ]);
  });

  it("refuses an unauthenticated read of All", async () => {
    expect((await request(app).get("/api/items")).status).toBe(401);
  });
});

describe("per-User isolation", () => {
  it("shows a User only their own Items — never another User's", async () => {
    await capture("clerk_iso_alice", {
      title: "Alice's item",
      type: "article",
    });
    await capture("clerk_iso_bob", { title: "Bob's item", type: "book" });

    const aliceAll = (await listAll("clerk_iso_alice")).body as Item[];
    const bobAll = (await listAll("clerk_iso_bob")).body as Item[];

    const aliceTitles = aliceAll.map((item) => item.title);
    expect(aliceTitles).toContain("Alice's item");
    expect(aliceTitles).not.toContain("Bob's item");

    const bobTitles = bobAll.map((item) => item.title);
    expect(bobTitles).toContain("Bob's item");
    expect(bobTitles).not.toContain("Alice's item");

    // Every Item in Alice's All is stamped with Alice's own anchor id.
    const aliceId = aliceAll[0].userId;
    expect(aliceAll.every((item) => item.userId === aliceId)).toBe(true);
    expect(bobAll.every((item) => item.userId !== aliceId)).toBe(true);
  });
});
