import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  Item,
  Stage,
  LearningPlan,
  LearningPlanNode,
  LearningPlanView,
} from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * The LearningPlan's topology at the HTTP boundary (issue #22, scoped per LearningPlan by #94),
 * driven against a real ephemeral Postgres. These pin the topology ADR-0010
 * settled: the LearningPlan is an adjacency edge list — its nodes are its Stages, its
 * edges these rows — carrying no layout and no dates. The redesign (ADR-0014)
 * scopes that edge list to *one* LearningPlan: a Stage belongs to exactly one LearningPlan and a
 * link can never span two, so the topology is read and written under a LearningPlan id.
 * The invariants that cannot live in a column are enforced and tested right here
 * at the write seam: acyclicity, per-User isolation, and same-LearningPlan endpoints.
 */
let harness: TestApp;
let app: Express;

/**
 * Each User's single LearningPlan, minted lazily. Most tests need one LearningPlan per User and
 * do not care about its id; the cross-LearningPlan tests below mint their own explicitly.
 */
const learningPlanIds = new Map<string, Promise<string>>();
const learningPlanFor = (clerkUserId: string): Promise<string> => {
  let existing = learningPlanIds.get(clerkUserId);
  if (!existing) {
    existing = request(app)
      .post("/api/learning-plans")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ name: "Test LearningPlan" })
      .then((res) => (res.body as LearningPlan).id);
    learningPlanIds.set(clerkUserId, existing);
  }
  return existing;
};

const createStage = async ({
  clerkUserId,
  name,
}: {
  clerkUserId: string;
  name: string;
}) => {
  const learningPlanId = await learningPlanFor(clerkUserId);
  return request(app)
    .post(`/api/learning-plans/${learningPlanId}/stages`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ name });
};

const connect = async (clerkUserId: string, body: object) => {
  const learningPlanId = await learningPlanFor(clerkUserId);
  return request(app)
    .post(`/api/learning-plans/${learningPlanId}/edges`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);
};

const disconnect = async ({
  clerkUserId,
  fromNodeId,
  toNodeId,
}: {
  clerkUserId: string;
  fromNodeId: string;
  toNodeId: string;
}) => {
  const learningPlanId = await learningPlanFor(clerkUserId);
  return request(app)
    .delete(
      `/api/learning-plans/${learningPlanId}/edges/${fromNodeId}/${toNodeId}`,
    )
    .set(TEST_USER_HEADER, clerkUserId);
};

const getLearningPlan = async (clerkUserId: string) => {
  const learningPlanId = await learningPlanFor(clerkUserId);
  return request(app)
    .get(`/api/learning-plans/${learningPlanId}/topology`)
    .set(TEST_USER_HEADER, clerkUserId);
};

const capture = ({
  clerkUserId,
  title,
}: {
  clerkUserId: string;
  title: string;
}) =>
  request(app)
    .post("/api/items")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ title, type: "article" });

const addToStage = ({
  clerkUserId,
  stageId,
  itemId,
}: {
  clerkUserId: string;
  stageId: string;
  itemId: string;
}) =>
  request(app)
    .post(`/api/stages/${stageId}/items`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ itemId });

const setStatus = ({
  clerkUserId,
  itemId,
  status,
}: {
  clerkUserId: string;
  itemId: string;
  status: string;
}) =>
  request(app)
    .patch(`/api/items/${itemId}/status`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ status });

/** A node from the read, by name — the canvas draws a waypoint from this. */
const nodeNamed = (
  view: LearningPlanView,
  name: string,
): LearningPlanNode | undefined =>
  view.nodes.find((node) => node.name === name);

/** Create `count` freshly-named Stages for a User and hand back their ids. */
const givenStages = async (
  clerkUserId: string,
  count: number,
): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const stage = (await createStage({ clerkUserId, name: `Stage ${i}` }))
      .body as Stage;
    ids.push(stage.id);
  }
  return ids;
};

