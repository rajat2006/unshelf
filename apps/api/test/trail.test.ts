import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type {
  Item,
  Stop,
  Trail,
  TrailEdge,
  TrailNode,
  TrailView,
} from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * The Trail's topology at the HTTP boundary (issue #22, scoped per Trail by #94),
 * driven against a real ephemeral Postgres. These pin the topology ADR-0010
 * settled: the Trail is an adjacency edge list — its nodes are its Stops, its
 * edges these rows — carrying no layout and no dates. The redesign (ADR-0014)
 * scopes that edge list to *one* Trail: a Stop belongs to exactly one Trail and a
 * link can never span two, so the topology is read and written under a Trail id.
 * The invariants that cannot live in a column are enforced and tested right here
 * at the write seam: acyclicity, per-User isolation, and same-Trail endpoints.
 */
let harness: TestApp;
let app: Express;

/**
 * Each User's single Trail, minted lazily. Most tests need one Trail per User and
 * do not care about its id; the cross-Trail tests below mint their own explicitly.
 */
const trailIds = new Map<string, Promise<string>>();
const trailFor = (clerkUserId: string): Promise<string> => {
  let existing = trailIds.get(clerkUserId);
  if (!existing) {
    existing = request(app)
      .post("/api/trails")
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ name: "Test Trail" })
      .then((res) => (res.body as Trail).id);
    trailIds.set(clerkUserId, existing);
  }
  return existing;
};

const createStop = async (clerkUserId: string, name: string) => {
  const trailId = await trailFor(clerkUserId);
  return request(app)
    .post(`/api/trails/${trailId}/stops`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ name });
};

const connect = async (clerkUserId: string, body: object) => {
  const trailId = await trailFor(clerkUserId);
  return request(app)
    .post(`/api/trails/${trailId}/edges`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);
};

const disconnect = async (
  clerkUserId: string,
  fromStopId: string,
  toStopId: string,
) => {
  const trailId = await trailFor(clerkUserId);
  return request(app)
    .delete(`/api/trails/${trailId}/edges/${fromStopId}/${toStopId}`)
    .set(TEST_USER_HEADER, clerkUserId);
};

const getTrail = async (clerkUserId: string) => {
  const trailId = await trailFor(clerkUserId);
  return request(app)
    .get(`/api/trails/${trailId}/topology`)
    .set(TEST_USER_HEADER, clerkUserId);
};

const capture = (clerkUserId: string, title: string) =>
  request(app)
    .post("/api/items")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ title, type: "article" });

const addToStop = (clerkUserId: string, stopId: string, itemId: string) =>
  request(app)
    .post(`/api/stops/${stopId}/items`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ itemId });

const setStatus = (clerkUserId: string, itemId: string, status: string) =>
  request(app)
    .patch(`/api/items/${itemId}/status`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ status });

/** A node from the read, by name — the canvas draws a waypoint from this. */
const nodeNamed = (view: TrailView, name: string): TrailNode | undefined =>
  view.nodes.find((node) => node.name === name);

/** Create `count` freshly-named Stops for a User and hand back their ids. */
const givenStops = async (
  clerkUserId: string,
  count: number,
): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const stop = (await createStop(clerkUserId, `Stop ${i}`)).body as Stop;
    ids.push(stop.id);
  }
  return ids;
};

/** The Trail's edges as `from → to` string pairs, order-independent to compare. */
const edgePairs = (view: TrailView): string[] =>
  view.edges.map((edge) => `${edge.fromStopId}->${edge.toStopId}`).sort();

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("GET /api/trails/:trailId/topology — read a Trail", () => {
  it("reads back an empty Trail for a User with no edges", async () => {
    const res = await getTrail("clerk_trail_empty");

    expect(res.status).toBe(200);
    expect((res.body as TrailView).edges).toEqual([]);
  });

  it("refuses an unauthenticated read", async () => {
    expect(
      (
        await request(app).get(
          "/api/trails/00000000-0000-0000-0000-000000000000/topology",
        )
      ).status,
    ).toBe(401);
  });

  it("treats another User's Trail id as missing", async () => {
    const trailId = await trailFor("clerk_trail_topology_owner");
    const res = await request(app)
      .get(`/api/trails/${trailId}/topology`)
      .set(TEST_USER_HEADER, "clerk_trail_topology_intruder");

    expect(res.status).toBe(404);
  });
});

