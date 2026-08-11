import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  Item,
  LearningPlan,
  LearningPlanView,
  Stage,
} from "@unshelf/shared";
import { PlanNodeKind } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
let app: Express;

const asUser = (user: string) => ({
  get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
  post: (path: string, body: object) =>
    request(app).post(path).set(TEST_USER_HEADER, user).send(body),
  patch: (path: string, body: object) =>
    request(app).patch(path).set(TEST_USER_HEADER, user).send(body),
  delete: (path: string) =>
    request(app).delete(path).set(TEST_USER_HEADER, user),
});

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("direct Learning Plan Item placements", () => {
  it("connects and disconnects direct Item and Stage nodes through one topology", async () => {
    const api = asUser("mixed-plan-topology-owner");
    const plan = (await api.post("/api/learning-plans", { name: "Mixed path" }))
      .body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Foundations",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", {
        title: "Domain-Driven Design",
        type: "book",
      })
    ).body as Item;
    const placed = (
      await api.post(`/api/learning-plans/${plan.id}/items`, {
        itemId: item.id,
      })
    ).body as LearningPlanView;
    const itemNodeId = placed.nodes.find(
      (node) => node.kind === PlanNodeKind.Item,
    )?.id;
    expect(itemNodeId).toBeDefined();

    const connected = await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: stage.id,
      toNodeId: itemNodeId,
    });
    const duplicate = await api.post(`/api/learning-plans/${plan.id}/edges`, {
      fromNodeId: stage.id,
      toNodeId: itemNodeId,
    });

    expect(connected.status).toBe(201);
    expect((duplicate.body as LearningPlanView).edges).toHaveLength(1);

    const disconnected = await api.delete(
      `/api/learning-plans/${plan.id}/edges/${stage.id}/${itemNodeId}`,
    );
    expect(disconnected.status).toBe(200);
    expect((disconnected.body as LearningPlanView).edges).toEqual([]);
  });

  it("places one shared Item as a stable Plan Node and removes only the placement", async () => {
    const api = asUser("direct-plan-item-owner");
    const plan = (
      await api.post("/api/learning-plans", { name: "Read databases" })
    ).body as LearningPlan;
    const item = (
      await api.post("/api/items", {
        title: "Designing Data-Intensive Applications",
        type: "book",
      })
    ).body as Item;

    const placed = await api.post(`/api/learning-plans/${plan.id}/items`, {
      itemId: item.id,
    });

    expect(placed.status).toBe(201);
    const placedView = placed.body as LearningPlanView;
    expect(placedView.nodes).toHaveLength(1);
    expect(placedView.nodes[0]).toMatchObject({ kind: "item", item });
    const nodeId = placedView.nodes[0]?.id;
    expect(typeof nodeId).toBe("string");

    const refreshed = (await api.get(`/api/learning-plans/${plan.id}/topology`))
      .body as LearningPlanView;
    expect(refreshed.nodes[0]).toMatchObject({ id: nodeId, item });

    await api.patch(`/api/items/${item.id}/status`, {
      status: "in_progress",
    });
    const afterStatus = (
      await api.get(`/api/learning-plans/${plan.id}/topology`)
    ).body as LearningPlanView;
    expect(afterStatus.nodes[0]).toMatchObject({
      id: nodeId,
      item: { id: item.id, status: "in_progress" },
    });

    const removed = await api.delete(
      `/api/learning-plans/${plan.id}/items/${item.id}`,
    );
    expect(removed.status).toBe(200);
    expect((removed.body as LearningPlanView).nodes).toEqual([]);
    expect((await api.get(`/api/items/${item.id}`)).body).toMatchObject({
      id: item.id,
      status: "in_progress",
    });
  });

  it("searches the owned Library and explains each Item's placement state", async () => {
    const api = asUser("plan-library-search-owner");
    const plan = (await api.post("/api/learning-plans", { name: "Frontend" }))
      .body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Foundations",
      })
    ).body as Stage;
    const available = (
      await api.post("/api/items", { title: "CSS Grid", type: "article" })
    ).body as Item;
    const direct = (
      await api.post("/api/items", { title: "CSS Layers", type: "video" })
    ).body as Item;
    const grouped = (
      await api.post("/api/items", { title: "CSS Selectors", type: "book" })
    ).body as Item;
    await api.post(`/api/learning-plans/${plan.id}/items`, {
      itemId: direct.id,
    });
    await api.post(`/api/stages/${stage.id}/items`, { itemId: grouped.id });

    const response = await api.get(
      `/api/learning-plans/${plan.id}/items?query=css`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { kind: "available", item: available },
      { kind: "direct", item: direct },
      {
        kind: "stage",
        item: grouped,
        stage: { id: stage.id, name: "Foundations" },
      },
    ]);
  });

  it("enforces one placement per Learning Plan while allowing the same Item on another Plan", async () => {
    const api = asUser("direct-placement-uniqueness-owner");
    const firstPlan = (await api.post("/api/learning-plans", { name: "First" }))
      .body as LearningPlan;
    const secondPlan = (
      await api.post("/api/learning-plans", { name: "Second" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${firstPlan.id}/stages`, {
        name: "A meaningful phase",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", { title: "Shared Item", type: "course" })
    ).body as Item;

    const firstPlacement = await api.post(
      `/api/learning-plans/${firstPlan.id}/items`,
      { itemId: item.id },
    );
    const duplicate = await api.post(
      `/api/learning-plans/${firstPlan.id}/items`,
      { itemId: item.id },
    );
    expect(duplicate.status).toBe(201);
    expect((duplicate.body as LearningPlanView).nodes[0]?.id).toBe(
      (firstPlacement.body as LearningPlanView).nodes[0]?.id,
    );
    expect(
      (await api.post(`/api/stages/${stage.id}/items`, { itemId: item.id }))
        .status,
    ).toBe(409);

    const secondPlacement = await api.post(
      `/api/learning-plans/${secondPlan.id}/items`,
      { itemId: item.id },
    );
    expect(secondPlacement.status).toBe(201);
    expect((secondPlacement.body as LearningPlanView).nodes).toHaveLength(1);
  });

  it("does not offer a directly placed Item to a Stage on the same Learning Plan", async () => {
    const api = asUser("direct-placement-stage-search-owner");
    const plan = (await api.post("/api/learning-plans", { name: "One Plan" }))
      .body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${plan.id}/stages`, {
        name: "Optional Stage",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", {
        title: "Already direct",
        type: "article",
      })
    ).body as Item;
    await api.post(`/api/learning-plans/${plan.id}/items`, {
      itemId: item.id,
    });

    const candidates = await api.get(
      `/api/stages/${stage.id}/items?query=already`,
    );

    expect(candidates.status).toBe(200);
    expect(candidates.body).toEqual([
      {
        kind: "direct_conflict",
        id: item.id,
        title: item.title,
        type: item.type,
      },
    ]);
  });

  it("keeps unknown and foreign placement destinations private", async () => {
    const ownerApi = asUser("direct-placement-private-owner");
    const intruderApi = asUser("direct-placement-private-intruder");
    const plan = (
      await ownerApi.post("/api/learning-plans", { name: "Private Plan" })
    ).body as LearningPlan;
    const item = (
      await ownerApi.post("/api/items", {
        title: "Private Item",
        type: "article",
      })
    ).body as Item;

    expect(
      (
        await intruderApi.post(`/api/learning-plans/${plan.id}/items`, {
          itemId: item.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await ownerApi.post(
          "/api/learning-plans/00000000-0000-0000-0000-000000000000/items",
          { itemId: item.id },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await ownerApi.post(`/api/learning-plans/${plan.id}/items`, {
          itemId: "00000000-0000-0000-0000-000000000000",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/learning-plans/${plan.id}/items`)
          .send({ itemId: item.id })
      ).status,
    ).toBe(401);
  });

  it("rejects inconsistent direct placements at the database boundary", async () => {
    const ownerApi = asUser("direct-placement-database-owner");
    const intruderApi = asUser("direct-placement-database-intruder");
    const firstPlan = (
      await ownerApi.post("/api/learning-plans", { name: "First Plan" })
    ).body as LearningPlan;
    const secondPlan = (
      await ownerApi.post("/api/learning-plans", { name: "Second Plan" })
    ).body as LearningPlan;
    const ownerItem = (
      await ownerApi.post("/api/items", {
        title: "Owner Item",
        type: "book",
      })
    ).body as Item;
    const intruderItem = (
      await intruderApi.post("/api/items", {
        title: "Intruder Item",
        type: "book",
      })
    ).body as Item;
    await ownerApi.post(`/api/learning-plans/${firstPlan.id}/items`, {
      itemId: ownerItem.id,
    });
    const crossPlanNode = await harness.pool.query<{ id: string }>(
      `INSERT INTO learning_plan_nodes
         (user_id, learning_plan_id, kind)
       VALUES ($1, $2, 'item')
       RETURNING id`,
      [firstPlan.userId, firstPlan.id],
    );

    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_item_placements
           (user_id, learning_plan_id, item_id, node_id, node_kind)
         VALUES ($1, $2, $3, $4, 'item')`,
        [
          firstPlan.userId,
          secondPlan.id,
          ownerItem.id,
          crossPlanNode.rows[0]?.id,
        ],
      ),
    ).rejects.toThrow(/learning_plan_item_placements_node_fk/);

    const node = await harness.pool.query<{ id: string }>(
      `INSERT INTO learning_plan_nodes
         (user_id, learning_plan_id, kind)
       VALUES ($1, $2, 'item')
       RETURNING id`,
      [firstPlan.userId, firstPlan.id],
    );
    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_item_placements
           (user_id, learning_plan_id, item_id, node_id, node_kind)
         VALUES ($1, $2, $3, $4, 'item')`,
        [firstPlan.userId, firstPlan.id, intruderItem.id, node.rows[0]?.id],
      ),
    ).rejects.toThrow(/learning_plan_item_placements_item_owner_fk/);

    const firstStage = (
      await ownerApi.post(`/api/learning-plans/${firstPlan.id}/stages`, {
        name: "First Stage",
      })
    ).body as Stage;
    const secondStage = (
      await ownerApi.post(`/api/learning-plans/${firstPlan.id}/stages`, {
        name: "Second Stage",
      })
    ).body as Stage;
    const stagedItem = (
      await ownerApi.post("/api/items", {
        title: "Staged Item",
        type: "book",
      })
    ).body as Item;
    const differentItem = (
      await ownerApi.post("/api/items", {
        title: "Different Item",
        type: "book",
      })
    ).body as Item;
    await ownerApi.post(`/api/stages/${firstStage.id}/items`, {
      itemId: stagedItem.id,
    });

    await expect(
      harness.pool.query(
        `UPDATE stage_items SET item_id = $1 WHERE stage_id = $2`,
        [differentItem.id, firstStage.id],
      ),
    ).rejects.toThrow(/stage_items_placement_fk/);
    await expect(
      harness.pool.query(
        `UPDATE stage_items SET stage_id = $1 WHERE stage_id = $2`,
        [secondStage.id, firstStage.id],
      ),
    ).rejects.toThrow(/stage_items_placement_fk/);
  });
});
