import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  Item,
  LearningPlan,
  LearningPlanView,
  Stage,
} from "@unshelf/shared";
import { anyValue } from "./assertion-boundaries";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
let app: Express;

const asUser = (user: string) => ({
  get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
  post: (path: string, body?: object) =>
    request(app).post(path).set(TEST_USER_HEADER, user).send(body),
});

const seedTombstone = (itemId: string) =>
  harness.pool.query("UPDATE items SET deleted_at = now() WHERE id = $1", [
    itemId,
  ]);

const seedActive = (itemId: string) =>
  harness.pool.query("UPDATE items SET deleted_at = NULL WHERE id = $1", [
    itemId,
  ]);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("Learning Plan tombstone eligibility", () => {
  it("excludes direct and staged tombstones from archived plan reads without changing unrelated topology", async () => {
    const api = asUser("learning-plan-tombstone-read-owner");
    const plan = (
      await api.post("/api/learning-plans", { name: "Retained plan" })
    ).body as LearningPlan;
    const firstStage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "First",
      })
    ).body as Stage;
    const lastStage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Last",
      })
    ).body as Stage;
    const stagedTombstone = (
      await api.post("/api/items", {
        title: "Deleted staged Item",
        type: "article",
      })
    ).body as Item;
    const directTombstone = (
      await api.post("/api/items", {
        title: "Deleted direct Item",
        type: "book",
      })
    ).body as Item;
    await api.post(`/api/stages/${firstStage.id}/items`, {
      itemId: stagedTombstone.id,
    });
    const placed = (
      await api.post(`/api/learning-plans/${plan.id}/items`, {
        itemId: directTombstone.id,
      })
    ).body as LearningPlanView;
    const directNode = placed.nodes.find(
      (node) => node.kind === PlanNodeKind.Item,
    );
    expect(directNode).toBeDefined();
    await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: firstStage.id,
      toNodeId: directNode!.id,
    });
    await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: directNode!.id,
      toNodeId: lastStage.id,
    });
    await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: firstStage.id,
      toNodeId: lastStage.id,
    });
    await seedTombstone(stagedTombstone.id);
    await seedTombstone(directTombstone.id);

    const activeRead = await api.get(`/api/learning-plans/${plan.id}`);
    const stageDetail = await api.get(`/api/stages/${firstStage.id}`);
    const refreshedStage = await request(app)
      .patch(`/api/stages/${firstStage.id}`)
      .set(TEST_USER_HEADER, "learning-plan-tombstone-read-owner")
      .send({ name: "Refreshed First" });
    expect(activeRead.body).toMatchObject({ done: 0, total: 0 });
    expect((stageDetail.body as { items: Item[] }).items).toEqual([]);
    expect(refreshedStage.body).toMatchObject({
      id: firstStage.id,
      name: "Refreshed First",
      items: [],
    });
    await api.post(`/api/learning-plans/${plan.id}/archive`);
    const read = await api.get(`/api/learning-plans/${plan.id}`);
    const listed = await api.get("/api/learning-plans");
    const topology = await api.get(`/api/learning-plans/${plan.id}/topology`);
    expect(read.body).toMatchObject({
      archivedAt: anyValue(String),
      done: 0,
      total: 0,
    });
    expect(listed.body).toContainEqual(
      expect.objectContaining({ id: plan.id, done: 0, total: 0 }),
    );
    expect(topology.body.nodes).toHaveLength(2);
    expect(topology.body.nodes).toContainEqual(
      expect.objectContaining({ id: firstStage.id, done: 0, total: 0 }),
    );
    expect(topology.body.nodes).toContainEqual(
      expect.objectContaining({ id: lastStage.id, done: 0, total: 0 }),
    );
    expect(topology.body.edges).toEqual([
      expect.objectContaining({
        fromNodeId: firstStage.id,
        toNodeId: lastStage.id,
      }),
    ]);
  });

  it("keeps a tombstone out of placement catalogues and rejects new placements privately", async () => {
    const api = asUser("learning-plan-tombstone-catalog-owner");
    const foreignApi = asUser("learning-plan-tombstone-catalog-foreign");
    const plan = (
      await api.post("/api/learning-plans", { name: "Active plan" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Active Stage",
      })
    ).body as Stage;
    const tombstone = (
      await api.post("/api/items", {
        title: "Unavailable Item",
        type: "video",
      })
    ).body as Item;
    const active = (
      await api.post("/api/items", {
        title: "Available Item",
        type: "video",
      })
    ).body as Item;
    const foreignTombstone = (
      await foreignApi.post("/api/items", {
        title: "Foreign unavailable Item",
        type: "book",
      })
    ).body as Item;
    await seedTombstone(tombstone.id);
    await seedTombstone(foreignTombstone.id);

    const planCandidates = await api.get(
      `/api/learning-plans/${plan.id}/items`,
    );
    const stageCandidates = await api.get(`/api/stages/${stage.id}/items`);
    const placementCatalog = await api.get(
      `/api/items/${tombstone.id}/placements`,
    );
    const directPlacement = await api.post(
      `/api/learning-plans/${plan.id}/items`,
      { itemId: tombstone.id },
    );
    const stagePlacement = await api.post(`/api/stages/${stage.id}/items`, {
      itemId: tombstone.id,
    });
    const createdStage = await api.post(
      `/api/items/${tombstone.id}/placements`,
      { learningPlanId: plan.id, name: "Must not exist" },
    );
    const foreignPlacement = await foreignApi.post(
      `/api/learning-plans/${plan.id}/items`,
      { itemId: tombstone.id },
    );
    const foreignItemPlacement = await api.post(
      `/api/learning-plans/${plan.id}/items`,
      { itemId: foreignTombstone.id },
    );
    const missingItemPlacement = await api.post(
      `/api/learning-plans/${plan.id}/items`,
      { itemId: "00000000-0000-0000-0000-000000000000" },
    );

    expect(
      (planCandidates.body as Array<{ item: Item }>).map(({ item }) => item.id),
    ).toEqual([active.id]);
    expect(
      (stageCandidates.body as Array<{ id: string }>).map(({ id }) => id),
    ).toEqual([active.id]);
    expect(placementCatalog.status).toBe(404);
    expect(directPlacement.status).toBe(404);
    expect(stagePlacement.status).toBe(404);
    expect(createdStage.status).toBe(404);
    expect(foreignPlacement.status).toBe(404);
    expect(foreignItemPlacement.body).toEqual(missingItemPlacement.body);
    expect(foreignItemPlacement.status).toBe(missingItemPlacement.status);
    expect((await api.get("/api/stages")).body).toEqual([stage]);
  });

  it("does not let placement and topology mutations target seeded tombstones", async () => {
    const api = asUser("learning-plan-tombstone-mutation-owner");
    const plan = (
      await api.post("/api/learning-plans", { name: "Mutation plan" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Source Stage",
      })
    ).body as Stage;
    const destination = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Destination Stage",
      })
    ).body as Stage;
    const active = (
      await api.post("/api/items", { title: "Active Item", type: "article" })
    ).body as Item;
    const stagedTombstone = (
      await api.post("/api/items", {
        title: "Staged tombstone",
        type: "article",
      })
    ).body as Item;
    const directTombstone = (
      await api.post("/api/items", {
        title: "Direct tombstone",
        type: "article",
      })
    ).body as Item;
    await api.post(`/api/stages/${stage.id}/items`, { itemId: active.id });
    await api.post(`/api/stages/${stage.id}/items`, {
      itemId: stagedTombstone.id,
    });
    const placed = (
      await api.post(`/api/learning-plans/${plan.id}/items`, {
        itemId: directTombstone.id,
      })
    ).body as LearningPlanView;
    const directNodeId = placed.nodes.find(
      (node) => node.kind === PlanNodeKind.Item,
    )!.id;
    await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: stage.id,
      toNodeId: directNodeId,
    });
    await seedTombstone(stagedTombstone.id);
    await seedTombstone(directTombstone.id);

    const connect = await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: directNodeId,
      toNodeId: destination.id,
    });
    const disconnect = await request(app)
      .delete(
        `/api/learning-plans/${plan.id}/edges/${stage.id}/${directNodeId}`,
      )
      .set(TEST_USER_HEADER, "learning-plan-tombstone-mutation-owner");
    const move = await request(app)
      .put(
        `/api/learning-plans/${plan.id}/items/${directTombstone.id}/placement`,
      )
      .set(TEST_USER_HEADER, "learning-plan-tombstone-mutation-owner")
      .send({ stageId: destination.id });
    const removeDirect = await request(app)
      .delete(`/api/learning-plans/${plan.id}/items/${directTombstone.id}`)
      .set(TEST_USER_HEADER, "learning-plan-tombstone-mutation-owner");
    const reorder = await request(app)
      .put(`/api/stages/${stage.id}/items/order`)
      .set(TEST_USER_HEADER, "learning-plan-tombstone-mutation-owner")
      .send({ itemIds: [stagedTombstone.id, active.id] });
    const removeStaged = await request(app)
      .delete(`/api/stages/${stage.id}/items/${stagedTombstone.id}`)
      .set(TEST_USER_HEADER, "learning-plan-tombstone-mutation-owner");

    expect(connect.status).toBe(404);
    expect(disconnect.status).toBe(200);
    expect(move.status).toBe(404);
    expect(removeDirect.status).toBe(404);
    expect(reorder.status).toBe(409);
    expect(removeStaged.status).toBe(200);

    await seedActive(stagedTombstone.id);
    await seedActive(directTombstone.id);
    const stageAfter = await api.get(`/api/stages/${stage.id}`);
    const topologyAfter = await api.get(
      `/api/learning-plans/${plan.id}/topology`,
    );
    expect(
      (stageAfter.body as { items: Item[] }).items.map(({ id }) => id),
    ).toEqual([active.id, stagedTombstone.id]);
    expect(topologyAfter.body.nodes).toContainEqual(
      expect.objectContaining({ id: directNodeId }),
    );
    expect(topologyAfter.body.edges).toContainEqual(
      expect.objectContaining({
        fromNodeId: stage.id,
        toNodeId: directNodeId,
      }),
    );
  });

  it("does not turn a tombstone into a direct node when its Stage is removed", async () => {
    const api = asUser("learning-plan-tombstone-stage-removal-owner");
    const plan = (
      await api.post("/api/learning-plans", { name: "Stage removal plan" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Temporary Stage",
      })
    ).body as Stage;
    const active = (
      await api.post("/api/items", { title: "Keep direct", type: "article" })
    ).body as Item;
    const tombstone = (
      await api.post("/api/items", { title: "Keep hidden", type: "book" })
    ).body as Item;
    await api.post(`/api/stages/${stage.id}/items`, { itemId: active.id });
    await api.post(`/api/stages/${stage.id}/items`, {
      itemId: tombstone.id,
    });
    await seedTombstone(tombstone.id);

    const removed = await request(app)
      .delete(`/api/stages/${stage.id}`)
      .set(TEST_USER_HEADER, "learning-plan-tombstone-stage-removal-owner")
      .send({ itemDisposition: "place_directly" });

    expect(removed.status).toBe(200);
    expect(
      (removed.body as LearningPlanView).nodes.map((node) =>
        node.kind === PlanNodeKind.Item ? node.item.id : node.id,
      ),
    ).toEqual([active.id]);

    await seedActive(tombstone.id);
    const refreshed = (await api.get(`/api/learning-plans/${plan.id}/topology`))
      .body as LearningPlanView;
    expect(
      refreshed.nodes.map((node) =>
        node.kind === PlanNodeKind.Item ? node.item.id : node.id,
      ),
    ).toEqual([active.id]);
  });
});
