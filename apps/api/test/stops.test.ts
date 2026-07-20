import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item, Stop, StopDetail, Trail } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * Stops at the HTTP boundary (issue #20), driven against a real ephemeral
 * Postgres. These pin the organisation model ADR-0004 chose: a Stop is a flat,
 * unordered set of *references* to the Item spine, so one Item lives in many
 * Stops without being copied, its one Status is read through every one of them,
 * and membership itself carries no facts of its own. Per-User isolation runs
 * through the same auth seam T2 established — a header names the acting User.
 */
let harness: TestApp;
let app: Express;

const capture = (clerkUserId: string, body: object) =>
  request(app).post("/api/items").set(TEST_USER_HEADER, clerkUserId).send(body);

const setStatus = (clerkUserId: string, itemId: string, status: string) =>
  request(app)
    .patch(`/api/items/${itemId}/status`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ status });

/**
 * Each User's single Trail, minted lazily. A Stop belongs to exactly one Trail
 * (#94), so creating one names the Trail it lands on; these tests care about the
 * Stop, not which Trail holds it, so one Trail per User is plenty.
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

const createStop = async (clerkUserId: string, body: object) => {
  const trailId = await trailFor(clerkUserId);
  return request(app)
    .post(`/api/trails/${trailId}/stops`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);
};

const listStops = (clerkUserId: string) =>
  request(app).get("/api/stops").set(TEST_USER_HEADER, clerkUserId);

const viewStop = (clerkUserId: string, stopId: string) =>
  request(app).get(`/api/stops/${stopId}`).set(TEST_USER_HEADER, clerkUserId);

const viewTrailStop = (clerkUserId: string, trailId: string, stopId: string) =>
  request(app)
    .get(`/api/trails/${trailId}/stops/${stopId}`)
    .set(TEST_USER_HEADER, clerkUserId);

const addToStop = (clerkUserId: string, stopId: string, body: object) =>
  request(app)
    .post(`/api/stops/${stopId}/items`)
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const removeFromStop = (clerkUserId: string, stopId: string, itemId: string) =>
  request(app)
    .delete(`/api/stops/${stopId}/items/${itemId}`)
    .set(TEST_USER_HEADER, clerkUserId);

/** Capture an Item and create a Stop for one User — the setup most tests need. */
const givenItemAndStop = async (
  clerkUserId: string,
  title = "An item",
  name = "A stop",
): Promise<{ item: Item; stop: Stop }> => ({
  item: (await capture(clerkUserId, { title, type: "article" })).body as Item,
  stop: (await createStop(clerkUserId, { name })).body as Stop,
});

const titlesIn = (stop: StopDetail) => stop.items.map((item) => item.title);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("POST /api/stops — create a Stop", () => {
  it("creates a named, empty Stop scoped to the User", async () => {
    const res = await createStop("clerk_stop_create", { name: "Learn CSS" });

    expect(res.status).toBe(201);
    const stop = res.body as Stop;
    expect(stop.id).toBeTruthy();
    expect(stop.name).toBe("Learn CSS");
    expect(typeof stop.userId).toBe("string");
    expect(stop.userId).not.toBe("clerk_stop_create"); // our anchor id, not Clerk's

    expect(titlesIn((await viewStop("clerk_stop_create", stop.id)).body)).toEqual(
      [],
    );
  });

  it("serves a topic to learn and a project to build with one uniform Stop", async () => {
    const clerkUserId = "clerk_stop_uniform";
    const topic = (await createStop(clerkUserId, { name: "Learn CSS" }))
      .body as Stop;
    const project = (await createStop(clerkUserId, { name: "Build the API" }))
      .body as Stop;

    // The two differ by name and nothing else: there is no kind to choose.
    expect(Object.keys(topic).sort()).toEqual(Object.keys(project).sort());
    expect(topic).not.toHaveProperty("kind");
    expect(topic).not.toHaveProperty("type");
  });

  it("stores the name verbatim", async () => {
    const res = await createStop("clerk_stop_verbatim", {
      name: "  Spaces kept  ",
    });

    expect((res.body as Stop).name).toBe("  Spaces kept  ");
  });

  it("requires a name", async () => {
    expect((await createStop("clerk_stop_bad", {})).status).toBe(400);
    expect((await createStop("clerk_stop_bad", { name: "   " })).status).toBe(400);
    expect((await createStop("clerk_stop_bad", { name: 42 })).status).toBe(400);
  });

  it("refuses an unauthenticated create", async () => {
    const trailId = await trailFor("clerk_stop_create_anon_owner");
    expect(
      (
        await request(app)
          .post(`/api/trails/${trailId}/stops`)
          .send({ name: "Anon" })
      ).status,
    ).toBe(401);
  });
});

