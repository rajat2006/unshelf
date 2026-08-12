import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  DailyFocus,
  DailyPlanning,
  Item,
  ItemDetail,
  Label,
  LearningPlan,
  Stage,
} from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";

describe("Daily Planning service", () => {
  let harness: TestApp;
  let app: Express;

  beforeAll(async () => {
    harness = await startTestApp();
    app = harness.app;
  });

  afterAll(async () => harness.stop());

  it("orders suggestion groups and keeps the highest-priority truthful explanation", async () => {
    const user = "daily-planning-priority";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const yesterday = await createItem("Continue yesterday's indexes");
    const planned = await createItem("Plan-aware query execution");
    const dormant = await createItem("Dormant transaction internals");
    const targeted = await createItem("Targeted storage reading");
    const recent = await createItem("Fresh uncommitted paper");

    const yesterdayFocus = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: yesterday.id })
        .expect(201)
    ).body as DailyFocus;
    await harness.pool.query(
      "update daily_focuses set date = current_date - 1 where id = $1",
      [yesterdayFocus.id],
    );

    const learningPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Database foundations" })
        .expect(201)
    ).body as LearningPlan;
    await request(app)
      .post(`/api/learning-plans/${learningPlan.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: planned.id })
      .expect(201);

    await request(app)
      .patch(`/api/items/${dormant.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "in_progress" })
      .expect(200);
    await harness.pool.query(
      "update items set activity_at = current_timestamp - interval '40 days' where id = $1",
      [dormant.id],
    );
    await request(app)
      .patch(`/api/items/${targeted.id}/target-date`)
      .set(TEST_USER_HEADER, user)
      .send({ targetDate: "2099-01-01" })
      .expect(200);

    const response = await request(app)
      .get("/api/daily-focus/today/planning")
      .query({ learningPlanId: learningPlan.id })
      .set(TEST_USER_HEADER, user);

    expect(response.status).toBe(200);
    const planning = response.body as DailyPlanning;

    expect(
      planning.suggestions.map(({ item, signal, explanation }) => ({
        itemId: item.id,
        signal,
        explanation,
      })),
    ).toEqual([
      {
        itemId: yesterday.id,
        signal: "unfinished_yesterday",
        explanation: "Unfinished from yesterday",
      },
      {
        itemId: planned.id,
        signal: "selected_plan",
        explanation: "In Database foundations",
      },
      {
        itemId: dormant.id,
        signal: "dormant_in_progress",
        explanation: "In progress and waiting longest",
      },
      {
        itemId: targeted.id,
        signal: "approaching_target",
        explanation: "Target date 2099-01-01",
      },
      {
        itemId: recent.id,
        signal: "recently_captured_uncommitted",
        explanation: "Recently captured and not in an active Learning Plan",
      },
    ]);
    expect(
      planning.suggestions.filter(
        (suggestion) => suggestion.item.id === yesterday.id,
      ),
    ).toHaveLength(1);
  });

  it("matches intention words across Item, Label, Learning Plan, and Stage names", async () => {
    const user = "daily-planning-intention";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const titleMatch = await createItem("Quartz indexing notes");
    const labelMatch = await createItem("Categorised reading");
    const planMatch = await createItem("Committed reading");
    const stageMatch = await createItem("Grouped reading");
    await createItem("Unrelated fresh capture");

    const label = (
      await request(app)
        .post("/api/labels")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Quartz systems" })
        .expect(201)
    ).body as Label;
    await request(app)
      .post(`/api/items/${labelMatch.id}/labels/${label.id}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);

    const plan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Quartz foundations" })
        .expect(201)
    ).body as LearningPlan;
    await request(app)
      .post(`/api/learning-plans/${plan.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: planMatch.id })
      .expect(201);
    const stage = (
      await request(app)
        .post(`/api/learning-plans/${plan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Quartz internals" })
        .expect(201)
    ).body as Stage;
    await request(app)
      .post(`/api/stages/${stage.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: stageMatch.id })
      .expect(200);
    for (const item of [planMatch, stageMatch]) {
      await request(app)
        .patch(`/api/items/${item.id}/target-date`)
        .set(TEST_USER_HEADER, user)
        .send({ targetDate: "2099-02-01" })
        .expect(200);
    }

    const response = await request(app)
      .get("/api/daily-focus/today/planning")
      .query({ intention: "QUARTZ!" })
      .set(TEST_USER_HEADER, user)
      .expect(200);
    const planning = response.body as DailyPlanning;

    expect(
      planning.suggestions.map((suggestion) => suggestion.item.id),
    ).toEqual(
      expect.arrayContaining([
        titleMatch.id,
        labelMatch.id,
        planMatch.id,
        stageMatch.id,
      ]),
    );
    expect(planning.suggestions).toHaveLength(4);
  });

  it("excludes suggestion noise while keeping suppression limited to suggestions", async () => {
    const user = "daily-planning-exclusions";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const visible = await createItem("Needle visible");
    const done = await createItem("Needle done");
    const selected = await createItem("Needle already selected");
    const suppressed = await createItem("Needle not today");
    await request(app)
      .patch(`/api/items/${done.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" })
      .expect(200);
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: selected.id })
      .expect(201);
    await request(app)
      .post("/api/daily-focus/today/suppressions")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: suppressed.id })
      .expect(204);

    const readPlanning = async () =>
      (
        await request(app)
          .get("/api/daily-focus/today/planning")
          .query({ query: "needle" })
          .set(TEST_USER_HEADER, user)
          .expect(200)
      ).body as DailyPlanning;
    const first = await readPlanning();
    const refreshed = await readPlanning();

    for (const planning of [first, refreshed]) {
      expect(planning.searchResults.map((item) => item.id)).toEqual(
        expect.arrayContaining([visible.id, done.id, suppressed.id]),
      );
      expect(planning.searchResults.map((item) => item.id)).not.toContain(
        selected.id,
      );
      expect(
        planning.suggestions.map((suggestion) => suggestion.item.id),
      ).toEqual([visible.id]);
    }

    await harness.pool.query(
      "update daily_planning_suppressions set date = current_date - 1 where item_id = $1",
      [suppressed.id],
    );
    const nextDate = await readPlanning();
    expect(nextDate.searchResults.map((item) => item.id)).toEqual(
      expect.arrayContaining([visible.id, suppressed.id]),
    );

    await request(app)
      .post("/api/daily-focus/today/suppressions")
      .set(TEST_USER_HEADER, "daily-planning-intruder")
      .send({ itemId: visible.id })
      .expect(404);
  });

  it("initializes and updates durable Item activity only for documented activity", async () => {
    const user = "daily-planning-activity";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Track honest activity", type: "course" })
        .expect(201)
    ).body as Item;
    const initial = await harness.pool.query<{
      created_at: Date;
      activity_at: Date;
    }>("select created_at, activity_at from items where id = $1", [item.id]);
    expect(initial.rows[0].activity_at).toEqual(initial.rows[0].created_at);

    const backdate = async () => {
      await harness.pool.query(
        "update items set activity_at = current_timestamp - interval '60 days' where id = $1",
        [item.id],
      );
    };
    const activityAt = async () => {
      const result = await harness.pool.query<{ activity_at: Date }>(
        "select activity_at from items where id = $1",
        [item.id],
      );
      return result.rows[0].activity_at;
    };

    await backdate();
    const beforeNoop = await activityAt();
    await request(app)
      .patch(`/api/items/${item.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "not_started" })
      .expect(200);
    expect(await activityAt()).toEqual(beforeNoop);

    await request(app)
      .patch(`/api/items/${item.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "in_progress" })
      .expect(200);
    expect((await activityAt()).getTime()).toBeGreaterThan(Date.now() - 30_000);

    await backdate();
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["First Part"] })
        .expect(201)
    ).body as ItemDetail;
    expect((await activityAt()).getTime()).toBeGreaterThan(Date.now() - 30_000);

    await backdate();
    await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true })
      .expect(200);
    expect((await activityAt()).getTime()).toBeGreaterThan(Date.now() - 30_000);

    await backdate();
    await request(app)
      .delete(`/api/items/${item.id}/parts/${structured.parts[0].id}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    expect((await activityAt()).getTime()).toBeGreaterThan(Date.now() - 30_000);
  });

  it("uses documented dates and stable Item identity as group tie-breakers", async () => {
    const user = "daily-planning-tie-breakers";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const yesterday = await Promise.all([
      createItem("Yesterday A"),
      createItem("Yesterday B"),
    ]);
    const planned = await Promise.all([
      createItem("Planned A"),
      createItem("Planned B"),
    ]);
    const dormantOld = await createItem("Dormant old");
    const dormantNew = await createItem("Dormant new");
    const targetNear = await createItem("Target near");
    const targetFar = await createItem("Target far");
    const recentNew = await createItem("Recent new");
    const recentOld = await createItem("Recent old");

    for (const item of yesterday) {
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201);
    }
    await harness.pool.query(
      `update daily_focuses set date = current_date - 1
       where user_id = (select id from users where clerk_user_id = $1)`,
      [user],
    );
    await harness.pool.query(
      `update daily_focus_items set added_at = '2026-01-01T00:00:00Z'
       where item_id = any($1::uuid[])`,
      [yesterday.map((item) => item.id)],
    );

    const plan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Tie-breaker plan" })
        .expect(201)
    ).body as LearningPlan;
    for (const item of planned) {
      await request(app)
        .post(`/api/learning-plans/${plan.id}/items`)
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201);
    }

    for (const item of [dormantOld, dormantNew]) {
      await request(app)
        .patch(`/api/items/${item.id}/status`)
        .set(TEST_USER_HEADER, user)
        .send({ status: "in_progress" })
        .expect(200);
    }
    await harness.pool.query(
      `update items set activity_at = case id
         when $1 then '2025-01-01T00:00:00Z'::timestamptz
         else '2025-02-01T00:00:00Z'::timestamptz
       end where id = any($2::uuid[])`,
      [dormantOld.id, [dormantOld.id, dormantNew.id]],
    );
    for (const [item, targetDate] of [
      [targetNear, "2099-01-01"],
      [targetFar, "2099-02-01"],
    ] as const) {
      await request(app)
        .patch(`/api/items/${item.id}/target-date`)
        .set(TEST_USER_HEADER, user)
        .send({ targetDate })
        .expect(200);
    }
    await harness.pool.query(
      `update items set created_at = case id
         when $1 then '2026-02-01T00:00:00Z'::timestamptz
         else '2026-01-01T00:00:00Z'::timestamptz
       end where id = any($2::uuid[])`,
      [recentNew.id, [recentNew.id, recentOld.id]],
    );

    const response = await request(app)
      .get("/api/daily-focus/today/planning")
      .query({ learningPlanId: plan.id })
      .set(TEST_USER_HEADER, user)
      .expect(200);
    const planning = response.body as DailyPlanning;
    const stableIds = (values: Item[]) =>
      values.map((item) => item.id).sort((a, b) => a.localeCompare(b));

    expect(
      planning.suggestions.map((suggestion) => suggestion.item.id),
    ).toEqual([
      ...stableIds(yesterday),
      ...stableIds(planned),
      dormantOld.id,
      dormantNew.id,
      targetNear.id,
      targetFar.id,
      recentNew.id,
      recentOld.id,
    ]);
  });
});
