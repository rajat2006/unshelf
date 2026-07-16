import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Stop, TrailEdge, TrailView } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * The Trail at the HTTP boundary (issue #22), driven against a real ephemeral
 * Postgres. These pin the topology ADR-0010 settled: the Trail is the adjacency
 * edge list scoped to a User — its nodes are the User's Stops, its edges these
 * rows — carrying no layout and no dates. The two invariants that cannot live in
 * a column are enforced and tested right here at the write seam: acyclicity (a
 * link is refused when it would close a cycle) and per-User isolation.
 */
let harness: TestApp;
let app: Express;

const createStop = (clerkUserId: string, name: string) =>
  request(app)
    .post("/api/stops")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ name });

const connect = (clerkUserId: string, body: object) =>
  request(app)
    .post("/api/trail/edges")
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const disconnect = (clerkUserId: string, fromStopId: string, toStopId: string) =>
  request(app)
    .delete(`/api/trail/edges/${fromStopId}/${toStopId}`)
    .set(TEST_USER_HEADER, clerkUserId);

const getTrail = (clerkUserId: string) =>
  request(app).get("/api/trail").set(TEST_USER_HEADER, clerkUserId);

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

describe("GET /api/trail — read the Trail", () => {
  it("reads back an empty Trail for a User with no edges", async () => {
    const res = await getTrail("clerk_trail_empty");

    expect(res.status).toBe(200);
    expect((res.body as TrailView).edges).toEqual([]);
  });

  it("refuses an unauthenticated read", async () => {
    expect((await request(app).get("/api/trail")).status).toBe(401);
  });
});

describe("POST /api/trail/edges — draw an edge", () => {
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
    const [a, b] = await givenStops(clerkUserId, 2);

    const res = await request(app)
      .post("/api/trail/edges")
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

describe("DELETE /api/trail/edges — erase an edge and rewire", () => {
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
    const [a, b] = await givenStops(clerkUserId, 2);
    await connect(clerkUserId, { fromStopId: a, toStopId: b });

    const res = await request(app).delete(`/api/trail/edges/${a}/${b}`);

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

describe("trail_edges — a bare adjacency list and nothing more", () => {
  it("carries only its User anchor and the two endpoints — no position, no date", async () => {
    const { rows } = await harness.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'trail_edges'`,
    );
    const columns = rows.map((row) => row.column_name).sort();

    expect(columns).toEqual(["from_stop_id", "to_stop_id", "user_id"]);
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
    const [a, b] = await givenStops("clerk_trail_iso_del_owner", 2);
    await connect("clerk_trail_iso_del_owner", { fromStopId: a, toStopId: b });

    const res = await disconnect("clerk_trail_iso_del_intruder", a, b);

    // The intruder's own (empty) Trail is what they act on and read back.
    expect(res.status).toBe(200);
    expect(edgePairs(res.body as TrailView)).toEqual([]);
    // The owner's edge is untouched.
    expect(edgePairs((await getTrail("clerk_trail_iso_del_owner")).body)).toEqual(
      [`${a}->${b}`],
    );
  });
});