describe("GET /api/stops — list Stops", () => {
  it("lists every Stop belonging to the current User", async () => {
    const clerkUserId = "clerk_stop_list";
    await createStop(clerkUserId, { name: "One" });
    await createStop(clerkUserId, { name: "Two" });

    const res = await listStops(clerkUserId);

    expect(res.status).toBe(200);
    const names = (res.body as Stop[]).map((stop) => stop.name);
    expect(names).toContain("One");
    expect(names).toContain("Two");
  });

  it("lists nothing for a User with no Stops", async () => {
    const res = await listStops("clerk_stop_list_empty");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("refuses an unauthenticated list", async () => {
    expect((await request(app).get("/api/stops")).status).toBe(401);
  });
});

describe("POST /api/stops/:stopId/items — pull an Item from All into a Stop", () => {
  it("adds an Item from All to a Stop", async () => {
    const clerkUserId = "clerk_stop_add";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Flexbox guide");

    const res = await addToStop(clerkUserId, stop.id, { itemId: item.id });

    expect(res.status).toBe(200);
    expect(titlesIn(res.body as StopDetail)).toEqual(["Flexbox guide"]);
    expect(titlesIn((await viewStop(clerkUserId, stop.id)).body)).toEqual([
      "Flexbox guide",
    ]);
  });

  it("references the Item rather than copying it — it stays in All", async () => {
    const clerkUserId = "clerk_stop_reference";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Still in All");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });

    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];

    expect(all.map((listed) => listed.id)).toEqual([item.id]);
    const inStop = ((await viewStop(clerkUserId, stop.id)).body as StopDetail)
      .items[0]!;
    expect(inStop.id).toBe(item.id); // the same record, not a copy
  });

  it("holds Items as a set — adding the same Item twice is not a duplicate", async () => {
    const clerkUserId = "clerk_stop_set";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Added twice");

    await addToStop(clerkUserId, stop.id, { itemId: item.id });
    const again = await addToStop(clerkUserId, stop.id, { itemId: item.id });

    expect(again.status).toBe(200);
    expect(titlesIn(again.body as StopDetail)).toEqual(["Added twice"]);
  });

  it("puts the same Item in more than one Stop without duplicating it", async () => {
    const clerkUserId = "clerk_stop_multi";
    const item = (
      await capture(clerkUserId, { title: "Shared item", type: "course" })
    ).body as Item;
    const css = (await createStop(clerkUserId, { name: "Learn CSS" }))
      .body as Stop;
    const api = (await createStop(clerkUserId, { name: "Build the API" }))
      .body as Stop;

    expect((await addToStop(clerkUserId, css.id, { itemId: item.id })).status)
      .toBe(200);
    expect((await addToStop(clerkUserId, api.id, { itemId: item.id })).status)
      .toBe(200);

    // One Item, two memberships — both Stops point at the very same record.
    for (const stop of [css, api]) {
      const detail = (await viewStop(clerkUserId, stop.id)).body as StopDetail;
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0]!.id).toBe(item.id);
    }
    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];
    expect(all).toHaveLength(1);
  });

  it("rejects an add with no valid itemId", async () => {
    const clerkUserId = "clerk_stop_add_bad";
    const { stop } = await givenItemAndStop(clerkUserId);

    expect((await addToStop(clerkUserId, stop.id, {})).status).toBe(400);
    expect((await addToStop(clerkUserId, stop.id, { itemId: 42 })).status).toBe(
      400,
    );
  });

  it("cannot add an Item that does not exist", async () => {
    const clerkUserId = "clerk_stop_add_missing";
    const { stop } = await givenItemAndStop(clerkUserId);

    const res = await addToStop(clerkUserId, stop.id, {
      itemId: "00000000-0000-0000-0000-000000000000",
    });

    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated add", async () => {
    const { item, stop } = await givenItemAndStop("clerk_stop_add_anon");

    const res = await request(app)
      .post(`/api/stops/${stop.id}/items`)
      .send({ itemId: item.id });

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/stops/:stopId/items/:itemId — remove an Item from a Stop", () => {
  it("removes the Item from the Stop", async () => {
    const clerkUserId = "clerk_stop_remove";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Remove me");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });

    const res = await removeFromStop(clerkUserId, stop.id, item.id);

    expect(res.status).toBe(200);
    expect(titlesIn(res.body as StopDetail)).toEqual([]);
    expect(titlesIn((await viewStop(clerkUserId, stop.id)).body)).toEqual([]);
  });

  it("leaves the Item itself in All — removal unfiles, it does not delete", async () => {
    const clerkUserId = "clerk_stop_remove_keeps_item";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Survivor");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });
    await setStatus(clerkUserId, item.id, "in_progress");

    await removeFromStop(clerkUserId, stop.id, item.id);

    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(item.id);
    expect(all[0]!.status).toBe("in_progress"); // and its progress is untouched
  });

  it("leaves the Item's other Stop memberships alone", async () => {
    const clerkUserId = "clerk_stop_remove_one_membership";
    const item = (await capture(clerkUserId, { title: "In two", type: "book" }))
      .body as Item;
    const first = (await createStop(clerkUserId, { name: "First" })).body as Stop;
    const second = (await createStop(clerkUserId, { name: "Second" }))
      .body as Stop;
    await addToStop(clerkUserId, first.id, { itemId: item.id });
    await addToStop(clerkUserId, second.id, { itemId: item.id });

    await removeFromStop(clerkUserId, first.id, item.id);

    expect(titlesIn((await viewStop(clerkUserId, first.id)).body)).toEqual([]);
    expect(titlesIn((await viewStop(clerkUserId, second.id)).body)).toEqual([
      "In two",
    ]);
  });

  it("removes only the named Item, leaving the Stop's other Items", async () => {
    const clerkUserId = "clerk_stop_remove_only_named";
    const stop = (await createStop(clerkUserId, { name: "Mixed" })).body as Stop;
    const goes = (await capture(clerkUserId, { title: "Goes", type: "video" }))
      .body as Item;
    const stays = (await capture(clerkUserId, { title: "Stays", type: "video" }))
      .body as Item;
    await addToStop(clerkUserId, stop.id, { itemId: goes.id });
    await addToStop(clerkUserId, stop.id, { itemId: stays.id });

    await removeFromStop(clerkUserId, stop.id, goes.id);

    expect(titlesIn((await viewStop(clerkUserId, stop.id)).body)).toEqual([
      "Stays",
    ]);
  });

  it("refuses an unauthenticated removal", async () => {
    const clerkUserId = "clerk_stop_remove_anon";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Anon remove");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });

    const res = await request(app).delete(
      `/api/stops/${stop.id}/items/${item.id}`,
    );

    expect(res.status).toBe(401);
    expect(titlesIn((await viewStop(clerkUserId, stop.id)).body)).toEqual([
      "Anon remove",
    ]);
  });
});