describe("the Trail's nodes are the Trail's Stops, with derived progress", () => {
  it("returns every Stop on the Trail as a node, even one with no edges", async () => {
    const clerkUserId = "clerk_trail_nodes";
    await createStop(clerkUserId, "Alpha");
    await createStop(clerkUserId, "Beta");

    const view = (await getTrail(clerkUserId)).body as TrailView;

    expect(view.nodes.map((n) => n.name)).toEqual(["Alpha", "Beta"]);
    expect(view.edges).toEqual([]); // a node needs no edge to exist
  });

  it("derives each node's done/total from its Items' Status, never storing it", async () => {
    const clerkUserId = "clerk_trail_progress";
    const stop = (await createStop(clerkUserId, "React")).body as Stop;
    const a = (await capture(clerkUserId, "Hooks")).body as Item;
    const b = (await capture(clerkUserId, "Router")).body as Item;
    const c = (await capture(clerkUserId, "Suspense")).body as Item;
    for (const item of [a, b, c]) await addToStop(clerkUserId, stop.id, item.id);

    // Freshly captured Items are not started: 0 of 3 done.
    expect(nodeNamed((await getTrail(clerkUserId)).body, "React")).toMatchObject({
      done: 0,
      total: 3,
    });

    await setStatus(clerkUserId, a.id, "done");

    // The same derived count the Stop itself would show — 1 of 3, no stored flag.
    expect(nodeNamed((await getTrail(clerkUserId)).body, "React")).toMatchObject({
      done: 1,
      total: 3,
    });
  });

  it("reads an empty Stop as 0 of 0", async () => {
    const clerkUserId = "clerk_trail_empty_stop";
    await createStop(clerkUserId, "Untouched");

    expect(
      nodeNamed((await getTrail(clerkUserId)).body, "Untouched"),
    ).toMatchObject({ done: 0, total: 0 });
  });

  it("shows a User only their own Trail's Stops as nodes", async () => {
    await createStop("clerk_trail_nodes_owner", "Owner's stop");
    const view = (await getTrail("clerk_trail_nodes_intruder")).body as TrailView;
    expect(view.nodes).toEqual([]);
  });
});

