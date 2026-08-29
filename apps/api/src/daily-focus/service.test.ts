import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  DailyFocus,
  DailyFocusHistory,
  Item,
  ItemDetail,
} from "@unshelf/shared";
import {
  seedItemTombstone,
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

  it("keeps today's complete Item snapshot current with Item changes", async () => {
    const user = "daily-focus-current-snapshot";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Work through database internals", type: "course" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["Storage", "Indexes"] })
    ).body as ItemDetail;

    const selected = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201)
    ).body as DailyFocus;
    expect(selected.entries[0]).toMatchObject({
      snapshot: {
        title: item.title,
        type: "course",
        status: "not_started",
        partPercentage: 0,
      },
    });

    await request(app)
      .patch(`/api/items/${item.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" })
      .expect(200);
    const manuallyCompleted = (
      await request(app)
        .get("/api/daily-focus/today")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyFocus;
    expect(manuallyCompleted.entries[0]).toMatchObject({
      snapshot: {
        title: item.title,
        type: "course",
        status: "done",
        partPercentage: 0,
      },
    });

    await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true })
      .expect(200);
    const refreshed = (
      await request(app)
        .get("/api/daily-focus/today")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyFocus;

    expect(refreshed.entries[0]).toMatchObject({
      item: { id: item.id, status: "in_progress" },
      snapshot: {
        title: item.title,
        type: "course",
        status: "in_progress",
        partPercentage: 50,
      },
    });
  });

  it("freezes elapsed history and requires explicit re-addition on the new date", async () => {
    const user = "daily-focus-history-owner";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Keep yesterday honest", type: "book" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["First half", "Second half"] })
    ).body as ItemDetail;
    const selected = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201)
    ).body as DailyFocus;
    await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true })
      .expect(200);

    const elapsed = await harness.pool.query<{ date: string }>(
      `update daily_focuses
       set date = current_date - 1
       where id = $1
       returning date::text`,
      [selected.id],
    );
    const historicalDate = elapsed.rows[0].date;

    await request(app)
      .patch(`/api/items/${item.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" })
      .expect(200);
    await harness.pool.query(
      "update items set title = 'Mutable current title', type = 'video' where id = $1",
      [item.id],
    );
    const history = await request(app)
      .get(`/api/daily-focus/${historicalDate}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);

    const historicalFocus = history.body as DailyFocusHistory;
    expect(historicalFocus).toMatchObject({
      id: selected.id,
      date: historicalDate,
      done: 0,
      total: 1,
    });
    expect(historicalFocus.entries).toEqual([
      {
        availability: "available",
        itemId: item.id,
        origin: null,
        snapshot: {
          title: item.title,
          type: "book",
          status: "in_progress",
          partPercentage: 50,
        },
      },
    ]);
    await request(app)
      .delete(`/api/daily-focus/${selected.id}/items/${item.id}`)
      .set(TEST_USER_HEADER, user)
      .expect(404);
    await request(app)
      .get(`/api/daily-focus/${historicalDate}`)
      .set(TEST_USER_HEADER, "daily-focus-history-intruder")
      .expect(404);

    const today = (
      await request(app)
        .get("/api/daily-focus/today")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyFocus;
    expect(today).toMatchObject({ total: 0, entries: [] });
    expect(today.id).not.toBe(selected.id);

    const reconsidered = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id })
      .expect(201);
    expect(reconsidered.body).toMatchObject({
      done: 1,
      total: 1,
      entries: [
        {
          item: { id: item.id, status: "done" },
          snapshot: {
            title: "Mutable current title",
            type: "video",
            status: "done",
            partPercentage: 50,
          },
        },
      ],
    });
  });

  it("returns a deleted elapsed entry as an inert frozen snapshot", async () => {
    const user = "daily-focus-deleted-history";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "History survives deletion", type: "article" })
    ).body as Item;
    const selected = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201)
    ).body as DailyFocus;
    const elapsed = await harness.pool.query<{ date: string }>(
      `update daily_focuses
       set date = current_date - 1
       where id = $1
       returning date::text`,
      [selected.id],
    );
    await harness.pool.query(
      `update items
       set title = 'Changed live title', type = 'course', status = 'done',
           deleted_at = now()
       where id = $1`,
      [item.id],
    );

    const history = await request(app)
      .get(`/api/daily-focus/${elapsed.rows[0].date}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);

    expect(history.body).toMatchObject({ done: 0, total: 1 });
    expect((history.body as DailyFocusHistory).entries).toEqual([
      {
        availability: "deleted",
        snapshot: {
          title: item.title,
          type: "article",
          status: "not_started",
          partPercentage: null,
        },
      },
    ]);
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

  it("refuses stale origins and retains archived placement context", async () => {
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
      .expect(201);

    const focus = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, user)
      .expect(200);
    expect(focus.body).toMatchObject({
      total: 1,
      entries: [
        {
          item: { id: item.id },
          origin: {
            learningPlan: { id: learningPlan.id, name: "Origin plan" },
            stage: null,
          },
        },
      ],
    });
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
    await harness.pool.query(
      "update daily_focus_items set status_snapshot = 'not_started' where daily_focus_id = $1 and item_id = $2",
      [focus.id, item.id],
    );
    const refreshed = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, user);

    expect(refreshed.body).toMatchObject({
      id: focus.id,
      done: 1,
      total: 1,
      entries: [
        {
          item: { id: item.id, status: "done" },
          origin: null,
          snapshot: {
            title: item.title,
            type: "course",
            status: "not_started",
            partPercentage: null,
          },
        },
      ],
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

  it("hides a tombstone from Today and rejects its membership mutations", async () => {
    const user = "daily-focus-tombstone";
    const ended = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Ended Today Item", type: "article" })
    ).body as Item;
    const active = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Active Today Item", type: "book" })
    ).body as Item;
    const focus = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: ended.id })
        .expect(201)
    ).body as DailyFocus;
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: active.id })
      .expect(201);
    await request(app)
      .patch(`/api/items/${active.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" })
      .expect(200);
    const foreignUser = "daily-focus-tombstone-foreign";
    const foreignItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, foreignUser)
        .send({ title: "Foreign Today Item", type: "video" })
    ).body as Item;
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, foreignUser)
      .send({ itemId: foreignItem.id })
      .expect(201);
    await seedItemTombstone(harness.pool, ended.id);

    const today = await request(app)
      .get("/api/daily-focus/today")
      .set(TEST_USER_HEADER, user);
    const added = await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: ended.id });
    const removed = await request(app)
      .delete(`/api/daily-focus/${focus.id}/items/${ended.id}`)
      .set(TEST_USER_HEADER, user);

    expect(today.body).toMatchObject({
      done: 1,
      total: 1,
      entries: [{ item: { id: active.id } }],
    });
    expect(added.status).toBe(404);
    expect(added.body).toEqual({ error: "item not found" });
    expect(removed.status).toBe(404);
    expect(removed.body).toEqual({ error: "daily focus or item not found" });
    const retained = await harness.pool.query(
      "SELECT item_id FROM daily_focus_items WHERE daily_focus_id = $1 AND item_id = $2",
      [focus.id, ended.id],
    );
    expect(retained.rows).toHaveLength(1);
    const foreignToday = (
      await request(app)
        .get("/api/daily-focus/today")
        .set(TEST_USER_HEADER, foreignUser)
    ).body as DailyFocus;
    expect(foreignToday.entries).toMatchObject([
      { item: { id: foreignItem.id } },
    ]);
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
        `insert into daily_focus_items
          (daily_focus_id, user_id, item_id, title_snapshot, type_snapshot, status_snapshot)
         values ($1, $2, $3, 'Owner snapshot', 'book', 'not_started')`,
        [focus.id, focus.userId, ownerItem.id],
      ),
    ).rejects.toThrow(/daily_focus_items_daily_focus_id_item_id_pk/);
    await expect(
      harness.pool.query(
        `insert into daily_focus_items
          (daily_focus_id, user_id, item_id, title_snapshot, type_snapshot, status_snapshot)
         values ($1, $2, $3, 'Foreign snapshot', 'book', 'not_started')`,
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
