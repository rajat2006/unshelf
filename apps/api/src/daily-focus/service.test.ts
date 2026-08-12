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
      entries: [
        {
          item: {
            id: item.id,
            title: item.title,
            status: "not_started",
          },
          origin: null,
        },
      ],
    });
    const serverDate = await harness.pool.query<{ date: string }>(
      "select current_date::text as date",
    );
    expect(duplicateFocus.date).toBe(serverDate.rows[0]?.date);
  });

  it("retains an active direct Learning Plan placement as optional origin context", async () => {
    const user = "daily-focus-direct-origin";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Study distributed systems", type: "course" })
    ).body as Item;
    const learningPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Become a systems engineer" })
    ).body as { id: string; name: string };
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id })
      .expect(201);

    const added = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({
        itemId: item.id,
        origin: { learningPlanId: learningPlan.id },
      });

    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      done: 0,
      total: 1,
      entries: [
        {
          item: { id: item.id, title: item.title },
          origin: {
            learningPlan: {
              id: learningPlan.id,
              name: learningPlan.name,
            },
            stage: null,
          },
        },
      ],
    });
    const duplicate = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({
        itemId: item.id,
        origin: { learningPlanId: learningPlan.id },
      })
      .expect(200);
    expect(duplicate.body).toMatchObject({ total: 1 });
  });

  it("retains Stage context and drops only that context when the placement is removed", async () => {
    const user = "daily-focus-stage-origin";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Work through query engines", type: "course" })
    ).body as Item;
    const learningPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Database foundations" })
    ).body as { id: string; name: string };
    const stage = (
      await request(app)
        .post(`/api/learning-plans/${learningPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Execution" })
    ).body as { id: string; name: string };
    await request(app)
      .post(`/api/stages/${stage.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id })
      .expect(200);

    const added = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({
        itemId: item.id,
        origin: { learningPlanId: learningPlan.id, stageId: stage.id },
      })
      .expect(201);
    expect(added.body).toMatchObject({
      total: 1,
      entries: [
        {
          item: { id: item.id },
          origin: {
            learningPlan: { id: learningPlan.id },
            stage: { id: stage.id, name: stage.name },
          },
        },
      ],
    });

    await request(app)
      .delete(`/api/stages/${stage.id}/items/${item.id}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    const refreshed = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, user)
      .expect(200);
    expect(refreshed.body).toMatchObject({
      total: 1,
      entries: [{ item: { id: item.id }, origin: null }],
    });
  });

  it("refuses stale and archived structural origins", async () => {
    const user = "daily-focus-invalid-origin";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Origin validation", type: "article" })
    ).body as Item;
    const learningPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Origin plan" })
    ).body as { id: string };
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id })
      .expect(201);

    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({
        itemId: item.id,
        origin: {
          learningPlanId: learningPlan.id,
          stageId: "00000000-0000-0000-0000-000000000000",
        },
      })
      .expect(404);
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/archive`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({
        itemId: item.id,
        origin: { learningPlanId: learningPlan.id },
      })
      .expect(404);

    const focus = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, user)
      .expect(200);
    expect(focus.body).toMatchObject({ total: 0, entries: [] });
  });

  it("combines Items from several Learning Plans with an unplanned Library Item", async () => {
    const user = "daily-focus-mixed-origins";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
      ).body as Item;
    const createPlan = async (name: string) =>
      (
        await request(app)
          .post("/api/learning-plans")
          .set(TEST_USER_HEADER, user)
          .send({ name })
      ).body as { id: string; name: string };
    const firstItem = await createItem("First planned Item");
    const secondItem = await createItem("Second planned Item");
    const unplannedItem = await createItem("Library-only Item");
    const firstPlan = await createPlan("First Plan");
    const secondPlan = await createPlan("Second Plan");
    for (const [plan, item] of [
      [firstPlan, firstItem],
      [secondPlan, secondItem],
    ] as const) {
      await request(app)
        .post(`/api/learning-plans/${plan.id}/items`)
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201);
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({
          itemId: item.id,
          origin: { learningPlanId: plan.id },
        })
        .expect(201);
    }
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: unplannedItem.id })
      .expect(201);

    const focus = (
      await request(app)
        .get("/api/daily-focus/today")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyFocus;
    expect(
      focus.entries.map((entry) => ({
        itemId: entry.item.id,
        planId: entry.origin?.learningPlan.id ?? null,
      })),
    ).toEqual([
      { itemId: firstItem.id, planId: firstPlan.id },
      { itemId: secondItem.id, planId: secondPlan.id },
      { itemId: unplannedItem.id, planId: null },
    ]);
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
      entries: [{ item: { id: item.id, status: "done" }, origin: null }],
    });

    const removed = await request(app)
      .delete(`/api/daily-focus/${focus.id}/items/${item.id}`)
      .set(TEST_USER_HEADER, user);

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      id: focus.id,
      done: 0,
      total: 0,
      entries: [],
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

    const intruderPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, intruder)
        .send({ name: "Intruder plan" })
    ).body as { id: string };
    await request(app)
      .post(`/api/learning-plans/${intruderPlan.id}/items`)
      .set(TEST_USER_HEADER, intruder)
      .send({ itemId: intruderItem.id })
      .expect(201);
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, owner)
      .send({
        itemId: ownerItem.id,
        origin: { learningPlanId: intruderPlan.id },
      })
      .expect(404);
    const intruderPlacement = await harness.pool.query<{ id: string }>(
      "select id from learning_plan_item_placements where item_id = $1",
      [intruderItem.id],
    );
    await expect(
      harness.pool.query(
        `insert into daily_focus_item_origins
          (daily_focus_id, user_id, item_id, placement_id)
         values ($1, $2, $3, $4)`,
        [focus.id, focus.userId, ownerItem.id, intruderPlacement.rows[0].id],
      ),
    ).rejects.toThrow(/daily_focus_item_origins_placement_fk/);

    await request(app)
      .post("/api/items")
      .set(TEST_USER_HEADER, owner)
      .send({ title: "Captured only", type: "article" });
    const refreshed = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, owner);
    const refreshedFocus = refreshed.body as DailyFocus;
    expect(refreshedFocus.entries).toHaveLength(1);
    expect(refreshedFocus.entries[0]?.item.id).toBe(ownerItem.id);
    expect(refreshedFocus.entries[0]?.origin).toBeNull();
  });
});
