import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  DailyFocus,
  DailyPlanning,
  Item,
  Label,
  LearningPlan,
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

  it("returns one capped suggestion from each current signal in priority order", async () => {
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
    const targetedRecent = await createItem("Targeted storage reading");
    await createItem("Fresh paper");
    const recent = await createItem("Another fresh paper");

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

    await harness.pool.query(
      "update items set target_date = current_date where id = $1",
      [targetedRecent.id],
    );

    const response = await request(app)
      .get("/api/daily-focus/today/planning")
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
        itemId: targetedRecent.id,
        signal: "target_date",
        explanation: "Target date is Today",
      },
      {
        itemId: recent.id,
        signal: "recent_capture",
        explanation: "Captured recently",
      },
    ]);
    expect(planning.suggestions).toHaveLength(3);
  });

  it("uses inclusive Target-date boundaries and explains their stable order", async () => {
    const user = "daily-planning-target-dates";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const today = await createItem("Target Today");
    const pastBoundary = await createItem("Target seven days ago");
    const futureBoundary = await createItem("Target in seven days");
    const pastOutside = await createItem("Target eight days ago");
    const futureOutside = await createItem("Target in eight days");
    await harness.pool.query(
      `update items set
         created_at = current_date - 30,
         target_date = case id
           when $1 then current_date
           when $2 then current_date - 7
           when $3 then current_date + 7
           when $4 then current_date - 8
           when $5 then current_date + 8
         end
       where id = any($6::uuid[])`,
      [
        today.id,
        pastBoundary.id,
        futureBoundary.id,
        pastOutside.id,
        futureOutside.id,
        [
          today.id,
          pastBoundary.id,
          futureBoundary.id,
          pastOutside.id,
          futureOutside.id,
        ],
      ],
    );

    const planning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyPlanning;

    expect(planning.suggestions.map(({ item }) => item.id)).toEqual([
      today.id,
      pastBoundary.id,
      futureBoundary.id,
    ]);
    expect(planning.suggestions[0].explanation).toBe("Target date is Today");
    expect(planning.suggestions[1].explanation).toMatch(
      /^Target date was 7 days ago/,
    );
    expect(planning.suggestions[2].explanation).toMatch(
      /^Target date is in 7 days/,
    );
    expect(planning.suggestions.map(({ item }) => item.id)).not.toEqual(
      expect.arrayContaining([pastOutside.id, futureOutside.id]),
    );
  });

  it("uses Item ID as the final Target-date and yesterday tie-breaker", async () => {
    const createItem = async ({
      user,
      title,
    }: {
      user: string;
      title: string;
    }) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;

    const targetUser = "daily-planning-target-id-tie";
    const targeted = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createItem({ user: targetUser, title: `Target tie ${index}` }),
      ),
    );
    await harness.pool.query(
      `update items
       set created_at = current_date - 30, target_date = current_date + 1
       where id = any($1::uuid[])`,
      [targeted.map(({ id }) => id)],
    );
    const targetPlanning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, targetUser)
        .expect(200)
    ).body as DailyPlanning;
    expect(targetPlanning.suggestions.map(({ item }) => item.id)).toEqual(
      targeted
        .map(({ id }) => id)
        .sort((first, second) => first.localeCompare(second))
        .slice(0, 3),
    );

    const yesterdayUser = "daily-planning-yesterday-id-tie";
    const yesterday = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        createItem({ user: yesterdayUser, title: `Yesterday tie ${index}` }),
      ),
    );
    for (const item of yesterday) {
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, yesterdayUser)
        .send({ itemId: item.id })
        .expect(201);
    }
    await harness.pool.query(
      `update daily_focuses set date = current_date - 1
       where user_id = (select id from users where clerk_user_id = $1)`,
      [yesterdayUser],
    );
    await harness.pool.query(
      `update daily_focus_items set added_at = current_date - interval '1 hour'
       where item_id = any($1::uuid[])`,
      [yesterday.map(({ id }) => id)],
    );
    await harness.pool.query(
      "update items set created_at = current_date - 30 where id = any($1::uuid[])",
      [yesterday.map(({ id }) => id)],
    );
    const yesterdayPlanning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, yesterdayUser)
        .expect(200)
    ).body as DailyPlanning;
    expect(yesterdayPlanning.suggestions.map(({ item }) => item.id)).toEqual(
      yesterday
        .map(({ id }) => id)
        .sort((first, second) => first.localeCompare(second))
        .slice(0, 3),
    );
  });

  it("ages Captures after seven calendar dates and orders stable ties by Item ID", async () => {
    const user = "daily-planning-capture-dates";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const captures = await Promise.all(
      Array.from({ length: 9 }, (_, index) => createItem(`Capture ${index}`)),
    );
    for (const [index, item] of captures.entries()) {
      const age = index === 1 ? 0 : index === 0 ? 0 : index - 1;
      await harness.pool.query(
        "update items set created_at = current_date - $1::integer + interval '12 hours' where id = $2",
        [age, item.id],
      );
    }
    const eligible = [
      ...captures.slice(0, 2).sort((a, b) => a.id.localeCompare(b.id)),
      ...captures.slice(2, 8),
    ];
    const traversed: string[] = [];
    while (true) {
      const planning = (
        await request(app)
          .get("/api/daily-focus/today/planning")
          .set(TEST_USER_HEADER, user)
          .expect(200)
      ).body as DailyPlanning;
      if (planning.suggestions.length === 0) break;
      for (const suggestion of planning.suggestions) {
        traversed.push(suggestion.item.id);
        await request(app)
          .post("/api/daily-focus/today/suppressions")
          .set(TEST_USER_HEADER, user)
          .send({ itemId: suggestion.item.id })
          .expect(204);
      }
    }

    expect(traversed).toEqual(eligible.map((item) => item.id));
    expect(traversed).not.toContain(captures[8].id);
  });

  it("returns vacant signal slots to higher-priority remaining candidates", async () => {
    const user = "daily-planning-vacancy";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const yesterdayFirst = await createItem("Yesterday first");
    const yesterdaySecond = await createItem("Yesterday second");
    await createItem("Recent older");
    const recentNewest = await createItem("Recent newest");
    for (const item of [yesterdayFirst, yesterdaySecond]) {
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
      `update daily_focus_items set added_at = case item_id
         when $1 then current_date - interval '2 hours'
         else current_date - interval '1 hour'
       end
       where item_id = any($2::uuid[])`,
      [yesterdayFirst.id, [yesterdayFirst.id, yesterdaySecond.id]],
    );

    const planning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyPlanning;

    expect(planning.suggestions.map(({ item }) => item.id)).toEqual([
      yesterdayFirst.id,
      yesterdaySecond.id,
      recentNewest.id,
    ]);
  });

  it("returns a sparse shortlist or an empty shortlist without filling a quota", async () => {
    const sparseUser = "daily-planning-sparse";
    const sparse = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, sparseUser)
        .send({ title: "Only current choice", type: "article" })
        .expect(201)
    ).body as Item;
    const sparsePlanning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, sparseUser)
        .expect(200)
    ).body as DailyPlanning;
    expect(sparsePlanning.suggestions.map(({ item }) => item.id)).toEqual([
      sparse.id,
    ]);

    const emptyUser = "daily-planning-empty";
    const old = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, emptyUser)
        .send({ title: "No current signal", type: "article" })
        .expect(201)
    ).body as Item;
    await harness.pool.query(
      "update items set created_at = current_date - 30 where id = $1",
      [old.id],
    );
    const emptyPlanning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, emptyUser)
        .expect(200)
    ).body as DailyPlanning;
    expect(emptyPlanning.suggestions).toEqual([]);
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
    const sourceMatch = await createItem("Source match");
    const labelMatch = await createItem("Label match");
    const done = await createItem("Needle done");
    const selected = await createItem("Needle already selected");
    const suppressed = await createItem("Needle not today");
    const foreign = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, "daily-planning-foreign-user")
        .send({ title: "Needle private", type: "article" })
        .expect(201)
    ).body as Item;
    await harness.pool.query(
      "update items set source = 'https://needle.example', created_at = current_date - 30 where id = $1",
      [sourceMatch.id],
    );
    await harness.pool.query(
      "update items set created_at = current_date - 30 where id = $1",
      [labelMatch.id],
    );
    const label = (
      await request(app)
        .post("/api/labels")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Needle systems" })
        .expect(201)
    ).body as Label;
    await request(app)
      .post(`/api/items/${labelMatch.id}/labels/${label.id}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
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
        expect.arrayContaining([
          visible.id,
          sourceMatch.id,
          labelMatch.id,
          done.id,
          suppressed.id,
        ]),
      );
      expect(planning.searchResults.map((item) => item.id)).not.toContain(
        selected.id,
      );
      expect(planning.searchResults.map((item) => item.id)).not.toContain(
        foreign.id,
      );
      expect(planning.suggestions.map(({ item }) => item.id)).not.toContain(
        foreign.id,
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

  it("keeps recent Capture eligibility neutral to Learning Plan placement", async () => {
    const user = "daily-planning-plan-neutrality";
    const createItem = async (title: string) =>
      (
        await request(app)
          .post("/api/items")
          .set(TEST_USER_HEADER, user)
          .send({ title, type: "article" })
          .expect(201)
      ).body as Item;
    const activeRecent = await createItem("Recent in active Plan");
    const archivedRecent = await createItem("Recent in archived Plan");
    const placementOnly = await createItem("Old Plan placement");
    const inProgressOnly = await createItem("Old in progress Item");
    const activePlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Active Plan" })
        .expect(201)
    ).body as LearningPlan;
    const archivedPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Archived Plan" })
        .expect(201)
    ).body as LearningPlan;
    for (const [plan, item] of [
      [activePlan, activeRecent],
      [archivedPlan, archivedRecent],
      [activePlan, placementOnly],
    ] as const) {
      await request(app)
        .post(`/api/learning-plans/${plan.id}/items`)
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
        .expect(201);
    }
    await request(app)
      .post(`/api/learning-plans/${archivedPlan.id}/archive`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    await request(app)
      .patch(`/api/items/${inProgressOnly.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "in_progress" })
      .expect(200);
    await harness.pool.query(
      "update items set created_at = current_date - 30 where id = any($1::uuid[])",
      [[placementOnly.id, inProgressOnly.id]],
    );

    const planning = (
      await request(app)
        .get("/api/daily-focus/today/planning")
        .set(TEST_USER_HEADER, user)
        .expect(200)
    ).body as DailyPlanning;

    expect(planning.suggestions).toHaveLength(2);
    expect(planning.suggestions.map(({ item }) => item.id)).toEqual(
      expect.arrayContaining([activeRecent.id, archivedRecent.id]),
    );
  });

  it("rejects the retired temporary planning inputs", async () => {
    await request(app)
      .get("/api/daily-focus/today/planning")
      .query({ intention: "databases" })
      .set(TEST_USER_HEADER, "daily-planning-retired-inputs")
      .expect(400);
    await request(app)
      .get("/api/daily-focus/today/planning")
      .query({ learningPlanId: "00000000-0000-4000-8000-000000000001" })
      .set(TEST_USER_HEADER, "daily-planning-retired-inputs")
      .expect(400);
  });
});