describe("POST /api/trails/:trailId/edges — draw an edge", () => {
  it("persists an edge and reads it back", async () => {
    const clerkUserId = "clerk_trail_persist";
    const [a, b] = await givenStops(clerkUserId, 2);

    const res = await connect(clerkUserId, { fromStopId: a, toStopId: b });

    expect(res.status).toBe(201);
    expect(edgePairs(res.body as TrailView)).toEqual([`${a}->${b}`]);

    // And it survives a fresh read, not just the write's own echo.
    const readBack = (await getTrail(clerkUserId)).body as TrailView;
    expect(edgePairs(readBack)).toEqual([`${a}->${b}`]);
    const edge = readBack.edges[0] as TrailEdge;
    expect(edge.fromStopId).toBe(a);
    expect(edge.toStopId).toBe(b);
    expect(typeof edge.userId).toBe("string");
    expect(edge.userId).not.toBe(clerkUserId); // our anchor id, not Clerk's
  });

  it("places Stops in a sequence — a chain of edges", async () => {
    const clerkUserId = "clerk_trail_sequence";
    const [a, b, c] = await givenStops(clerkUserId, 3);

    await connect(clerkUserId, { fromStopId: a, toStopId: b });
    await connect(clerkUserId, { fromStopId: b, toStopId: c });

    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual(
      [`${a}->${b}`, `${b}->${c}`].sort(),
    );
  });

  it("forks a Stop into parallel threads — several out-edges", async () => {
    const clerkUserId = "clerk_trail_fork";
    const [root, left, right] = await givenStops(clerkUserId, 3);

    await connect(clerkUserId, { fromStopId: root, toStopId: left });
    await connect(clerkUserId, { fromStopId: root, toStopId: right });

    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual(
      [`${root}->${left}`, `${root}->${right}`].sort(),
    );
  });

  it("joins parallel threads back together — several in-edges", async () => {
    const clerkUserId = "clerk_trail_join";
    const [left, right, target] = await givenStops(clerkUserId, 3);

    await connect(clerkUserId, { fromStopId: left, toStopId: target });
    await connect(clerkUserId, { fromStopId: right, toStopId: target });

    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual(
      [`${left}->${target}`, `${right}->${target}`].sort(),
    );
  });

  it("treats the edge set as a set — drawing the same edge twice is a no-op", async () => {
    const clerkUserId = "clerk_trail_dup";
    const [a, b] = await givenStops(clerkUserId, 2);

    await connect(clerkUserId, { fromStopId: a, toStopId: b });
    const again = await connect(clerkUserId, { fromStopId: a, toStopId: b });

    expect(again.status).toBe(201);
    expect(edgePairs(again.body as TrailView)).toEqual([`${a}->${b}`]);
  });

  it("carries no dates on the Trail — only the topology", async () => {
    const clerkUserId = "clerk_trail_no_dates";
    const [a, b] = await givenStops(clerkUserId, 2);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });

    const view = (await getTrail(clerkUserId)).body as TrailView;
    const edge = view.edges[0] as unknown as Record<string, unknown>;

    // The edge the client reads is a bare adjacency pair plus its User anchor —
    // its Trail is the route it was read under, not a field, and there is no date
    // or position (ADR-0010).
    expect(Object.keys(edge).sort()).toEqual([
      "fromStopId",
      "toStopId",
      "userId",
    ]);
  });

  it("rejects a link from a Stop to itself", async () => {
    const clerkUserId = "clerk_trail_self";
    const [a] = await givenStops(clerkUserId, 1);

    const res = await connect(clerkUserId, { fromStopId: a, toStopId: a });

    expect(res.status).toBe(400);
    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual([]);
  });

  it("rejects a payload missing an endpoint", async () => {
    const clerkUserId = "clerk_trail_bad_body";
    const [a] = await givenStops(clerkUserId, 1);

    expect((await connect(clerkUserId, {})).status).toBe(400);
    expect((await connect(clerkUserId, { fromStopId: a })).status).toBe(400);
    expect((await connect(clerkUserId, { fromStopId: a, toStopId: 42 })).status)
      .toBe(400);
  });

  it("cannot link a Stop that does not exist", async () => {
    const clerkUserId = "clerk_trail_missing";
    const [a] = await givenStops(clerkUserId, 1);

    const res = await connect(clerkUserId, {
      fromStopId: a,
      toStopId: "00000000-0000-0000-0000-000000000000",
    });

    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated connect", async () => {
    const clerkUserId = "clerk_trail_connect_anon";
    const trailId = await trailFor(clerkUserId);
    const [a, b] = await givenStops(clerkUserId, 2);

    const res = await request(app)
      .post(`/api/trails/${trailId}/edges`)
      .send({ fromStopId: a, toStopId: b });

    expect(res.status).toBe(401);
    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual([]);
  });
});

describe("the Trail is a DAG — cycles are refused at the write seam", () => {
  it("refuses a direct back-edge (A→B then B→A)", async () => {
    const clerkUserId = "clerk_trail_backedge";
    const [a, b] = await givenStops(clerkUserId, 2);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });

    const res = await connect(clerkUserId, { fromStopId: b, toStopId: a });

    expect(res.status).toBe(409);
    // The refused edge left no trace — only the original edge persists.
    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual([`${a}->${b}`]);
  });

  it("refuses a transitive back-edge (A→B→C then C→A)", async () => {
    const clerkUserId = "clerk_trail_transitive";
    const [a, b, c] = await givenStops(clerkUserId, 3);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });
    await connect(clerkUserId, { fromStopId: b, toStopId: c });

    const res = await connect(clerkUserId, { fromStopId: c, toStopId: a });

    expect(res.status).toBe(409);
    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual(
      [`${a}->${b}`, `${b}->${c}`].sort(),
    );
  });

  it("allows a diamond — a fork that rejoins is not a cycle", async () => {
    const clerkUserId = "clerk_trail_diamond";
    const [a, b, c, d] = await givenStops(clerkUserId, 4);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });
    await connect(clerkUserId, { fromStopId: a, toStopId: c });
    await connect(clerkUserId, { fromStopId: b, toStopId: d });

    const res = await connect(clerkUserId, { fromStopId: c, toStopId: d });

    expect(res.status).toBe(201);
    expect(edgePairs(res.body as TrailView)).toEqual(
      [`${a}->${b}`, `${a}->${c}`, `${b}->${d}`, `${c}->${d}`].sort(),
    );
  });
});

