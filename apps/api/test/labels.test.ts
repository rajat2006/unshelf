import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item, Label } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
let app: Express;

const createLabel = (clerkUserId: string, body: object) =>
  request(app)
    .post("/api/labels")
    .set(TEST_USER_HEADER, clerkUserId)
    .send(body);

const listLabels = (clerkUserId: string) =>
  request(app).get("/api/labels").set(TEST_USER_HEADER, clerkUserId);

const capture = (clerkUserId: string, title: string) =>
  request(app)
    .post("/api/items")
    .set(TEST_USER_HEADER, clerkUserId)
    .send({ title, type: "article" });

const applyLabel = (clerkUserId: string, itemId: string, labelId: string) =>
  request(app)
    .post(`/api/items/${itemId}/labels/${labelId}`)
    .set(TEST_USER_HEADER, clerkUserId);

const removeLabel = (clerkUserId: string, itemId: string, labelId: string) =>
  request(app)
    .delete(`/api/items/${itemId}/labels/${labelId}`)
    .set(TEST_USER_HEADER, clerkUserId);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("private Labels", () => {
  it("creates free-text Labels and lists only the authenticated User's", async () => {
    const alice = await createLabel("clerk_labels_alice", {
      name: "  Distributed systems  ",
    });
    await createLabel("clerk_labels_bob", { name: "Bob only" });

    expect(alice.status).toBe(201);
    expect((alice.body as Label).name).toBe("Distributed systems");
    expect(typeof (alice.body as Label).id).toBe("string");

    const listed = (await listLabels("clerk_labels_alice")).body as Label[];
    expect(listed.map((label) => label.name)).toEqual(["Distributed systems"]);
  });

  it("rejects undeclared Label fields without creating a Label", async () => {
    const user = "clerk_label_unknown";
    const res = await createLabel(user, {
      name: "Valid",
      colour: "secret-red",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "body", message: "Unrecognized field: colour" }],
    });
    expect(res.text).not.toContain("secret-red");
    expect((await listLabels(user)).body).toEqual([]);
  });

  it("applies several Labels across Items with set semantics, then removes only that membership", async () => {
    const user = "clerk_label_membership";
    const firstItem = (await capture(user, "First Item")).body as Item;
    const secondItem = (await capture(user, "Second Item")).body as Item;
    const systems = (await createLabel(user, { name: "Systems" }))
      .body as Label;
    const reading = (await createLabel(user, { name: "Reading" }))
      .body as Label;

    await applyLabel(user, firstItem.id, systems.id);
    await applyLabel(user, firstItem.id, reading.id);
    await applyLabel(user, firstItem.id, systems.id);
    const second = await applyLabel(user, secondItem.id, systems.id);

    expect(second.status).toBe(200);
    expect((second.body as Item).labels).toEqual([systems]);

    const first = (
      await request(app)
        .get(`/api/items/${firstItem.id}`)
        .set(TEST_USER_HEADER, user)
    ).body as Item;
    expect(first.labels.map((label) => label.name)).toEqual([
      "Reading",
      "Systems",
    ]);

    const removed = await removeLabel(user, firstItem.id, systems.id);
    expect(removed.status).toBe(200);
    expect((removed.body as Item).labels).toEqual([reading]);

    const removedAgain = await removeLabel(user, firstItem.id, systems.id);
    expect(removedAgain.status).toBe(200);
    expect((removedAgain.body as Item).labels).toEqual([reading]);
    expect((removedAgain.body as Item).title).toBe("First Item");
  });

  it("rejects cross-User Label membership at the database boundary", async () => {
    const aliceItem = (await capture("clerk_label_db_alice", "Alice Item"))
      .body as Item;
    const bobLabel = (
      await createLabel("clerk_label_db_bob", { name: "Bob Label" })
    ).body as Label;

    await expect(
      harness.pool.query(
        `INSERT INTO item_labels (user_id, item_id, label_id)
         VALUES ($1, $2, $3)`,
        [aliceItem.userId, aliceItem.id, bobLabel.id],
      ),
    ).rejects.toThrow(/item_labels_label_owner_fk/);
  });

  it("treats foreign Item and Label identifiers as missing at the API boundary", async () => {
    const owner = "clerk_label_private_owner";
    const intruder = "clerk_label_private_intruder";
    const item = (await capture(owner, "Private Item")).body as Item;
    const label = (await createLabel(owner, { name: "Private Label" }))
      .body as Label;
    const intruderItem = (await capture(intruder, "Intruder Item"))
      .body as Item;
    const intruderLabel = (
      await createLabel(intruder, { name: "Intruder Label" })
    ).body as Label;

    expect((await applyLabel(intruder, item.id, intruderLabel.id)).status).toBe(
      404,
    );
    expect((await applyLabel(owner, item.id, intruderLabel.id)).status).toBe(
      404,
    );
    expect((await applyLabel(owner, intruderItem.id, label.id)).status).toBe(
      404,
    );
    expect((await removeLabel(intruder, item.id, label.id)).status).toBe(404);

    const unchanged = (
      await request(app)
        .get(`/api/items/${item.id}`)
        .set(TEST_USER_HEADER, owner)
    ).body as Item;
    expect(unchanged.labels).toEqual([]);
  });

  it("changes only Label membership, leaving Item facts and Stop placement intact", async () => {
    const user = "clerk_label_independent";
    const trail = (
      await request(app)
        .post("/api/trails")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Independent Trail" })
    ).body as { id: string };
    const stop = (
      await request(app)
        .post(`/api/trails/${trail.id}/stops`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Independent Stop" })
    ).body as { id: string };
    const item = (await capture(user, "Unchanged Item")).body as Item;
    await request(app)
      .post(`/api/stops/${stop.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    const label = (await createLabel(user, { name: "Independent Label" }))
      .body as Label;

    const changed = (await applyLabel(user, item.id, label.id)).body as Item;
    expect({ ...changed, labels: [] }).toEqual(item);

    const stopAfter = (
      await request(app)
        .get(`/api/stops/${stop.id}`)
        .set(TEST_USER_HEADER, user)
    ).body as { items: Item[] };
    expect(stopAfter.items.map((member) => member.id)).toEqual([item.id]);
    expect(stopAfter.items[0]?.labels).toEqual([label]);
  });

  it("requires a non-blank name and authentication", async () => {
    expect((await createLabel("clerk_label_invalid", {})).status).toBe(400);
    expect(
      (await createLabel("clerk_label_invalid", { name: "   " })).status,
    ).toBe(400);
    expect(
      (await request(app).post("/api/labels").send({ name: "Anonymous" }))
        .status,
    ).toBe(401);
  });
});
