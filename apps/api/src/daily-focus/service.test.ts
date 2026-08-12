import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { DailyFocus, Item } from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";

describe("Daily Focus service", () => {
  let harness: TestApp;
  let app: Express;

  beforeAll(async () => {
    harness = await startTestApp();
    app = harness.app;
  });

  afterAll(async () => harness.stop());

  it("explicitly adds one Item to today's focus and makes duplicate Add harmless", async () => {
    const user = "daily-focus-add-owner";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Read the database paper", type: "article" })
    ).body as Item;

    const added = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    const duplicate = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    const addedFocus = added.body as DailyFocus;
    const duplicateFocus = duplicate.body as DailyFocus;

    expect(added.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(duplicateFocus).toMatchObject({
      id: addedFocus.id,
      done: 0,
      total: 1,
      items: [{ id: item.id, title: item.title, status: "not_started" }],
    });
    const serverDate = await harness.pool.query<{ date: string }>(
      "select current_date::text as date",
    );
    expect(duplicateFocus.date).toBe(serverDate.rows[0]?.date);
  });

  it("removes only focus membership and derives completion from shared Item Status", async () => {
    const user = "daily-focus-remove-owner";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Practice query plans", type: "course" })
    ).body as Item;
    const focus = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
    ).body as { id: string };

    await request(app)
      .patch(`/api/items/${item.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" });
    const refreshed = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, user);

    expect(refreshed.body).toMatchObject({
      id: focus.id,
      done: 1,
      total: 1,
      items: [{ id: item.id, status: "done" }],
    });

    const removed = await request(app)
      .delete(`/api/daily-focus/${focus.id}/items/${item.id}`)
      .set(TEST_USER_HEADER, user);

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      id: focus.id,
      done: 0,
      total: 0,
      items: [],
    });
    expect(
      (
        await request(app)
          .get(`/api/items/${item.id}`)
          .set(TEST_USER_HEADER, user)
      ).body,
    ).toMatchObject({ id: item.id, status: "done" });
  });

  it("keeps current focus membership private and database constrained", async () => {
    const owner = "daily-focus-private-owner";
    const intruder = "daily-focus-private-intruder";
    const ownerItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, owner)
        .send({ title: "Owner Item", type: "book" })
    ).body as Item;
    const intruderItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, intruder)
        .send({ title: "Intruder Item", type: "book" })
    ).body as Item;
    const added = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, owner)
      .send({ itemId: ownerItem.id });
    const focus = added.body as {
      id: string;
      userId: string;
      date: string;
    };

    expect(
      (
        await request(app)
          .post("/api/daily-focus/today/items")
          .set(TEST_USER_HEADER, owner)
          .send({ itemId: intruderItem.id })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/daily-focus/${focus.id}/items/${ownerItem.id}`)
          .set(TEST_USER_HEADER, intruder)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(
            `/api/daily-focus/00000000-0000-0000-0000-000000000000/items/${ownerItem.id}`,
          )
          .set(TEST_USER_HEADER, owner)
      ).status,
    ).toBe(404);

    await expect(
      harness.pool.query(
        "insert into daily_focuses (user_id, date) values ($1, $2)",
        [focus.userId, focus.date],
      ),
    ).rejects.toThrow(/daily_focuses_user_date_unique/);
    await expect(
      harness.pool.query(
        `insert into daily_focus_items (daily_focus_id, user_id, item_id)
         values ($1, $2, $3)`,
        [focus.id, focus.userId, ownerItem.id],
      ),
    ).rejects.toThrow(/daily_focus_items_daily_focus_id_item_id_pk/);
    await expect(
      harness.pool.query(
        `insert into daily_focus_items (daily_focus_id, user_id, item_id)
         values ($1, $2, $3)`,
        [focus.id, focus.userId, intruderItem.id],
      ),
    ).rejects.toThrow(/daily_focus_items_item_owner_fk/);

    await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, owner)
      .send({ title: "Captured only", type: "article" });
    const refreshed = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, owner);
    const refreshedFocus = refreshed.body as DailyFocus;
    expect(refreshedFocus.items).toEqual([
      expect.objectContaining({ id: ownerItem.id }),
    ]);
  });
});
