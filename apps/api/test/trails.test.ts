import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Stop, Trail, TrailView } from "@unshelf/shared";
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

  it("trims only the Trail name boundary", async () => {
    const created = await createTrail("trails-trim-user", {
      name: "  Learn   Rust  ",
    });

    expect(created.status).toBe(201);
    expect((created.body as Trail).name).toBe("Learn   Rust");
  });

  it("rejects a Trail with no name", async () => {
    const user = "trails-invalid-user";
    expect((await createTrail(user, {})).status).toBe(400);
    expect((await createTrail(user, { name: "" })).status).toBe(400);
    expect((await createTrail(user, { name: "   " })).status).toBe(400);
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

  it("rejects malformed Trail ids with the shared request contract", async () => {
    const res = await getTrail("trails-malformed-user", "not-a-trail-id");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "path.trailId", message: "Must be a valid UUID" }],
    });
  });

  it("derives Trail progress from its Stops' Items, counting each Item once", async () => {
    const user = "trails-progress-user";
    const trail = (await createTrail(user, { name: "Progress journey" }))
      .body as Trail;

    // Two Stops created directly on this Trail; one shared Item done, one still
    // in progress.
    const stopA = (
      await request(app)
        .post(`/api/trails/${trail.id}/stops`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Stop A" })
    ).body as Stop;
    const stopB = (
      await request(app)
        .post(`/api/trails/${trail.id}/stops`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Stop B" })
    ).body as Stop;

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

describe("a Stop belongs to exactly one Trail (#94)", () => {
  const createStopOn = (clerkUserId: string, trailId: string, name: string) =>
    request(app)
      .post(`/api/trails/${trailId}/stops`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ name });

  const topologyOf = (clerkUserId: string, trailId: string) =>
    request(app)
      .get(`/api/trails/${trailId}/topology`)
      .set(TEST_USER_HEADER, clerkUserId);

  it("lands a created Stop on its Trail, and on no other", async () => {
    const user = "trail-stop-scoped-user";
    const here = (await createTrail(user, { name: "Here" })).body as Trail;
    const elsewhere = (await createTrail(user, { name: "Elsewhere" }))
      .body as Trail;

    const created = await createStopOn(user, here.id, "A waypoint");
    expect(created.status).toBe(201);
    const stop = created.body as Stop;

    // It is a node on its own Trail…
    const hereNodes = ((await topologyOf(user, here.id)).body as TrailView)
      .nodes;
    expect(hereNodes.map((n) => n.id)).toEqual([stop.id]);
    // …and nowhere on another Trail of the same User.
    const elsewhereNodes = (
      (await topologyOf(user, elsewhere.id)).body as TrailView
    ).nodes;
    expect(elsewhereNodes).toEqual([]);
  });

  it("refuses creating a Stop on another User's Trail — a 404, never a landing", async () => {
    const owner = "trail-stop-owner";
    const intruder = "trail-stop-intruder";
    const trail = (await createTrail(owner, { name: "Owner's Trail" }))
      .body as Trail;

    const res = await createStopOn(intruder, trail.id, "Trespasser");
    expect(res.status).toBe(404);

    // The Stop landed on no Trail — the owner's Trail is still empty.
    const ownerNodes = ((await topologyOf(owner, trail.id)).body as TrailView)
      .nodes;
    expect(ownerNodes).toEqual([]);
  });

  it("rejects a Trail-less Stop at the database boundary", async () => {
    const user = "trail-stop-db-anchor";
    const trail = (await createTrail(user, { name: "Anchored" })).body as Trail;
    const stop = (await createStopOn(user, trail.id, "On the Trail"))
      .body as Stop;

    await expect(
      harness.pool.query(`UPDATE stops SET trail_id = NULL WHERE id = $1`, [
        stop.id,
      ]),
    ).rejects.toThrow();
  });

  it("refuses a Stop with no name on a real Trail", async () => {
    const user = "trail-stop-noname-user";
    const trail = (await createTrail(user, { name: "Named" })).body as Trail;

    expect((await createStopOn(user, trail.id, "")).status).toBe(400);
    expect((await createStopOn(user, trail.id, "   ")).status).toBe(400);
  });

  it("trims only the Stop name boundary", async () => {
    const user = "trail-stop-trim-user";
    const trail = (await createTrail(user, { name: "Named" })).body as Trail;

    const res = await createStopOn(user, trail.id, "  A   waypoint  ");

    expect(res.status).toBe(201);
    expect((res.body as Stop).name).toBe("A   waypoint");
  });
});

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
