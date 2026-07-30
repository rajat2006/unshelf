import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  Item,
  ItemPlacementCatalog,
  Stop,
  StopDetail,
  Trail,
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
  it("represents every owned Trail once with Trail-qualified placement state", async () => {
    const user = "placement-catalog-user";
    const api = asUser(user);
    const firstTrail = (await api.post("/api/trails", { name: "Frontend" }))
      .body as Trail;
    const secondTrail = (await api.post("/api/trails", { name: "Backend" }))
      .body as Trail;
    const emptyTrail = (await api.post("/api/trails", { name: "No Stops Yet" }))
      .body as Trail;
    const firstStop = (
      await api.post(`/api/trails/${firstTrail.id}/stops`, {
        name: "Foundations",
      })
    ).body as Stop;
    const secondStop = (
      await api.post(`/api/trails/${secondTrail.id}/stops`, {
        name: "Foundations",
      })
    ).body as Stop;
    const item = (
      await api.post("/api/items", {
        title: "Shared handbook",
        type: "book",
      })
    ).body as Item;
    await api.post(`/api/stops/${firstStop.id}/items`, { itemId: item.id });

    const response = await api.get(`/api/items/${item.id}/placements`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      itemId: item.id,
      trails: [
        {
          kind: "placed",
          trail: { id: firstTrail.id, name: "Frontend" },
          stop: { id: firstStop.id, name: "Foundations" },
        },
        {
          kind: "available",
          trail: { id: secondTrail.id, name: "Backend" },
          stops: [{ id: secondStop.id, name: "Foundations" }],
        },
        {
          kind: "available",
          trail: { id: emptyTrail.id, name: "No Stops Yet" },
          stops: [],
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

  it("reflects removal by making the Trail available again", async () => {
    const user = "placement-removal-user";
    const api = asUser(user);
    const trail = (await api.post("/api/trails", { name: "Mutable Trail" }))
      .body as Trail;
    const stop = (
      await api.post(`/api/trails/${trail.id}/stops`, { name: "Only Stop" })
    ).body as Stop;
    const item = (
      await api.post("/api/items", {
        title: "Movable Item",
        type: "video",
      })
    ).body as Item;
    await api.post(`/api/stops/${stop.id}/items`, { itemId: item.id });

    const placedCatalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as ItemPlacementCatalog;
    expect(placedCatalog.trails[0]?.kind).toBe("placed");
    await request(app)
      .delete(`/api/stops/${stop.id}/items/${item.id}`)
      .set(TEST_USER_HEADER, user);

    const availableCatalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as ItemPlacementCatalog;
    expect(availableCatalog.trails).toEqual([
      {
        kind: "available",
        trail: { id: trail.id, name: "Mutable Trail" },
        stops: [{ id: stop.id, name: "Only Stop" }],
      },
    ]);
  });
});

describe("POST /api/items/:itemId/placements", () => {
  it("atomically creates a loose Stop containing the Item", async () => {
    const user = "placement-create-stop-user";
    const api = asUser(user);
    const trail = (await api.post("/api/trails", { name: "Systems" }))
      .body as Trail;
    const existingStop = (
      await api.post(`/api/trails/${trail.id}/stops`, {
        name: "Architecture notes",
      })
    ).body as Stop;
    const item = (
      await api.post("/api/items", {
        title: "Architecture notes",
        type: "article",
      })
    ).body as Item;

    const response = await api.post(`/api/items/${item.id}/placements`, {
      trailId: trail.id,
      name: "Architecture notes",
    });

    expect(response.status).toBe(201);
    const createdStop = response.body as StopDetail;
    expect(createdStop).toMatchObject({
      name: "Architecture notes",
      items: [{ id: item.id }],
    });
    const topology = (await api.get(`/api/trails/${trail.id}/topology`))
      .body as {
      nodes: Array<{ id: string; name: string; done: number; total: number }>;
      edges: unknown[];
    };
    expect(topology.nodes).toHaveLength(2);
    expect(topology.nodes).toContainEqual({
      id: existingStop.id,
      name: "Architecture notes",
      done: 0,
      total: 0,
    });
    expect(topology.nodes).toContainEqual({
      id: createdStop.id,
      name: "Architecture notes",
      done: 0,
      total: 1,
    });
    expect(topology.edges).toEqual([]);
    const catalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as ItemPlacementCatalog;
    expect(catalog.trails).toEqual([
      {
        kind: "placed",
        trail: { id: trail.id, name: "Systems" },
        stop: { id: createdStop.id, name: "Architecture notes" },
      },
    ]);
  });

  it("leaves no Stop when validation, ownership, or placement conflicts fail", async () => {
    const owner = "placement-create-boundary-owner";
    const intruder = "placement-create-boundary-intruder";
    const ownerApi = asUser(owner);
    const intruderApi = asUser(intruder);
    const trail = (await ownerApi.post("/api/trails", { name: "Private" }))
      .body as Trail;
    const intruderTrail = (
      await intruderApi.post("/api/trails", { name: "Foreign Trail" })
    ).body as Trail;
    const existingStop = (
      await ownerApi.post(`/api/trails/${trail.id}/stops`, {
        name: "Existing",
      })
    ).body as Stop;
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
    await ownerApi.post(`/api/stops/${existingStop.id}/items`, {
      itemId: item.id,
    });
    const stopsBefore = (await ownerApi.get("/api/stops")).body as Stop[];

    const responses = await Promise.all([
      ownerApi.post(`/api/items/${item.id}/placements`, {
        trailId: trail.id,
        name: "  ",
      }),
      ownerApi.post("/api/items/not-an-item/placements", {
        trailId: trail.id,
        name: "Malformed Item",
      }),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        trailId: "not-a-trail",
        name: "Malformed Trail",
      }),
      ownerApi.post(
        "/api/items/00000000-0000-0000-0000-000000000000/placements",
        {
          trailId: trail.id,
          name: "Missing Item",
        },
      ),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        trailId: "00000000-0000-0000-0000-000000000000",
        name: "Missing Trail",
      }),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        trailId: intruderTrail.id,
        name: "Foreign Trail",
      }),
      ownerApi.post(`/api/items/${intruderItem.id}/placements`, {
        trailId: trail.id,
        name: "Foreign Item",
      }),
      intruderApi.post(`/api/items/${item.id}/placements`, {
        trailId: trail.id,
        name: "Foreign ends",
      }),
      ownerApi.post(`/api/items/${item.id}/placements`, {
        trailId: trail.id,
        name: "Conflicting Stop",
      }),
      request(app)
        .post(`/api/items/${item.id}/placements`)
        .send({ trailId: trail.id, name: "Unauthenticated" }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([
      400, 400, 400, 404, 404, 404, 404, 404, 409, 401,
    ]);
    expect((await ownerApi.get("/api/stops")).body).toEqual(stopsBefore);
    expect((await intruderApi.get("/api/stops")).body).toEqual([]);
    expect(
      (
        (await ownerApi.get(`/api/trails/${trail.id}/topology`)).body as {
          edges: unknown[];
        }
      ).edges,
    ).toEqual([]);
  });

  it("rolls back the Stop when PostgreSQL rejects its first membership", async () => {
    const user = "placement-create-database-failure";
    const api = asUser(user);
    const trail = (await api.post("/api/trails", { name: "Rollback Trail" }))
      .body as Trail;
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
        BEFORE INSERT ON stop_items
        FOR EACH ROW EXECUTE FUNCTION reject_atomic_membership();
    `);

    try {
      const response = await api.post(`/api/items/${item.id}/placements`, {
        trailId: trail.id,
        name: "Must roll back",
      });

      expect(response.status).toBe(500);
      expect((await api.get("/api/stops")).body).toEqual([]);
      const catalog = (await api.get(`/api/items/${item.id}/placements`))
        .body as ItemPlacementCatalog;
      expect(catalog.trails).toEqual([
        {
          kind: "available",
          trail: { id: trail.id, name: "Rollback Trail" },
          stops: [],
        },
      ]);
    } finally {
      await harness.pool.query(`
        DROP TRIGGER reject_atomic_membership ON stop_items;
        DROP FUNCTION reject_atomic_membership();
      `);
    }
  });
});

describe("POST /api/stops/:stopId/items", () => {
  it("rejects malformed and missing Stop identifiers", async () => {
    const user = "placement-stop-boundary-user";
    const api = asUser(user);
    const item = (
      await api.post("/api/items", {
        title: "Boundary Item",
        type: "article",
      })
    ).body as Item;

    expect(
      (await api.post("/api/stops/not-a-stop/items", { itemId: item.id }))
        .status,
    ).toBe(400);
    expect(
      (
        await api.post(
          "/api/stops/00000000-0000-0000-0000-000000000000/items",
          { itemId: item.id },
        )
      ).status,
    ).toBe(404);
  });

  it("resolves concurrent same-Trail placements as one success and one conflict", async () => {
    const user = "placement-concurrent-user";
    const api = asUser(user);
    const trail = (await api.post("/api/trails", { name: "One sequence" }))
      .body as Trail;
    const first = (
      await api.post(`/api/trails/${trail.id}/stops`, { name: "First" })
    ).body as Stop;
    const second = (
      await api.post(`/api/trails/${trail.id}/stops`, { name: "Second" })
    ).body as Stop;
    const item = (
      await api.post("/api/items", {
        title: "Race-safe Item",
        type: "article",
      })
    ).body as Item;

    const responses = await Promise.all([
      api.post(`/api/stops/${first.id}/items`, { itemId: item.id }),
      api.post(`/api/stops/${second.id}/items`, { itemId: item.id }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const catalog = (await api.get(`/api/items/${item.id}/placements`))
      .body as { trails: Array<{ kind: string }> };
    expect(catalog.trails).toEqual([
      expect.objectContaining({ kind: "placed" }),
    ]);
  });
});

describe("GET /api/stops/:stopId/items", () => {
  it("returns the first ten Library candidates in stable title order and omits current members", async () => {
    const user = "placement-stop-intake-page";
    const api = asUser(user);
    const trail = (await api.post("/api/trails", { name: "Intake Trail" }))
      .body as Trail;
    const stop = (
      await api.post(`/api/trails/${trail.id}/stops`, { name: "Open Stop" })
    ).body as Stop;
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
    await api.post(`/api/stops/${stop.id}/items`, {
      itemId: captured.find((item) => item.title === "05 Fifth")!.id,
    });

    const response = await api.get(`/api/stops/${stop.id}/items`);

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
    const user = "placement-stop-intake-search";
    const api = asUser(user);
    const trail = (await api.post("/api/trails", { name: "Search Trail" }))
      .body as Trail;
    const stop = (
      await api.post(`/api/trails/${trail.id}/stops`, { name: "Search Stop" })
    ).body as Stop;
    for (const title of [
      "Learn CSS Grid",
      "css architecture",
      "Learn Rust",
      "Percent % guide",
    ]) {
      await api.post("/api/items", { title, type: "article" });
    }

    const response = await api.get(
      `/api/stops/${stop.id}/items?query=${encodeURIComponent("cSs")}`,
    );

    expect(response.status).toBe(200);
    expect(
      (response.body as Array<{ title: string }>).map(({ title }) => title),
    ).toEqual(["Learn CSS Grid", "css architecture"]);

    const literalWildcard = await api.get(
      `/api/stops/${stop.id}/items?query=${encodeURIComponent("%")}`,
    );
    expect(
      (literalWildcard.body as Array<{ title: string }>).map(
        ({ title }) => title,
      ),
    ).toEqual(["Percent % guide"]);
  });

  it("uses Item identity as the tie-breaker for equal titles", async () => {
    const user = "placement-stop-intake-tie";
    const api = asUser(user);
    const stop = (await createStopFor({ user, name: "Tied Results" }))
      .body as Stop;
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

    const response = await api.get(`/api/stops/${stop.id}/items`);

    const expectedIds =
      first.id < second.id ? [first.id, second.id] : [second.id, first.id];
    expect(
      (response.body as Array<{ id: string }>).map(({ id }) => id),
    ).toEqual(expectedIds);
  });

  it("returns only compact Item facts and the same-Trail conflict state", async () => {
    const user = "placement-stop-intake-conflicts";
    const api = asUser(user);
    const currentTrail = (
      await api.post("/api/trails", { name: "Current Trail" })
    ).body as Trail;
    const otherTrail = (await api.post("/api/trails", { name: "Other Trail" }))
      .body as Trail;
    const openStop = (
      await api.post(`/api/trails/${currentTrail.id}/stops`, {
        name: "Open Stop",
      })
    ).body as Stop;
    const conflictingStop = (
      await api.post(`/api/trails/${currentTrail.id}/stops`, {
        name: "Earlier Stop",
      })
    ).body as Stop;
    const otherTrailStop = (
      await api.post(`/api/trails/${otherTrail.id}/stops`, {
        name: "Elsewhere",
      })
    ).body as Stop;
    const conflict = (
      await api.post("/api/items", {
        title: "Conflict Item",
        type: "course",
        source: "private source detail",
      })
    ).body as Item;
    const available = (
      await api.post("/api/items", {
        title: "Other Trail Item",
        type: "book",
      })
    ).body as Item;
    await api.post(`/api/stops/${conflictingStop.id}/items`, {
      itemId: conflict.id,
    });
    await api.post(`/api/stops/${otherTrailStop.id}/items`, {
      itemId: available.id,
    });

    const response = await api.get(`/api/stops/${openStop.id}/items`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        kind: "conflict",
        id: conflict.id,
        title: "Conflict Item",
        type: "course",
        stop: { id: conflictingStop.id, name: "Earlier Stop" },
      },
      {
        kind: "available",
        id: available.id,
        title: "Other Trail Item",
        type: "book",
      },
    ]);
  });

  it("keeps malformed, missing, foreign, and unauthenticated Stops private", async () => {
    const owner = "placement-stop-intake-owner";
    const intruder = "placement-stop-intake-intruder";
    const stop = (await createStopFor({ user: owner, name: "Private Stop" }))
      .body as Stop;

    expect(
      (await asUser(owner).get("/api/stops/not-a-stop/items")).status,
    ).toBe(400);
    expect(
      (
        await asUser(owner).get(
          "/api/stops/00000000-0000-0000-0000-000000000000/items",
        )
      ).status,
    ).toBe(404);
    expect(
      (await asUser(intruder).get(`/api/stops/${stop.id}/items`)).status,
    ).toBe(404);
    expect((await request(app).get(`/api/stops/${stop.id}/items`)).status).toBe(
      401,
    );
    expect(
      (await asUser(owner).get(`/api/stops/${stop.id}/items?unexpected=value`))
        .status,
    ).toBe(400);
  });
});

async function createStopFor({ user, name }: { user: string; name: string }) {
  const api = asUser(user);
  const trail = (await api.post("/api/trails", { name: `${name} Trail` }))
    .body as Trail;
  return api.post(`/api/trails/${trail.id}/stops`, { name });
}
