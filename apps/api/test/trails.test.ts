import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Stop, Trail } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * The first-class Trail at the HTTP boundary (issue #93, ADR-0014), driven
 * against a real ephemeral Postgres. These pin what promoting the implicit Trail
 * into a first-class, User-owned record buys: a User owns *many* named Trails,
 * each with an opaque stable id; listing, creating, and reading resolve from the
 * authenticated User only — a foreign id is a 404, never a confirmation; and each
 * Trail carries *derived* progress over its Stops' Items, never a stored count.
 */
let harness: TestApp;
let app: Express;

const createTrail = (clerkUserId: string, body: object) =>
  request(app)
    .post("/api/trails")
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const listTrails = (clerkUserId: string) =>
  request(app).get("/api/trails").set(TEST_USER_HEADER, clerkUserId);

const getTrail = (clerkUserId: string, trailId: string) =>
  request(app).get(`/api/trails/${trailId}`).set(TEST_USER_HEADER, clerkUserId);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness.stop();
});

describe("Trails at the HTTP boundary", () => {
  it("creates a named Trail with a stable opaque id and starts it empty", async () => {
    const user = "trails-create-user";

    const created = await createTrail(user, { name: "Learn Rust" });
    expect(created.status).toBe(201);
    const trail = created.body as Trail;
    expect(trail.id).toMatch(/[0-9a-f-]{36}/);
    expect(trail.name).toBe("Learn Rust");
    expect(trail.done).toBe(0);
    expect(trail.total).toBe(0);

    // The id is the Trail's identity: reading it back returns the same record.
    const read = await getTrail(user, trail.id);
    expect(read.status).toBe(200);
    expect((read.body as Trail).id).toBe(trail.id);
    expect((read.body as Trail).name).toBe("Learn Rust");
  });

  it("rejects a Trail with no name", async () => {
    const user = "trails-invalid-user";
    expect((await createTrail(user, {})).status).toBe(400);
    expect((await createTrail(user, { name: "" })).status).toBe(400);
    expect((await listTrails(user)).body).toEqual([]);
  });

  it("lets a User own many Trails and lists only that User's, oldest first", async () => {
    const owner = "trails-owner-user";
    const other = "trails-other-user";

    const first = (await createTrail(owner, { name: "First journey" }))
      .body as Trail;
    const second = (await createTrail(owner, { name: "Second journey" }))
      .body as Trail;
    await createTrail(other, { name: "A stranger's Trail" });

    const listed = (await listTrails(owner)).body as Trail[];
    expect(listed.map((t) => t.name)).toEqual([
      "First journey",
      "Second journey",
    ]);
    expect(listed.map((t) => t.id)).toEqual([first.id, second.id]);
  });

  it("treats another User's Trail id as missing", async () => {
    const owner = "trails-tenancy-owner";
    const intruder = "trails-tenancy-intruder";

    const trail = (await createTrail(owner, { name: "Private journey" }))
      .body as Trail;

    // A foreign id answers exactly as an unknown one does — 404, never 403.
    expect((await getTrail(intruder, trail.id)).status).toBe(404);
    expect(
      (await getTrail(owner, "00000000-0000-0000-0000-000000000000")).status,
    ).toBe(404);
    expect((await listTrails(intruder)).body).toEqual([]);
  });

  it("derives Trail progress from its Stops' Items, counting each Item once", async () => {
    const user = "trails-progress-user";
    const trail = (await createTrail(user, { name: "Progress journey" }))
      .body as Trail;

    // Two Stops on this Trail; one shared Item done, one still in progress.
    const stopA = (
      await request(app)
        .post("/api/stops")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Stop A" })
    ).body as Stop;
    const stopB = (
      await request(app)
        .post("/api/stops")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Stop B" })
    ).body as Stop;
    await placeStopOnTrail(user, stopA.id, trail.id);
    await placeStopOnTrail(user, stopB.id, trail.id);

    const doneItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Done thing", type: "article" })
    ).body as { id: string };
    const openItem = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Open thing", type: "article" })
    ).body as { id: string };

    // The done Item lives in both Stops — it must count once, not twice.
    await addItemToStop(user, stopA.id, doneItem.id);
    await addItemToStop(user, stopB.id, doneItem.id);
    await addItemToStop(user, stopB.id, openItem.id);
    await request(app)
      .patch(`/api/items/${doneItem.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "done" });

    const read = (await getTrail(user, trail.id)).body as Trail;
    expect(read.total).toBe(2);
    expect(read.done).toBe(1);
  });
});

/**
 * Assign a Stop to a Trail directly at the database. Trail-scoped Stop creation
 * is a downstream slice (#94); this test only needs the membership to exist so
 * derived progress has Stops to roll up.
 */
async function placeStopOnTrail(
  clerkUserId: string,
  stopId: string,
  trailId: string,
): Promise<void> {
  await harness.pool.query(
    `UPDATE stops SET trail_id = $1
     WHERE id = $2
       AND user_id = (SELECT id FROM users WHERE clerk_user_id = $3)`,
    [trailId, stopId, clerkUserId],
  );
}

async function addItemToStop(
  clerkUserId: string,
  stopId: string,
  itemId: string,
): Promise<void> {
  await request(app)
    .post(`/api/stops/${stopId}/items`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ itemId });
}