describe("GET /api/stops/:stopId — view a Stop's contents", () => {
  it("shows each Item with its Status", async () => {
    const clerkUserId = "clerk_stop_view_status";
    const stop = (await createStop(clerkUserId, { name: "Progress" }))
      .body as Stop;
    const started = (
      await capture(clerkUserId, { title: "Started", type: "article" })
    ).body as Item;
    const fresh = (await capture(clerkUserId, { title: "Fresh", type: "article" }))
      .body as Item;
    await addToStop(clerkUserId, stop.id, { itemId: started.id });
    await addToStop(clerkUserId, stop.id, { itemId: fresh.id });
    await setStatus(clerkUserId, started.id, "in_progress");

    const detail = (await viewStop(clerkUserId, stop.id)).body as StopDetail;

    const statusOf = (title: string) =>
      detail.items.find((item) => item.title === title)?.status;
    expect(statusOf("Started")).toBe("in_progress");
    expect(statusOf("Fresh")).toBe("not_started");
  });

  it("shows an Item's derived past target inside a Stop, exactly as All does", async () => {
    const clerkUserId = "clerk_stop_view_past_target";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Slipped");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });
    await request(app)
      .patch(`/api/items/${item.id}/target-date`)
      .set(TEST_USER_HEADER, clerkUserId)
      .send({ targetDate: "2000-01-01" });

    const detail = (await viewStop(clerkUserId, stop.id)).body as StopDetail;

    expect(detail.items[0]!.targetDate).toBe("2000-01-01");
    expect(detail.items[0]!.pastTarget).toBe(true);
  });

  it("404s on a Stop that does not exist", async () => {
    const res = await viewStop(
      "clerk_stop_view_missing",
      "00000000-0000-0000-0000-000000000000",
    );

    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated view", async () => {
    const { stop } = await givenItemAndStop("clerk_stop_view_anon");

    expect((await request(app).get(`/api/stops/${stop.id}`)).status).toBe(401);
  });
});

