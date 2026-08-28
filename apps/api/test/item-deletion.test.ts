import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
let app: Express;

const capture = (clerkUserId: string, body: object) =>
  request(app).post("/api/items").set(TEST_USER_HEADER, clerkUserId).send(body);

const deleteItem = (clerkUserId: string, itemId: string) =>
  request(app)
    .delete(`/api/items/${itemId}`)
    .set(TEST_USER_HEADER, clerkUserId);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => harness.stop());

describe("DELETE /api/items/:itemId", () => {
  it("permanently ends one owned Item with an empty 204 response", async () => {
    const user = "delete-item-http-owner";
    const item = (
      await capture(user, { title: "Atomic deletion", type: "course" })
    ).body as Item;

    const response = await deleteItem(user, item.id);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it("atomically removes active organisation while preserving frozen history and scalar facts", async () => {
    const user = "delete-item-core-cleanup";
    const item = (
      await capture(user, {
        title: "Retained scalar facts",
        type: "book",
        source: "https://example.com/retained",
      })
    ).body as Item;
    const unrelated = (
      await capture(user, { title: "Unrelated Item", type: "video" })
    ).body as Item;
    const parts = await request(app)
      .post(`/api/items/${item.id}/parts`)
      .set(TEST_USER_HEADER, user)
      .send({ titles: ["First", "Second"] });
    await request(app)
      .patch(`/api/items/${item.id}/parts/${parts.body.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });
    await request(app)
      .patch(`/api/items/${item.id}/target-date`)
      .set(TEST_USER_HEADER, user)
      .send({ targetDate: "2026-09-30" });
    const label = (
      await request(app)
        .post("/api/labels")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Keep the Label" })
    ).body as { id: string };
    await request(app)
      .post(`/api/items/${item.id}/labels/${label.id}`)
      .set(TEST_USER_HEADER, user);
    await request(app)
      .post("/api/daily-focus/today/suppressions")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    await harness.pool.query(
      `insert into daily_planning_suppressions (user_id, item_id, date)
       values ($1, $2, current_date + 1)`,
      [item.userId, item.id],
    );
    const elapsedFocus = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id })
    ).body as { id: string };
    const elapsedDate = await harness.pool.query<{ date: string }>(
      `update daily_focuses set date = current_date - 1
       where id = $1 returning date::text`,
      [elapsedFocus.id],
    );
    await request(app)
      .post("/api/daily-focus/today/items")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    const before = await harness.pool.query(
      `select id, user_id, title, source, created_at, type, status,
              status_mode, target_date, completed_at
       from items where id = $1`,
      [item.id],
    );

    await deleteItem(user, item.id).expect(204);

    const after = await harness.pool.query(
      `select id, user_id, title, source, created_at, type, status,
              status_mode, target_date, completed_at, deleted_at
       from items where id = $1`,
      [item.id],
    );
    const relationships = await harness.pool.query<{
      parts: number;
      labels: number;
      suppressions: number;
      current_focus: number;
      elapsed_focus: number;
    }>(
      `select
         (select count(*)::int from parts where item_id = $1) as parts,
         (select count(*)::int from item_labels where item_id = $1) as labels,
         (select count(*)::int from daily_planning_suppressions where item_id = $1) as suppressions,
         (select count(*)::int
            from daily_focus_items membership
            join daily_focuses focus on focus.id = membership.daily_focus_id
           where membership.item_id = $1 and focus.date = current_date) as current_focus,
         (select count(*)::int
            from daily_focus_items membership
            join daily_focuses focus on focus.id = membership.daily_focus_id
           where membership.item_id = $1 and focus.date < current_date) as elapsed_focus`,
      [item.id],
    );
    const history = await request(app)
      .get(`/api/daily-focus/${elapsedDate.rows[0].date}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);

    expect(after.rows[0]).toMatchObject(before.rows[0]);
    expect(after.rows[0].deleted_at).toBeInstanceOf(Date);
    expect(relationships.rows[0]).toEqual({
      parts: 0,
      labels: 0,
      suppressions: 0,
      current_focus: 0,
      elapsed_focus: 1,
    });
    expect(history.body).toMatchObject({
      done: 0,
      total: 1,
      entries: [
        {
          kind: "deleted",
          snapshot: {
            title: item.title,
            type: "book",
            status: "in_progress",
            partPercentage: 50,
          },
        },
      ],
    });
    expect(
      (await request(app).get("/api/labels").set(TEST_USER_HEADER, user)).body,
    ).toContainEqual(expect.objectContaining({ id: label.id }));
    expect(
      (await request(app).get("/api/items").set(TEST_USER_HEADER, user)).body,
    ).toEqual([expect.objectContaining({ id: unrelated.id })]);
  });

  it("removes Plan placements and exact Keeps without changing retained topology or Discover data", async () => {
    const user = "delete-item-plan-discover";
    const item = (
      await capture(user, { title: "Placed and kept", type: "video" })
    ).body as Item;
    const beforeItem = (
      await capture(user, { title: "Before", type: "article" })
    ).body as Item;
    const afterItem = (await capture(user, { title: "After", type: "book" }))
      .body as Item;
    const directPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Direct topology" })
    ).body as { id: string };
    for (const placed of [beforeItem, item, afterItem]) {
      await request(app)
        .post(`/api/learning-plans/${directPlan.id}/items`)
        .set(TEST_USER_HEADER, user)
        .send({ itemId: placed.id })
        .expect(201);
    }
    const directTopology = (
      await request(app)
        .get(`/api/learning-plans/${directPlan.id}/topology`)
        .set(TEST_USER_HEADER, user)
    ).body as { nodes: Array<{ id: string; item?: Item }> };
    const nodeFor = (targetId: string): string => {
      const node = directTopology.nodes.find(
        ({ item: placed }) => placed?.id === targetId,
      );
      if (!node) throw new Error(`missing direct node for ${targetId}`);
      return node.id;
    };
    const beforeNode = nodeFor(beforeItem.id);
    const itemNode = nodeFor(item.id);
    const afterNode = nodeFor(afterItem.id);
    for (const endpoints of [
      { fromNodeId: beforeNode, toNodeId: itemNode },
      { fromNodeId: itemNode, toNodeId: afterNode },
    ]) {
      await request(app)
        .post(`/api/learning-plans/${directPlan.id}/edges`)
        .set(TEST_USER_HEADER, user)
        .send(endpoints)
        .expect(201);
    }

    const stagedPlan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Archived staged topology" })
    ).body as { id: string };
    const itemStage = (
      await request(app)
        .post(`/api/learning-plans/${stagedPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Retained Stage" })
    ).body as { id: string };
    const neighbourStage = (
      await request(app)
        .post(`/api/learning-plans/${stagedPlan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Retained neighbour" })
    ).body as { id: string };
    await request(app)
      .post(`/api/stages/${itemStage.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id })
      .expect(200);
    await request(app)
      .post(`/api/learning-plans/${stagedPlan.id}/edges`)
      .set(TEST_USER_HEADER, user)
      .send({ fromNodeId: itemStage.id, toNodeId: neighbourStage.id })
      .expect(201);
    await request(app)
      .post(`/api/learning-plans/${stagedPlan.id}/archive`)
      .set(TEST_USER_HEADER, user)
      .expect(200);

    const elapsedFocus = (
      await request(app)
        .post("/api/daily-focus/today/items")
        .set(TEST_USER_HEADER, user)
        .send({ itemId: item.id, origin: { learningPlanId: directPlan.id } })
    ).body as { id: string };
    await harness.pool.query(
      "update daily_focuses set date = current_date - 1 where id = $1",
      [elapsedFocus.id],
    );

    const targetId = randomUUID();
    const resultIds = {
      firstKept: randomUUID(),
      secondKept: randomUUID(),
      pending: randomUUID(),
      rejected: randomUUID(),
    };
    const candidateIds = {
      firstKept: randomUUID(),
      secondKept: randomUUID(),
      pending: randomUUID(),
      rejected: randomUUID(),
    };
    await harness.pool.query(
      `insert into discover_provider_targets
         (id, provider, external_id, canonical_url, title, uploads_playlist_id)
       values ($1, 'youtube', $2, $3, 'Retained target', $4)`,
      [
        targetId,
        `channel-${targetId}`,
        `https://youtube.com/channel/${targetId}`,
        `uploads-${targetId}`,
      ],
    );
    const identities = [
      [resultIds.firstKept, `kept-a-${targetId}`],
      [resultIds.secondKept, `kept-b-${targetId}`],
      [resultIds.pending, `pending-${targetId}`],
      [resultIds.rejected, `rejected-${targetId}`],
    ] as const;
    for (const [resultId, externalId] of identities) {
      await harness.pool.query(
        `insert into discover_provider_results
           (id, target_id, provider, external_id, source, title,
            published_at, duration_seconds)
         values ($1, $2, 'youtube', $3, $4, $5, now(), 600)`,
        [
          resultId,
          targetId,
          externalId,
          `https://youtube.com/watch?v=${externalId}`,
          externalId,
        ],
      );
    }
    await harness.pool.query(
      "insert into discover_follows (user_id, target_id) values ($1, $2)",
      [item.userId, targetId],
    );
    await harness.pool.query(
      `insert into discover_candidates
         (id, user_id, result_id, state, kept_at, rejected_at)
       values
         ($2, $1, $3, 'kept', now(), null),
         ($4, $1, $5, 'kept', now(), null),
         ($6, $1, $7, 'pending', null, null),
         ($8, $1, $9, 'rejected', null, now())`,
      [
        item.userId,
        candidateIds.firstKept,
        resultIds.firstKept,
        candidateIds.secondKept,
        resultIds.secondKept,
        candidateIds.pending,
        resultIds.pending,
        candidateIds.rejected,
        resultIds.rejected,
      ],
    );
    await harness.pool.query(
      `insert into item_provider_identities
         (user_id, provider, external_id, item_id)
       values
         ($1, 'youtube', $2, $6),
         ($1, 'youtube', $3, $6),
         ($1, 'youtube', $4, $6),
         ($1, 'youtube', $5, $6)`,
      [
        item.userId,
        identities[0][1],
        identities[1][1],
        identities[2][1],
        identities[3][1],
        item.id,
      ],
    );

    await deleteItem(user, item.id).expect(204);

    const remainingDirect = await request(app)
      .get(`/api/learning-plans/${directPlan.id}/topology`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    const remainingStaged = await request(app)
      .get(`/api/learning-plans/${stagedPlan.id}/topology`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
    const relationshipCounts = await harness.pool.query<{
      placements: number;
      origins: number;
      identities: number;
      targets: number;
      results: number;
      follows: number;
    }>(
      `select
         (select count(*)::int from learning_plan_item_placements where user_id = $1 and item_id = $2) as placements,
         (select count(*)::int from daily_focus_item_origins where user_id = $1 and item_id = $2) as origins,
         (select count(*)::int from item_provider_identities where user_id = $1 and item_id = $2) as identities,
         (select count(*)::int from discover_provider_targets where id = $3) as targets,
         (select count(*)::int from discover_provider_results where target_id = $3) as results,
         (select count(*)::int from discover_follows where user_id = $1 and target_id = $3) as follows`,
      [item.userId, item.id, targetId],
    );
    const candidates = await harness.pool.query<{ id: string; state: string }>(
      `select id, state from discover_candidates
       where user_id = $1 order by state, id`,
      [item.userId],
    );

    expect(remainingDirect.body.nodes).toEqual([
      expect.objectContaining({ id: beforeNode }),
      expect.objectContaining({ id: afterNode }),
    ]);
    expect(remainingDirect.body.edges).toEqual([]);
    expect(remainingStaged.body).toMatchObject({
      nodes: [
        expect.objectContaining({ id: itemStage.id, total: 0 }),
        expect.objectContaining({ id: neighbourStage.id }),
      ],
      edges: [{ fromNodeId: itemStage.id, toNodeId: neighbourStage.id }],
    });
    expect(relationshipCounts.rows[0]).toEqual({
      placements: 0,
      origins: 0,
      identities: 0,
      targets: 1,
      results: 4,
      follows: 1,
    });
    expect(candidates.rows).toEqual(
      expect.arrayContaining([
        { id: candidateIds.pending, state: "pending" },
        { id: candidateIds.rejected, state: "rejected" },
      ]),
    );
    expect(candidates.rows).toHaveLength(2);
  });

  it("makes replay an empty no-write success with the original deletion time", async () => {
    const user = "delete-item-replay";
    const item = (
      await capture(user, { title: "Retry safely", type: "article" })
    ).body as Item;
    await deleteItem(user, item.id).expect(204);
    const firstDeletion = await harness.pool.query<{ deleted_at: Date }>(
      "select deleted_at from items where id = $1",
      [item.id],
    );
    const sentinelPartId = randomUUID();
    await harness.pool.query(
      `insert into parts (id, user_id, item_id, title, position)
       values ($1, $2, $3, 'Replay sentinel', 0)`,
      [sentinelPartId, item.userId, item.id],
    );

    const replay = await deleteItem(user, item.id);

    const replayState = await harness.pool.query<{
      deleted_at: Date;
      sentinel_count: number;
    }>(
      `select item.deleted_at,
              (select count(*)::int from parts where id = $2) as sentinel_count
       from items item where item.id = $1`,
      [item.id, sentinelPartId],
    );
    expect(replay.status).toBe(204);
    expect(replay.text).toBe("");
    expect(replayState.rows[0]).toEqual({
      deleted_at: firstDeletion.rows[0].deleted_at,
      sentinel_count: 1,
    });
  });

  it("keeps missing and foreign Items private and leaves the foreign Item active", async () => {
    const owner = "delete-item-private-owner";
    const intruder = "delete-item-private-intruder";
    const foreign = (
      await capture(owner, { title: "Foreign Item", type: "course" })
    ).body as Item;
    const missingId = "00000000-0000-0000-0000-000000000000";

    const missing = await deleteItem(intruder, missingId);
    const foreignResponse = await deleteItem(intruder, foreign.id);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: "item not found" });
    expect(foreignResponse.status).toBe(404);
    expect(foreignResponse.body).toEqual(missing.body);
    expect(
      (
        await request(app)
          .get(`/api/items/${foreign.id}`)
          .set(TEST_USER_HEADER, owner)
      ).body,
    ).toMatchObject({ id: foreign.id });
  });

  it("uses the established malformed-id and unauthenticated envelopes", async () => {
    const malformed = await deleteItem("delete-item-invalid", "not-an-item-id");
    const unauthenticated = await request(app).delete(
      "/api/items/00000000-0000-0000-0000-000000000000",
    );

    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.itemId", message: "Must be a valid UUID" }],
    });
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toEqual({ error: "unauthenticated" });
  });

  it("rolls back cleanup and the tombstone when PostgreSQL rejects the final transition", async () => {
    const user = "delete-item-rollback";
    const item = (await capture(user, { title: "Remain whole", type: "book" }))
      .body as Item;
    await request(app)
      .post(`/api/items/${item.id}/parts`)
      .set(TEST_USER_HEADER, user)
      .send({ titles: ["Must survive"] });
    await request(app)
      .post("/api/daily-focus/today/suppressions")
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    await harness.pool.query(`
      CREATE FUNCTION reject_item_tombstone() RETURNS trigger AS $$
      BEGIN
        IF NEW.deleted_at IS NOT NULL THEN
          RAISE EXCEPTION 'forced tombstone failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_item_tombstone
        BEFORE UPDATE ON items
        FOR EACH ROW EXECUTE FUNCTION reject_item_tombstone();
    `);

    try {
      const response = await deleteItem(user, item.id);
      const state = await harness.pool.query<{
        deleted_at: Date | null;
        parts: number;
        suppressions: number;
      }>(
        `select item.deleted_at,
                (select count(*)::int from parts where item_id = $1) as parts,
                (select count(*)::int from daily_planning_suppressions where item_id = $1) as suppressions
         from items item where item.id = $1`,
        [item.id],
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "internal_server_error",
        message: "An unexpected error occurred",
      });
      expect(state.rows[0]).toEqual({
        deleted_at: null,
        parts: 1,
        suppressions: 1,
      });
    } finally {
      await harness.pool.query(`
        DROP TRIGGER reject_item_tombstone ON items;
        DROP FUNCTION reject_item_tombstone();
      `);
    }
  });
});