/** The LearningPlan's edges as `from → to` string pairs, order-independent to compare. */
const edgePairs = (view: LearningPlanView): string[] =>
  view.edges.map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`).sort();

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("GET /api/learning-plans/:learningPlanId/topology — read a LearningPlan", () => {
  it("reads back an empty LearningPlan for a User with no edges", async () => {
    const res = await getLearningPlan("clerk_learningPlan_empty");

    expect(res.status).toBe(200);
    expect((res.body as LearningPlanView).edges).toEqual([]);
  });

  it("refuses an unauthenticated read", async () => {
    expect(
      (
        await request(app).get(
          "/api/learning-plans/00000000-0000-0000-0000-000000000000/topology",
        )
      ).status,
    ).toBe(401);
  });

  it("treats another User's LearningPlan id as missing", async () => {
    const learningPlanId = await learningPlanFor(
      "clerk_learningPlan_topology_owner",
    );
    const res = await request(app)
      .get(`/api/learning-plans/${learningPlanId}/topology`)
      .set(TEST_USER_HEADER, "clerk_learningPlan_topology_intruder");

    expect(res.status).toBe(404);
  });

  it("rejects a malformed LearningPlan id before reading topology", async () => {
    const res = await request(app)
      .get("/api/learning-plans/not-a-learningPlan-id/topology")
      .set(TEST_USER_HEADER, "clerk_learningPlan_read_invalid");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [
        { path: "path.learningPlanId", message: "Must be a valid UUID" },
      ],
    });
  });
});

describe("the LearningPlan's nodes are the LearningPlan's Stages, with derived progress", () => {
  it("returns every Stage on the LearningPlan as a node, even one with no edges", async () => {
    const clerkUserId = "clerk_learningPlan_nodes";
    await createStage({ clerkUserId, name: "Alpha" });
    await createStage({ clerkUserId, name: "Beta" });

    const view = (await getLearningPlan(clerkUserId)).body as LearningPlanView;

    expect(view.nodes.map((n) => n.name)).toEqual(["Alpha", "Beta"]);
    expect(view.edges).toEqual([]); // a node needs no edge to exist
  });

  it("derives each node's done/total from its Items' Status, never storing it", async () => {
    const clerkUserId = "clerk_learningPlan_progress";
    const stage = (await createStage({ clerkUserId, name: "React" }))
      .body as Stage;
    const a = (await capture({ clerkUserId, title: "Hooks" })).body as Item;
    const b = (await capture({ clerkUserId, title: "Router" })).body as Item;
    const c = (await capture({ clerkUserId, title: "Suspense" })).body as Item;
    for (const item of [a, b, c])
      await addToStage({ clerkUserId, stageId: stage.id, itemId: item.id });

    // Freshly captured Items are not started: 0 of 3 done.
    expect(
      nodeNamed((await getLearningPlan(clerkUserId)).body, "React"),
    ).toMatchObject({
      done: 0,
      total: 3,
    });

    await setStatus({ clerkUserId, itemId: a.id, status: "done" });

    // The same derived count the Stage itself would show — 1 of 3, no stored flag.
    expect(
      nodeNamed((await getLearningPlan(clerkUserId)).body, "React"),
    ).toMatchObject({
      done: 1,
      total: 3,
    });
  });

  it("reads an empty Stage as 0 of 0", async () => {
    const clerkUserId = "clerk_learningPlan_empty_stage";
    await createStage({ clerkUserId, name: "Untouched" });

    expect(
      nodeNamed((await getLearningPlan(clerkUserId)).body, "Untouched"),
    ).toMatchObject({
      done: 0,
      total: 0,
    });
  });

  it("shows a User only their own LearningPlan's Stages as nodes", async () => {
    await createStage({
      clerkUserId: "clerk_learningPlan_nodes_owner",
      name: "Owner's stage",
    });
    const view = (await getLearningPlan("clerk_learningPlan_nodes_intruder"))
      .body as LearningPlanView;
    expect(view.nodes).toEqual([]);
  });
});

describe("POST /api/learning-plans/:learningPlanId/edges — draw an edge", () => {
  it("persists an edge and reads it back", async () => {
    const clerkUserId = "clerk_learningPlan_persist";
    const [a, b] = await givenStages(clerkUserId, 2);

    const res = await connect(clerkUserId, { fromNodeId: a, toNodeId: b });

    expect(res.status).toBe(201);
    expect(edgePairs(res.body as LearningPlanView)).toEqual([`${a}->${b}`]);

    // And it survives a fresh read, not just the write's own echo.
    const readBack = (await getLearningPlan(clerkUserId))
      .body as LearningPlanView;
    expect(edgePairs(readBack)).toEqual([`${a}->${b}`]);
    const edge = readBack.edges[0];
    expect(edge.fromNodeId).toBe(a);
    expect(edge.toNodeId).toBe(b);
    expect(typeof edge.userId).toBe("string");
    expect(edge.userId).not.toBe(clerkUserId); // our anchor id, not Clerk's
  });

  it("places Stages in a sequence — a chain of edges", async () => {
    const clerkUserId = "clerk_learningPlan_sequence";
    const [a, b, c] = await givenStages(clerkUserId, 3);

    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });
    await connect(clerkUserId, { fromNodeId: b, toNodeId: c });

    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual(
      [`${a}->${b}`, `${b}->${c}`].sort(),
    );
  });

  it("forks a Stage into parallel threads — several out-edges", async () => {
    const clerkUserId = "clerk_learningPlan_fork";
    const [root, left, right] = await givenStages(clerkUserId, 3);

    await connect(clerkUserId, { fromNodeId: root, toNodeId: left });
    await connect(clerkUserId, { fromNodeId: root, toNodeId: right });

    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual(
      [`${root}->${left}`, `${root}->${right}`].sort(),
    );
  });

  it("joins parallel threads back together — several in-edges", async () => {
    const clerkUserId = "clerk_learningPlan_join";
    const [left, right, target] = await givenStages(clerkUserId, 3);

    await connect(clerkUserId, { fromNodeId: left, toNodeId: target });
    await connect(clerkUserId, { fromNodeId: right, toNodeId: target });

    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual(
      [`${left}->${target}`, `${right}->${target}`].sort(),
    );
  });

  it("treats the edge set as a set — drawing the same edge twice is a no-op", async () => {
    const clerkUserId = "clerk_learningPlan_dup";
    const [a, b] = await givenStages(clerkUserId, 2);

    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });
    const again = await connect(clerkUserId, { fromNodeId: a, toNodeId: b });

    expect(again.status).toBe(201);
    expect(edgePairs(again.body as LearningPlanView)).toEqual([`${a}->${b}`]);
  });

  it("carries no dates on the LearningPlan — only the topology", async () => {
    const clerkUserId = "clerk_learningPlan_no_dates";
    const [a, b] = await givenStages(clerkUserId, 2);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });

    const view = (await getLearningPlan(clerkUserId)).body as LearningPlanView;
    const edge = view.edges[0] as unknown as Record<string, unknown>;

    // The edge the client reads is a bare adjacency pair plus its User anchor —
    // its LearningPlan is the route it was read under, not a field, and there is no date
    // or position (ADR-0010).
    expect(Object.keys(edge).sort()).toEqual([
      "fromNodeId",
      "toNodeId",
      "userId",
    ]);
  });

  it("rejects a link from a Stage to itself", async () => {
    const clerkUserId = "clerk_learningPlan_self";
    const [a] = await givenStages(clerkUserId, 1);

    const res = await connect(clerkUserId, { fromNodeId: a, toNodeId: a });

    expect(res.status).toBe(400);
    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual([]);
  });

  it("rejects a payload missing an endpoint", async () => {
    const clerkUserId = "clerk_learningPlan_bad_body";
    const [a] = await givenStages(clerkUserId, 1);

    expect((await connect(clerkUserId, {})).status).toBe(400);
    expect((await connect(clerkUserId, { fromNodeId: a })).status).toBe(400);
    expect(
      (await connect(clerkUserId, { fromNodeId: a, toNodeId: 42 })).status,
    ).toBe(400);
    const unknown = await connect(clerkUserId, {
      fromNodeId: a,
      toNodeId: a,
      extra: "must stay private",
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({
      error: "invalid_request",
      issues: [
        {
          path: "body.$unknown",
          message: "Contains unrecognized fields",
        },
      ],
    });
    expect(unknown.text).not.toContain("must stay private");
  });

  it("cannot link a Stage that does not exist", async () => {
    const clerkUserId = "clerk_learningPlan_missing";
    const [a] = await givenStages(clerkUserId, 1);

    const res = await connect(clerkUserId, {
      fromNodeId: a,
      toNodeId: "00000000-0000-0000-0000-000000000000",
    });

    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated connect", async () => {
    const clerkUserId = "clerk_learningPlan_connect_anon";
    const learningPlanId = await learningPlanFor(clerkUserId);
    const [a, b] = await givenStages(clerkUserId, 2);

    const res = await request(app)
      .post(`/api/learning-plans/${learningPlanId}/edges`)
      .send({ fromNodeId: a, toNodeId: b });

    expect(res.status).toBe(401);
    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual([]);
  });
});

describe("the LearningPlan is a DAG — cycles are refused at the write seam", () => {
  it("refuses a direct back-edge (A→B then B→A)", async () => {
    const clerkUserId = "clerk_learningPlan_backedge";
    const [a, b] = await givenStages(clerkUserId, 2);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });

    const res = await connect(clerkUserId, { fromNodeId: b, toNodeId: a });

    expect(res.status).toBe(409);
    // The refused edge left no trace — only the original edge persists.
    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual([
      `${a}->${b}`,
    ]);
  });

  it("refuses a transitive back-edge (A→B→C then C→A)", async () => {
    const clerkUserId = "clerk_learningPlan_transitive";
    const [a, b, c] = await givenStages(clerkUserId, 3);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });
    await connect(clerkUserId, { fromNodeId: b, toNodeId: c });

    const res = await connect(clerkUserId, { fromNodeId: c, toNodeId: a });

    expect(res.status).toBe(409);
    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual(
      [`${a}->${b}`, `${b}->${c}`].sort(),
    );
  });

  it("allows a diamond — a fork that rejoins is not a cycle", async () => {
    const clerkUserId = "clerk_learningPlan_diamond";
    const [a, b, c, d] = await givenStages(clerkUserId, 4);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });
    await connect(clerkUserId, { fromNodeId: a, toNodeId: c });
    await connect(clerkUserId, { fromNodeId: b, toNodeId: d });

    const res = await connect(clerkUserId, { fromNodeId: c, toNodeId: d });

    expect(res.status).toBe(201);
    expect(edgePairs(res.body as LearningPlanView)).toEqual(
      [`${a}->${b}`, `${a}->${c}`, `${b}->${d}`, `${c}->${d}`].sort(),
    );
  });
});

describe("edges are scoped to one LearningPlan — a link never spans two", () => {
  it("refuses linking Stages on two different LearningPlans of the same User", async () => {
    const clerkUserId = "clerk_learningPlan_cross";
    const learningPlanA = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "LearningPlan A" })
    ).body as LearningPlan;
    const learningPlanB = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "LearningPlan B" })
    ).body as LearningPlan;

    const stageA = (
      await request(app)
        .post(`/api/learning-plans/${learningPlanA.id}/stages`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "On A" })
    ).body as Stage;
    const stageB = (
      await request(app)
        .post(`/api/learning-plans/${learningPlanB.id}/stages`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "On B" })
    ).body as Stage;

    // A Stage on LearningPlan B is not on LearningPlan A, so linking to it under LearningPlan A is a
    // 404, exactly as a foreign Stage is — and no edge is drawn.
    const res = await request(app)
      .post(`/api/learning-plans/${learningPlanA.id}/edges`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ fromNodeId: stageA.id, toNodeId: stageB.id });

    expect(res.status).toBe(404);
    const topology = (
      await request(app)
        .get(`/api/learning-plans/${learningPlanA.id}/topology`)
        .set(TEST_USER_HEADER, clerkUserId)
    ).body as LearningPlanView;
    expect(topology.edges).toEqual([]);
  });

  it("rejects a cross-LearningPlan edge at the database boundary", async () => {
    const clerkUserId = "clerk_learningPlan_db_cross";
    const learningPlanA = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB LearningPlan A" })
    ).body as LearningPlan;
    const learningPlanB = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB LearningPlan B" })
    ).body as LearningPlan;
    const stageA = (
      await request(app)
        .post(`/api/learning-plans/${learningPlanA.id}/stages`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB on A" })
    ).body as Stage;
    const stageB = (
      await request(app)
        .post(`/api/learning-plans/${learningPlanB.id}/stages`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB on B" })
    ).body as Stage;

    // Same-LearningPlan endpoints are the schema's guarantee, not just the route's: even
    // a write that bypasses the repository cannot join Stages across two LearningPlans.
    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_edges
           (user_id, learning_plan_id, from_node_id, to_node_id)
         VALUES ($1, $2, $3, $4)`,
        [stageA.userId, learningPlanA.id, stageA.id, stageB.id],
      ),
    ).rejects.toThrow();
  });
});