describe("edges are scoped to one Trail — a link never spans two", () => {
  it("refuses linking Stops on two different Trails of the same User", async () => {
    const clerkUserId = "clerk_trail_cross";
    const trailA = (
      await request(app)
        .post("/api/trails")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "Trail A" })
    ).body as Trail;
    const trailB = (
      await request(app)
        .post("/api/trails")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "Trail B" })
    ).body as Trail;

    const stopA = (
      await request(app)
        .post(`/api/trails/${trailA.id}/stops`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "On A" })
    ).body as Stop;
    const stopB = (
      await request(app)
        .post(`/api/trails/${trailB.id}/stops`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "On B" })
    ).body as Stop;

    // A Stop on Trail B is not on Trail A, so linking to it under Trail A is a
    // 404, exactly as a foreign Stop is — and no edge is drawn.
    const res = await request(app)
      .post(`/api/trails/${trailA.id}/edges`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ fromStopId: stopA.id, toStopId: stopB.id });

    expect(res.status).toBe(404);
    const topology = (
      await request(app)
        .get(`/api/trails/${trailA.id}/topology`)
        .set(TEST_USER_HEADER, clerkUserId)
    ).body as TrailView;
    expect(topology.edges).toEqual([]);
  });

  it("rejects a cross-Trail edge at the database boundary", async () => {
    const clerkUserId = "clerk_trail_db_cross";
    const trailA = (
      await request(app)
        .post("/api/trails")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB Trail A" })
    ).body as Trail;
    const trailB = (
      await request(app)
        .post("/api/trails")
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB Trail B" })
    ).body as Trail;
    const stopA = (
      await request(app)
        .post(`/api/trails/${trailA.id}/stops`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB on A" })
    ).body as Stop;
    const stopB = (
      await request(app)
        .post(`/api/trails/${trailB.id}/stops`)
        .set(TEST_USER_HEADER, clerkUserId)
        .send({ name: "DB on B" })
    ).body as Stop;

    // Same-Trail endpoints are the schema's guarantee, not just the route's: even
    // a write that bypasses the repository cannot join Stops across two Trails.
    await expect(
      harness.pool.query(
        `INSERT INTO trail_edges (user_id, trail_id, from_stop_id, to_stop_id)
         VALUES ($1, $2, $3, $4)`,
        [stopA.userId, trailA.id, stopA.id, stopB.id],
      ),
    ).rejects.toThrow();
  });
});

describe("DELETE /api/trails/:trailId/edges — erase an edge and rewire", () => {
  it("removes an edge and reads back without it", async () => {
    const clerkUserId = "clerk_trail_remove";
    const [a, b] = await givenStops(clerkUserId, 2);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });

    const res = await disconnect(clerkUserId, a, b);

    expect(res.status).toBe(200);
    expect(edgePairs(res.body as TrailView)).toEqual([]);
    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual([]);
  });

  it("rewires the Trail — move a Stop by erasing one edge and drawing another", async () => {
    const clerkUserId = "clerk_trail_rewire";
    const [a, b, c] = await givenStops(clerkUserId, 3);
    // Start A→B→C, then move C to hang off A instead of B.
    await connect(clerkUserId, { fromStopId: a, toStopId: b });
    await connect(clerkUserId, { fromStopId: b, toStopId: c });

    await disconnect(clerkUserId, b, c);
    await connect(clerkUserId, { fromStopId: a, toStopId: c });

    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual(
      [`${a}->${b}`, `${a}->${c}`].sort(),
    );
  });

  it("erasing a link that is not there is a no-op", async () => {
    const clerkUserId = "clerk_trail_remove_absent";
    const [a, b] = await givenStops(clerkUserId, 2);

    const res = await disconnect(clerkUserId, a, b);

    expect(res.status).toBe(200);
    expect(edgePairs(res.body as TrailView)).toEqual([]);
  });

  it("refuses an unauthenticated disconnect", async () => {
    const clerkUserId = "clerk_trail_disconnect_anon";
    const trailId = await trailFor(clerkUserId);
    const [a, b] = await givenStops(clerkUserId, 2);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });

    const res = await request(app).delete(
      `/api/trails/${trailId}/edges/${a}/${b}`,
    );

    expect(res.status).toBe(401);
    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual([`${a}->${b}`]);
  });
});

