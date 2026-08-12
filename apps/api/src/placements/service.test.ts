import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  Item,
  ItemPlacementCatalog,
  Stage,
  StageDetail,
  LearningPlan,
} from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";

let harness: TestApp;
let app: Express;

const asUser = (user: string) => ({
  get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
  post: (path: string, body: object) =>
    request(app).post(path).set(TEST_USER_HEADER, user).send(body),
});

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("GET /api/items/:itemId/placements", () => {
  it("represents every owned LearningPlan once with LearningPlan-qualified placement state", async () => {
    const user = "placement-catalog-user";
    const api = asUser(user);
    const firstLearningPlan = (
      await api.post("/api/learning-plans", { name: "Frontend" })
    ).body as LearningPlan;
    const secondLearningPlan = (
      await api.post("/api/learning-plans", { name: "Backend" })
    ).body as LearningPlan;
    const emptyLearningPlan = (
      await api.post("/api/learning-plans", { name: "No Stages Yet" })
    ).body as LearningPlan;
    const firstStage = (
      await api.post(`/api/learning-plans/${firstLearningPlan.id}/stages`, {
        name: "Foundations",
      })
    ).body as Stage;
    const secondStage = (
      await api.post(`/api/learning-plans/${secondLearningPlan.id}/stages`, {
        name: "Foundations",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", {
        title: "Shared handbook",
        type: "book",
      })
    ).body as Item;
    await api.post(`/api/stages/${firstStage.id}/items`, { itemId: item.id });

    const response = await api.get(`/api/items/${item.id}/placements`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      itemId: item.id,
      learningPlans: [
        {
          kind: "placed",
          learningPlan: { id: firstLearningPlan.id, name: "Frontend" },
          stage: { id: firstStage.id, name: "Foundations" },
        },
        {
          kind: "available",
          learningPlan: { id: secondLearningPlan.id, name: "Backend" },
          stages: [{ id: secondStage.id, name: "Foundations" }],
        },
        {
          kind: "available",
          learningPlan: { id: emptyLearningPlan.id, name: "No Stages Yet" },
          stages: [],
        },
      ],
    });
  });

  it("keeps malformed, missing, foreign, and unauthenticated Items private", async () => {
    const owner = "placement-private-owner";
    const intruder = "placement-private-intruder";
    const item = (
      await asUser(owner).post("/api/items", {
        title: "Private Item",
        type: "article",
      })
    ).body as Item;

    expect(
      (await asUser(owner).get("/api/items/not-an-item/placements")).status,
    ).toBe(400);
    expect(
      (
        await asUser(owner).get(
          "/api/items/00000000-0000-0000-0000-000000000000/placements",
        )
      ).status,
    ).toBe(404);
    expect(
      (await asUser(intruder).get(`/api/items/${item.id}/placements`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/items/${item.id}/placements`)).status,
    ).toBe(401);
  });

  it("reflects removal by making the LearningPlan available again", async () => {
    const user = "placement-removal-user";
    const api = asUser(user);
    const learningPlan = (
      await api.post("/api/learning-plans", { name: "Mutable LearningPlan" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "Only Stage",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", {
        title: "Movable Item",
        type: "video",
      })
    ).body as Item;
    await api.post(`/api/stages/${stage.id}/items`, { itemId: item.id });

    const placedCatalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as ItemPlacementCatalog;
    expect(placedCatalog.learningPlans[0]?.kind).toBe("placed");
    await request(app)
      .delete(`/api/stages/${stage.id}/items/${item.id}`)
      .set(TEST_USER_HEADER, user);

    const availableCatalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as ItemPlacementCatalog;
    expect(availableCatalog.learningPlans).toEqual([
      {
        kind: "available",
        learningPlan: { id: learningPlan.id, name: "Mutable LearningPlan" },
        stages: [{ id: stage.id, name: "Only Stage" }],
      },
    ]);
  });
});

describe("POST /api/items/:itemId/placements", () => {
  it("atomically creates a loose Stage containing the Item", async () => {
    const user = "placement-create-stage-user";
    const api = asUser(user);
    const learningPlan = (
      await api.post("/api/learning-plans", { name: "Systems" })
    ).body as LearningPlan;
    const existingStage = (
      await api.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "Architecture notes",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", {
        title: "Architecture notes",
        type: "article",
      })
    ).body as Item;

    const response = await api.post(`/api/items/${item.id}/placements`, {
      learningPlanId: learningPlan.id,
      name: "Architecture notes",
    });

    expect(response.status).toBe(201);
    const createdStage = response.body as StageDetail;
    expect(createdStage).toMatchObject({
      name: "Architecture notes",
      items: [{ id: item.id }],
    });
    const topology = (
      await api.get(`/api/learning-plans/${learningPlan.id}/topology`)
    ).body as {
      nodes: Array<{ id: string; name: string; done: number; total: number }>;
      edges: unknown[];
    };
    expect(topology.nodes).toHaveLength(2);
    expect(topology.nodes).toContainEqual({
      id: existingStage.id,
      kind: "stage",
      name: "Architecture notes",
      done: 0,
      total: 0,
    });
    expect(topology.nodes).toContainEqual({
      id: createdStage.id,
      kind: "stage",
      name: "Architecture notes",
      done: 0,
      total: 1,
    });
    expect(topology.edges).toEqual([]);
    const catalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as ItemPlacementCatalog;
    expect(catalog.learningPlans).toEqual([
      {
        kind: "placed",
        learningPlan: { id: learningPlan.id, name: "Systems" },
        stage: { id: createdStage.id, name: "Architecture notes" },
      },
    ]);
  });

  it("leaves no Stage when validation, ownership, or placement conflicts fail", async () => {
    const owner = "placement-create-boundary-owner";
    const intruder = "placement-create-boundary-intruder";
    const ownerApi = asUser(owner);
    const intruderApi = asUser(intruder);
    const learningPlan = (
      await ownerApi.post("/api/learning-plans", { name: "Private" })
    ).body as LearningPlan;
    const intruderLearningPlan = (
      await intruderApi.post("/api/learning-plans", {
        name: "Foreign LearningPlan",
      })
    ).body as LearningPlan;
    const existingStage = (
      await ownerApi.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "Existing",
      })
    ).body as Stage;
    const item = (
      await ownerApi.post("/api/items", {
        title: "Private Item",
        type: "book",
      })
    ).body as Item;
    const intruderItem = (
      await intruderApi.post("/api/items", {
        title: "Foreign Item",
        type: "book",
      })
    ).body as Item;
    await ownerApi.post(`/api/stages/${existingStage.id}/items`, {
      itemId: item.id,
    });
    const stagesBefore = (await ownerApi.get("/api/stages")).body as Stage[];

    const responses = await Promise.all([
      ownerApi.post(`/api/items/${item.id}/placements`, {
        learningPlanId: learningPlan.id,
        name: "  ",
      }),
      ownerApi.post("/api/items/not-an-item/placements", {
        learningPlanId: learningPlan.id,
        name: "Malformed Item",
      }),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        learningPlanId: "not-a-learningPlan",
        name: "Malformed LearningPlan",
      }),
      ownerApi.post(
        "/api/items/00000000-0000-0000-0000-000000000000/placements",
        {
          learningPlanId: learningPlan.id,
          name: "Missing Item",
        },
      ),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        learningPlanId: "00000000-0000-0000-0000-000000000000",
        name: "Missing LearningPlan",
      }),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        learningPlanId: intruderLearningPlan.id,
        name: "Foreign LearningPlan",
      }),
      ownerApi.post(`/api/items/${intruderItem.id}/placements`, {
        learningPlanId: learningPlan.id,
        name: "Foreign Item",
      }),
      intruderApi.post(`/api/items/${item.id}/placements`, {
        learningPlanId: learningPlan.id,
        name: "Foreign ends",
      }),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        learningPlanId: learningPlan.id,
        name: "Conflicting Stage",
      }),
      request(app)
        .post(`/api/items/${item.id}/placements`)
        .send({ learningPlanId: learningPlan.id, name: "Unauthenticated" }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([
      400, 400, 400, 404, 404, 404, 404, 404, 409, 401,
    ]);
    expect((await ownerApi.get("/api/stages")).body).toEqual(stagesBefore);
    expect((await intruderApi.get("/api/stages")).body).toEqual([]);
    expect(
      (
        (await ownerApi.get(`/api/learning-plans/${learningPlan.id}/topology`))
          .body as {
          edges: unknown[];
        }
      ).edges,
    ).toEqual([]);
  });

  it("rolls back the Stage when PostgreSQL rejects its first membership", async () => {
    const user = "placement-create-database-failure";
    const api = asUser(user);
    const learningPlan = (
      await api.post("/api/learning-plans", { name: "Rollback LearningPlan" })
    ).body as LearningPlan;
    const item = (
      await api.post("/api/items", {
        title: "Rollback Item",
        type: "video",
      })
    ).body as Item;
    await harness.pool.query(`
      CREATE FUNCTION reject_atomic_membership() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced membership failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_atomic_membership
        BEFORE INSERT ON stage_items
        FOR EACH ROW EXECUTE FUNCTION reject_atomic_membership();
    `);

    try {
      const response = await api.post(`/api/items/${item.id}/placements`, {
        learningPlanId: learningPlan.id,
        name: "Must roll back",
      });

      expect(response.status).toBe(500);
      expect((await api.get("/api/stages")).body).toEqual([]);
      const catalog = (await api.get(`/api/items/${item.id}/placements`))
        .body as ItemPlacementCatalog;
      expect(catalog.learningPlans).toEqual([
        {
          kind: "available",
          learningPlan: { id: learningPlan.id, name: "Rollback LearningPlan" },
          stages: [],
        },
      ]);
    } finally {
      await harness.pool.query(`
        DROP TRIGGER reject_atomic_membership ON stage_items;
        DROP FUNCTION reject_atomic_membership();
      `);
    }
  });
});

describe("POST /api/stages/:stageId/items", () => {
  it("rejects malformed and missing Stage identifiers", async () => {
    const user = "placement-stage-boundary-user";
    const api = asUser(user);
    const item = (
      await api.post("/api/items", {
        title: "Boundary Item",
        type: "article",
      })
    ).body as Item;

    expect(
      (await api.post("/api/stages/not-a-stage/items", { itemId: item.id }))
        .status,
    ).toBe(400);
    expect(
      (
        await api.post(
          "/api/stages/00000000-0000-0000-0000-000000000000/items",
          { itemId: item.id },
        )
      ).status,
    ).toBe(404);
  });

  it("resolves concurrent same-LearningPlan placements as one success and one conflict", async () => {
    const user = "placement-concurrent-user";
    const api = asUser(user);
    const learningPlan = (
      await api.post("/api/learning-plans", { name: "One sequence" })
    ).body as LearningPlan;
    const first = (
      await api.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "First",
      })
    ).body as Stage;
    const second = (
      await api.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "Second",
      })
    ).body as Stage;
    const item = (
      await api.post("/api/items", {
        title: "Race-safe Item",
        type: "article",
      })
    ).body as Item;

    const responses = await Promise.all([
      api.post(`/api/stages/${first.id}/items`, { itemId: item.id }),
      api.post(`/api/stages/${second.id}/items`, { itemId: item.id }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const catalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as { learningPlans: Array<{ kind: string }> };
    expect(catalog.learningPlans).toEqual([
      expect.objectContaining({ kind: "placed" }),
    ]);
  });
});

describe("GET /api/stages/:stageId/items", () => {
  it("returns the first ten Library candidates in stable title order and omits current members", async () => {
    const user = "placement-stage-intake-page";
    const api = asUser(user);
    const learningPlan = (
      await api.post("/api/learning-plans", { name: "Intake LearningPlan" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "Open Stage",
      })
    ).body as Stage;
    const titles = [
      "11 Eleventh",
      "03 Third",
      "08 Eighth",
      "01 First",
      "06 Sixth",
      "12 Twelfth",
      "05 Fifth",
      "10 Tenth",
      "02 Second",
      "09 Ninth",
      "04 Fourth",
      "07 Seventh",
    ];
    const captured = await Promise.all(
      titles.map(async (title) => {
        const response = await api.post("/api/items", {
          title,
          type: "article",
        });
        return response.body as Item;
      }),
    );
    await api.post(`/api/stages/${stage.id}/items`, {
      itemId: captured.find((item) => item.title === "05 Fifth")!.id,
    });

    const response = await api.get(`/api/stages/${stage.id}/items`);

    expect(response.status).toBe(200);
    expect(
      (response.body as Array<{ title: string }>).map(({ title }) => title),
    ).toEqual([
      "01 First",
      "02 Second",
      "03 Third",
      "04 Fourth",
      "06 Sixth",
      "07 Seventh",
      "08 Eighth",
      "09 Ninth",
      "10 Tenth",
      "11 Eleventh",
    ]);
  });

  it("matches title text case-insensitively as a plain contains query", async () => {
    const user = "placement-stage-intake-search";
    const api = asUser(user);
    const learningPlan = (
      await api.post("/api/learning-plans", { name: "Search LearningPlan" })
    ).body as LearningPlan;
    const stage = (
      await api.post(`/api/learning-plans/${learningPlan.id}/stages`, {
        name: "Search Stage",
      })
    ).body as Stage;
    for (const title of [
      "Learn CSS Grid",
      "css architecture",
      "Learn Rust",
      "Percent % guide",
    ]) {
      await api.post("/api/items", { title, type: "article" });
    }

    const response = await api.get(
      `/api/stages/${stage.id}/items?query=${encodeURIComponent("cSs")}`,
    );

    expect(response.status).toBe(200);
    expect(
      (response.body as Array<{ title: string }>).map(({ title }) => title),
    ).toEqual(["Learn CSS Grid", "css architecture"]);

    const literalWildcard = await api.get(
      `/api/stages/${stage.id}/items?query=${encodeURIComponent("%")}`,
    );
    expect(
      (literalWildcard.body as Array<{ title: string }>).map(
        ({ title }) => title,
      ),
    ).toEqual(["Percent % guide"]);
  });

  it("uses Item identity as the tie-breaker for equal titles", async () => {
    const user = "placement-stage-intake-tie";
    const api = asUser(user);
    const stage = (await createStageFor({ user, name: "Tied Results" }))
      .body as Stage;
    const first = (
      await api.post("/api/items", {
        title: "Same title",
        type: "video",
      })
    ).body as Item;
    const second = (
      await api.post("/api/items", {
        title: "Same title",
        type: "video",
      })
    ).body as Item;

    const response = await api.get(`/api/stages/${stage.id}/items`);

    const expectedIds =
      first.id < second.id ? [first.id, second.id] : [second.id, first.id];
    expect(
      (response.body as Array<{ id: string }>).map(({ id }) => id),
    ).toEqual(expectedIds);
  });

  it("returns only compact Item facts and the same-LearningPlan conflict state", async () => {
    const user = "placement-stage-intake-conflicts";
    const api = asUser(user);
    const currentLearningPlan = (
      await api.post("/api/learning-plans", { name: "Current LearningPlan" })
    ).body as LearningPlan;
    const otherLearningPlan = (
      await api.post("/api/learning-plans", { name: "Other LearningPlan" })
    ).body as LearningPlan;
    const openStage = (
      await api.post(`/api/learning-plans/${currentLearningPlan.id}/stages`, {
        name: "Open Stage",
      })
    ).body as Stage;
    const conflictingStage = (
      await api.post(`/api/learning-plans/${currentLearningPlan.id}/stages`, {
        name: "Earlier Stage",
      })
    ).body as Stage;
    const otherLearningPlanStage = (
      await api.post(`/api/learning-plans/${otherLearningPlan.id}/stages`, {
        name: "Elsewhere",
      })
    ).body as Stage;
    const conflict = (
      await api.post("/api/items", {
        title: "Conflict Item",
        type: "course",
        source: "private source detail",
      })
    ).body as Item;
    const available = (
      await api.post("/api/items", {
        title: "Other LearningPlan Item",
        type: "book",
      })
    ).body as Item;
    await api.post(`/api/stages/${conflictingStage.id}/items`, {
      itemId: conflict.id,
    });
    await api.post(`/api/stages/${otherLearningPlanStage.id}/items`, {
      itemId: available.id,
    });

    const response = await api.get(`/api/stages/${openStage.id}/items`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        kind: "conflict",
        id: conflict.id,
        title: "Conflict Item",
        type: "course",
        stage: { id: conflictingStage.id, name: "Earlier Stage" },
      },
      {
        kind: "available",
        id: available.id,
        title: "Other LearningPlan Item",
        type: "book",
      },
    ]);
  });

  it("keeps malformed, missing, foreign, and unauthenticated Stages private", async () => {
    const owner = "placement-stage-intake-owner";
    const intruder = "placement-stage-intake-intruder";
    const stage = (await createStageFor({ user: owner, name: "Private Stage" }))
      .body as Stage;

    expect(
      (await asUser(owner).get("/api/stages/not-a-stage/items")).status,
    ).toBe(400);
    expect(
      (
        await asUser(owner).get(
          "/api/stages/00000000-0000-0000-0000-000000000000/items",
        )
      ).status,
    ).toBe(404);
    expect(
      (await asUser(intruder).get(`/api/stages/${stage.id}/items`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/stages/${stage.id}/items`)).status,
    ).toBe(401);
    expect(
      (
        await asUser(owner).get(
          `/api/stages/${stage.id}/items?unexpected=value`,
        )
      ).status,
    ).toBe(400);
  });
});

async function createStageFor({ user, name }: { user: string; name: string }) {
  const api = asUser(user);
  const learningPlan = (
    await api.post("/api/learning-plans", { name: `${name} LearningPlan` })
  ).body as LearningPlan;
  return api.post(`/api/learning-plans/${learningPlan.id}/stages`, { name });
}