describe("DELETE /api/learning-plans/:learningPlanId/edges — erase an edge and rewire", () => {
  it("removes an edge and reads back without it", async () => {
    const clerkUserId = "clerk_learningPlan_remove";
    const [a, b] = await givenStages(clerkUserId, 2);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });

    const res = await disconnect({ clerkUserId, fromNodeId: a, toNodeId: b });

    expect(res.status).toBe(200);
    expect(edgePairs(res.body as LearningPlanView)).toEqual([]);
    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual([]);
  });

  it("rewires the LearningPlan — move a Stage by erasing one edge and drawing another", async () => {
    const clerkUserId = "clerk_learningPlan_rewire";
    const [a, b, c] = await givenStages(clerkUserId, 3);
    // Start A→B→C, then move C to hang off A instead of B.
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });
    await connect(clerkUserId, { fromNodeId: b, toNodeId: c });

    await disconnect({ clerkUserId, fromNodeId: b, toNodeId: c });
    await connect(clerkUserId, { fromNodeId: a, toNodeId: c });

    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual(
      [`${a}->${b}`, `${a}->${c}`].sort(),
    );
  });

  it("erasing a link that is not there is a no-op", async () => {
    const clerkUserId = "clerk_learningPlan_remove_absent";
    const [a, b] = await givenStages(clerkUserId, 2);

    const res = await disconnect({ clerkUserId, fromNodeId: a, toNodeId: b });

    expect(res.status).toBe(200);
    expect(edgePairs(res.body as LearningPlanView)).toEqual([]);
  });

  it("refuses an unauthenticated disconnect", async () => {
    const clerkUserId = "clerk_learningPlan_disconnect_anon";
    const learningPlanId = await learningPlanFor(clerkUserId);
    const [a, b] = await givenStages(clerkUserId, 2);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });

    const res = await request(app).delete(
      `/api/learning-plans/${learningPlanId}/edges/${a}/${b}`,
    );

    expect(res.status).toBe(401);
    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual([
      `${a}->${b}`,
    ]);
  });

  it("rejects malformed identifiers without erasing the edge", async () => {
    const user = "clerk_learningPlan_disconnect_invalid";
    const [a, b] = await givenStages(user, 2);
    await connect(user, { fromNodeId: a, toNodeId: b });

    const res = await disconnect({
      clerkUserId: user,
      fromNodeId: "not-a-stage-id",
      toNodeId: b,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.fromNodeId", message: "Must be a valid UUID" }],
    });
    expect(edgePairs((await getLearningPlan(user)).body)).toEqual([
      `${a}->${b}`,
    ]);
  });
});