describe("edges follow their Stops", () => {
  it("cascades — deleting a Stop erases every edge touching it", async () => {
    const clerkUserId = "clerk_trail_cascade";
    const [a, b, c] = await givenStops(clerkUserId, 3);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });
    await connect(clerkUserId, { fromStopId: b, toStopId: c });

    // Delete the middle Stop directly; both edges that touched it must go.
    await harness.pool.query(`DELETE FROM stops WHERE id = $1`, [b]);

    expect(edgePairs((await getTrail(clerkUserId)).body)).toEqual([]);
  });
});

describe("trail_edges — an adjacency list scoped to one Trail and nothing more", () => {
  it("carries its User anchor, its Trail, and the two endpoints — no position, no date", async () => {
    const { rows } = await harness.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'trail_edges'`,
    );
    const columns = rows.map((row) => row.column_name).sort();

    expect(columns).toEqual([
      "from_stop_id",
      "to_stop_id",
      "trail_id",
      "user_id",
    ]);
  });

  it("forbids a self-loop at the database", async () => {
    // Set semantics and the DAG floor are the schema's guarantee, not just the
    // route's: even a write that bypasses the repository cannot loop a Stop.
    const owner = (await createStop("clerk_trail_db_self", "Owned")).body as Stop;

    await expect(
      harness.pool.query(
        `INSERT INTO trail_edges (user_id, from_stop_id, to_stop_id)
         VALUES ($1, $2, $2)`,
        [owner.userId, owner.id],
      ),
    ).rejects.toThrow();
  });

  it("rejects a cross-User edge at the database boundary", async () => {
    const aliceOwner = (await createStop("clerk_trail_db_alice", "Alice"))
      .body as Stop;
    const bobStop = (await createStop("clerk_trail_db_bob", "Bob")).body as Stop;

    await expect(
      harness.pool.query(
        `INSERT INTO trail_edges (user_id, from_stop_id, to_stop_id)
         VALUES ($1, $2, $3)`,
        [aliceOwner.userId, aliceOwner.id, bobStop.id],
      ),
    ).rejects.toThrow();
  });
});

describe("per-User isolation", () => {
  it("shows a User only their own Trail — never another User's edges", async () => {
    const [a1, b1] = await givenStops("clerk_trail_iso_alice", 2);
    await connect("clerk_trail_iso_alice", { fromStopId: a1, toStopId: b1 });
    const [a2, b2] = await givenStops("clerk_trail_iso_bob", 2);
    await connect("clerk_trail_iso_bob", { fromStopId: a2, toStopId: b2 });

    expect(edgePairs((await getTrail("clerk_trail_iso_alice")).body)).toEqual([
      `${a1}->${b1}`,
    ]);
    expect(edgePairs((await getTrail("clerk_trail_iso_bob")).body)).toEqual([
      `${a2}->${b2}`,
    ]);
  });

  it("cannot link two of another User's Stops", async () => {
    const [a, b] = await givenStops("clerk_trail_iso_owner", 2);

    const res = await connect("clerk_trail_iso_intruder", {
      fromStopId: a,
      toStopId: b,
    });

    expect(res.status).toBe(404);
    expect(edgePairs((await getTrail("clerk_trail_iso_owner")).body)).toEqual([]);
  });

  it("cannot link your own Stop to another User's Stop", async () => {
    const [ownerStop] = await givenStops("clerk_trail_iso_mix_owner", 1);
    const [intruderStop] = await givenStops("clerk_trail_iso_mix_intruder", 1);

    const res = await connect("clerk_trail_iso_mix_intruder", {
      fromStopId: intruderStop,
      toStopId: ownerStop,
    });

    expect(res.status).toBe(404);
    expect(edgePairs((await getTrail("clerk_trail_iso_mix_intruder")).body))
      .toEqual([]);
  });

  it("cannot erase an edge on another User's Trail", async () => {
    const ownerTrail = await trailFor("clerk_trail_iso_del_owner");
    const [a, b] = await givenStops("clerk_trail_iso_del_owner", 2);
    await connect("clerk_trail_iso_del_owner", { fromStopId: a, toStopId: b });

    // The intruder acting on the owner's Trail id is refused it — a 404, as a
    // foreign Trail always is — and the owner's edge is untouched.
    const res = await request(app)
      .delete(`/api/trails/${ownerTrail}/edges/${a}/${b}`)
      .set(TEST_USER_HEADER, "clerk_trail_iso_del_intruder");

    expect(res.status).toBe(404);
    expect(edgePairs((await getTrail("clerk_trail_iso_del_owner")).body)).toEqual(
      [`${a}->${b}`],
    );
  });
});