describe("GET /api/trails/:trailId/stops/:stopId — view a Stop in its route context", () => {
  it("treats mismatched and foreign Trail/Stop pairs exactly like missing ones", async () => {
    const owner = "clerk_stop_route_context_owner";
    const owningTrailId = await trailFor(owner);
    const stop = (await createStop(owner, { name: "Contextual Stop" }))
      .body as Stop;
    const otherTrailId = (
      await request(app)
        .post("/api/trails")
        .set(TEST_USER_HEADER, owner)
        .send({ name: "Other Trail" })
    ).body.id as string;

    expect((await viewTrailStop(owner, owningTrailId, stop.id)).status).toBe(200);
    expect((await viewTrailStop(owner, otherTrailId, stop.id)).status).toBe(404);
    expect((await viewTrailStop(owner, owningTrailId, "not-a-stop-id")).status)
      .toBe(404);
    expect(
      (await viewTrailStop("clerk_stop_route_context_intruder", owningTrailId, stop.id))
        .status,
    ).toBe(404);
  });
});

describe("one Status, read through every Stop that holds the Item", () => {
  it("reflects a single Status change through every Stop containing the Item", async () => {
    const clerkUserId = "clerk_stop_shared_status";
    const item = (
      await capture(clerkUserId, { title: "Tracked once", type: "course" })
    ).body as Item;
    const stops: Stop[] = [];
    for (const name of ["Learn CSS", "Build the API", "Reading list"]) {
      const stop = (await createStop(clerkUserId, { name })).body as Stop;
      await addToStop(clerkUserId, stop.id, { itemId: item.id });
      stops.push(stop);
    }

    // Changed once, on the Item — not per Stop, because there is nowhere else
    // for a Status to live (ADR-0004: the membership carries none).
    await setStatus(clerkUserId, item.id, "done");

    for (const stop of stops) {
      const detail = (await viewStop(clerkUserId, stop.id)).body as StopDetail;
      expect(detail.items[0]!.status, `Status in ${stop.name}`).toBe("done");
    }
    const all = (
      await request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId)
    ).body as Item[];
    expect(all[0]!.status).toBe("done");
  });
});