describe("edges follow their Plan Nodes", () => {
  it("cascades — deleting a Stage node erases its Stage and touching edges", async () => {
    const clerkUserId = "clerk_learningPlan_cascade";
    const [a, b, c] = await givenStages(clerkUserId, 3);
    await connect(clerkUserId, { fromNodeId: a, toNodeId: b });
    await connect(clerkUserId, { fromNodeId: b, toNodeId: c });

    await harness.pool.query(`DELETE FROM learning_plan_nodes WHERE id = $1`, [
      b,
    ]);

    expect(edgePairs((await getLearningPlan(clerkUserId)).body)).toEqual([]);
    const stages = await harness.pool.query(
      `SELECT id FROM stages WHERE id = $1`,
      [b],
    );
    expect(stages.rows).toEqual([]);
  });
});

describe("learning_plan_edges — an adjacency list scoped to one Learning Plan", () => {
  it("carries its User anchor, its LearningPlan, and the two endpoints — no position, no date", async () => {
    const { rows } = await harness.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'learning_plan_edges'`,
    );
    const columns = rows.map((row) => row.column_name).sort();

    expect(columns).toEqual([
      "from_node_id",
      "learning_plan_id",
      "to_node_id",
      "user_id",
    ]);
  });

  it("forbids a self-loop at the database", async () => {
    // Set semantics and the DAG floor are the schema's guarantee, not just the
    // route's: even a write that bypasses the repository cannot loop a Stage.
    const owner = (
      await createStage({
        clerkUserId: "clerk_learningPlan_db_self",
        name: "Owned",
      })
    ).body as Stage;

    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_edges
           (user_id, learning_plan_id, from_node_id, to_node_id)
         VALUES ($1, $2, $3, $3)`,
        [owner.userId, owner.learningPlanId, owner.id],
      ),
    ).rejects.toThrow();
  });

  it("requires every edge to carry its LearningPlan anchor", async () => {
    const clerkUserId = "clerk_learningPlan_db_anchor";
    const [from, to] = await givenStages(clerkUserId, 2);
    const owner = (await createStage({ clerkUserId, name: "Owner anchor" }))
      .body as Stage;

    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_edges (user_id, from_node_id, to_node_id)
         VALUES ($1, $2, $3)`,
        [owner.userId, from, to],
      ),
    ).rejects.toThrow();
  });

  it("rejects a cross-User edge at the database boundary", async () => {
    const aliceOwner = (
      await createStage({
        clerkUserId: "clerk_learningPlan_db_alice",
        name: "Alice",
      })
    ).body as Stage;
    const bobStage = (
      await createStage({
        clerkUserId: "clerk_learningPlan_db_bob",
        name: "Bob",
      })
    ).body as Stage;

    await expect(
      harness.pool.query(
        `INSERT INTO learning_plan_edges
           (user_id, learning_plan_id, from_node_id, to_node_id)
         VALUES ($1, $2, $3, $4)`,
        [
          aliceOwner.userId,
          aliceOwner.learningPlanId,
          aliceOwner.id,
          bobStage.id,
        ],
      ),
    ).rejects.toThrow();
  });
});

describe("per-User isolation", () => {
  it("shows a User only their own LearningPlan — never another User's edges", async () => {
    const [a1, b1] = await givenStages("clerk_learningPlan_iso_alice", 2);
    await connect("clerk_learningPlan_iso_alice", {
      fromNodeId: a1,
      toNodeId: b1,
    });
    const [a2, b2] = await givenStages("clerk_learningPlan_iso_bob", 2);
    await connect("clerk_learningPlan_iso_bob", {
      fromNodeId: a2,
      toNodeId: b2,
    });

    expect(
      edgePairs((await getLearningPlan("clerk_learningPlan_iso_alice")).body),
    ).toEqual([`${a1}->${b1}`]);
    expect(
      edgePairs((await getLearningPlan("clerk_learningPlan_iso_bob")).body),
    ).toEqual([`${a2}->${b2}`]);
  });

  it("cannot link two of another User's Stages", async () => {
    const [a, b] = await givenStages("clerk_learningPlan_iso_owner", 2);

    const res = await connect("clerk_learningPlan_iso_intruder", {
      fromNodeId: a,
      toNodeId: b,
    });

    expect(res.status).toBe(404);
    expect(
      edgePairs((await getLearningPlan("clerk_learningPlan_iso_owner")).body),
    ).toEqual([]);
  });

  it("cannot link your own Stage to another User's Stage", async () => {
    const [ownerStage] = await givenStages(
      "clerk_learningPlan_iso_mix_owner",
      1,
    );
    const [intruderStage] = await givenStages(
      "clerk_learningPlan_iso_mix_intruder",
      1,
    );

    const res = await connect("clerk_learningPlan_iso_mix_intruder", {
      fromNodeId: intruderStage,
      toNodeId: ownerStage,
    });

    expect(res.status).toBe(404);
    expect(
      edgePairs(
        (await getLearningPlan("clerk_learningPlan_iso_mix_intruder")).body,
      ),
    ).toEqual([]);
  });

  it("cannot erase an edge on another User's LearningPlan", async () => {
    const ownerLearningPlan = await learningPlanFor(
      "clerk_learningPlan_iso_del_owner",
    );
    const [a, b] = await givenStages("clerk_learningPlan_iso_del_owner", 2);
    await connect("clerk_learningPlan_iso_del_owner", {
      fromNodeId: a,
      toNodeId: b,
    });

    // The intruder acting on the owner's LearningPlan id is refused it — a 404, as a
    // foreign LearningPlan always is — and the owner's edge is untouched.
    const res = await request(app)
      .delete(`/api/learning-plans/${ownerLearningPlan}/edges/${a}/${b}`)
      .set(TEST_USER_HEADER, "clerk_learningPlan_iso_del_intruder");

    expect(res.status).toBe(404);
    expect(
      edgePairs(
        (await getLearningPlan("clerk_learningPlan_iso_del_owner")).body,
      ),
    ).toEqual([`${a}->${b}`]);
  });
});