describe("StopItem — a bare join and nothing more", () => {
  it("carries only its User anchor and membership ends — no position or status", async () => {
    const { rows } = await harness.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'stop_items'`,
    );
    const columns = rows.map((row) => row.column_name).sort();

    // user_id is the tenancy guardrail ADR-0009 requires on every domain table.
    // The two membership ends still carry no domain fact of their own: ordering
    // lives on the Trail, and Status lives on the Item.
    expect(columns).toEqual(["item_id", "stop_id", "user_id"]);
  });

  it("cannot hold the same Item in the same Stop twice, at the database", async () => {
    const clerkUserId = "clerk_stop_item_unique";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Only once");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });

    // Set semantics are the schema's guarantee, not just the route's.
    await expect(
      harness.pool.query(
        `INSERT INTO stop_items (user_id, stop_id, item_id)
         VALUES ($1, $2, $3)`,
        [stop.userId, stop.id, item.id],
      ),
    ).rejects.toThrow();
  });

  it("rejects a cross-User membership at the database boundary", async () => {
    const alice = await givenItemAndStop(
      "clerk_stop_item_tenant_alice",
      "Alice's item",
      "Alice's stop",
    );
    const bob = await givenItemAndStop(
      "clerk_stop_item_tenant_bob",
      "Bob's item",
      "Bob's stop",
    );

    await expect(
      harness.pool.query(
        `INSERT INTO stop_items (user_id, stop_id, item_id)
         VALUES ($1, $2, $3)`,
        [alice.stop.userId, alice.stop.id, bob.item.id],
      ),
    ).rejects.toThrow(/stop_items_item_owner_fk/);
  });
});

describe("per-User isolation", () => {
  it("shows a User only their own Stops — never another User's", async () => {
    await createStop("clerk_stop_iso_alice", { name: "Alice's stop" });
    await createStop("clerk_stop_iso_bob", { name: "Bob's stop" });

    const aliceStops = (await listStops("clerk_stop_iso_alice")).body as Stop[];
    const bobStops = (await listStops("clerk_stop_iso_bob")).body as Stop[];

    expect(aliceStops.map((stop) => stop.name)).toEqual(["Alice's stop"]);
    expect(bobStops.map((stop) => stop.name)).toEqual(["Bob's stop"]);
    expect(aliceStops[0]!.userId).not.toBe(bobStops[0]!.userId);
  });

  it("cannot view another User's Stop", async () => {
    const { stop } = await givenItemAndStop("clerk_stop_iso_view_owner");

    const res = await viewStop("clerk_stop_iso_view_intruder", stop.id);

    expect(res.status).toBe(404);
  });

  it("cannot add an Item to another User's Stop", async () => {
    const { stop } = await givenItemAndStop("clerk_stop_iso_add_owner");
    const intruderItem = (
      await capture("clerk_stop_iso_add_intruder", {
        title: "Intruder's item",
        type: "article",
      })
    ).body as Item;

    const res = await addToStop("clerk_stop_iso_add_intruder", stop.id, {
      itemId: intruderItem.id,
    });

    expect(res.status).toBe(404);
    expect(titlesIn((await viewStop("clerk_stop_iso_add_owner", stop.id)).body))
      .toEqual([]);
  });

  it("cannot add another User's Item to your own Stop", async () => {
    const ownerItem = (
      await capture("clerk_stop_iso_item_owner", {
        title: "Owner's item",
        type: "book",
      })
    ).body as Item;
    const stop = (
      await createStop("clerk_stop_iso_item_taker", { name: "My stop" })
    ).body as Stop;

    const res = await addToStop("clerk_stop_iso_item_taker", stop.id, {
      itemId: ownerItem.id,
    });

    expect(res.status).toBe(404);
    expect(
      titlesIn((await viewStop("clerk_stop_iso_item_taker", stop.id)).body),
    ).toEqual([]);
  });

  it("cannot remove an Item from another User's Stop", async () => {
    const clerkUserId = "clerk_stop_iso_remove_owner";
    const { item, stop } = await givenItemAndStop(clerkUserId, "Owner's only");
    await addToStop(clerkUserId, stop.id, { itemId: item.id });

    const res = await removeFromStop(
      "clerk_stop_iso_remove_intruder",
      stop.id,
      item.id,
    );

    expect(res.status).toBe(404);
    expect(titlesIn((await viewStop(clerkUserId, stop.id)).body)).toEqual([
      "Owner's only",
    ]);
  });
});
