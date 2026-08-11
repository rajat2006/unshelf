import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item, ItemDetail } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

describe("Item Parts", () => {
  let harness: TestApp;
  let app: Express;

  beforeAll(async () => {
    harness = await startTestApp();
    app = harness.app;
  });

  afterAll(async () => harness.stop());

  it("creates an initial ordered checklist without changing Item Status", async () => {
    const user = "parts-initial-checklist";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "A structured course", type: "course" })
    ).body as Item;
    await request(app)
      .patch(`/api/items/${item.id}/status`)
      .set(TEST_USER_HEADER, user)
      .send({ status: "in_progress" });

    const created = await request(app)
      .post(`/api/items/${item.id}/parts`)
      .set(TEST_USER_HEADER, user)
      .send({ titles: ["  Introduction  ", "   ", "First project"] });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: item.id,
      status: "in_progress",
      partPercentage: 0,
      parts: [
        { title: "Introduction", position: 0, completed: false },
        { title: "First project", position: 1, completed: false },
      ],
    });
    expect(created.body.parts[0].id).toEqual(expect.any(String));
    expect(created.body.parts[1].id).toEqual(expect.any(String));
    expect(created.body.parts[0].id).not.toBe(created.body.parts[1].id);

    const read = await request(app)
      .get(`/api/items/${item.id}`)
      .set(TEST_USER_HEADER, user);
    expect(read.status).toBe(200);
    expect(read.body as ItemDetail).toEqual(created.body);
  });

  it("derives percentage, Status, and Completion date from Part Completion", async () => {
    const user = "parts-derived-status";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Derive me", type: "book" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["One", "Two"] })
    ).body as ItemDetail;

    const half = await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });
    expect(half.status).toBe(200);
    expect(half.body).toMatchObject({
      status: "in_progress",
      partPercentage: 50,
      completedAt: null,
    });

    const done = await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[1].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });
    expect(done.body.status).toBe("done");
    expect(done.body.partPercentage).toBe(100);
    expect(done.body.completedAt).toEqual(expect.any(String));

    const reopened = await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: false });
    expect(reopened.body).toMatchObject({
      status: "in_progress",
      partPercentage: 50,
      completedAt: null,
    });
  });

  it("returns an existing checklist to automatic derivation when Parts are added", async () => {
    const user = "parts-add-membership";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Growing outline", type: "video" })
    ).body as Item;
    const initial = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["Original"] })
    ).body as ItemDetail;
    await request(app)
      .patch(`/api/items/${item.id}/parts/${initial.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });

    const added = await request(app)
      .post(`/api/items/${item.id}/parts`)
      .set(TEST_USER_HEADER, user)
      .send({ titles: ["New ending"] });

    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      status: "in_progress",
      partPercentage: 50,
      completedAt: null,
      parts: [
        { id: initial.parts[0].id, title: "Original", completed: true },
        { title: "New ending", completed: false },
      ],
    });
  });

  it("renames and reorders Parts without replacing identity, Completion, or Status", async () => {
    const user = "parts-edit-structure";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Editable outline", type: "playlist" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["First", "Second", "Third"] })
    ).body as ItemDetail;
    await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[1].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });
    const manuallyDone = (
      await request(app)
        .patch(`/api/items/${item.id}/status`)
        .set(TEST_USER_HEADER, user)
        .send({ status: "done" })
    ).body as Item;

    const renamed = await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[1].id}`)
      .set(TEST_USER_HEADER, user)
      .send({ title: "  Revised second  " });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({
      status: "done",
      completedAt: manuallyDone.completedAt,
      partPercentage: 33,
    });

    const reordered = await request(app)
      .put(`/api/items/${item.id}/parts/order`)
      .set(TEST_USER_HEADER, user)
      .send({
        partIds: [
          structured.parts[2].id,
          structured.parts[1].id,
          structured.parts[0].id,
        ],
      });
    expect(reordered.status).toBe(200);
    expect(reordered.body).toMatchObject({
      status: "done",
      completedAt: manuallyDone.completedAt,
      partPercentage: 33,
      parts: [
        { id: structured.parts[2].id, title: "Third", completed: false },
        {
          id: structured.parts[1].id,
          title: "Revised second",
          completed: true,
        },
        { id: structured.parts[0].id, title: "First", completed: false },
      ],
    });
  });

  it("derives after membership removal but preserves Status when the final Part is removed", async () => {
    const user = "parts-remove-membership";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Shrinking outline", type: "article" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["Keep", "Remove"] })
    ).body as ItemDetail;
    await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });

    const oneLeft = await request(app)
      .delete(`/api/items/${item.id}/parts/${structured.parts[1].id}`)
      .set(TEST_USER_HEADER, user);
    const oneLeftItem = oneLeft.body as ItemDetail;
    expect(oneLeft.status).toBe(200);
    expect(oneLeftItem).toMatchObject({
      status: "done",
      partPercentage: 100,
      parts: [{ id: structured.parts[0].id, position: 0 }],
    });
    expect(typeof oneLeftItem.completedAt).toBe("string");

    const unstructured = await request(app)
      .delete(`/api/items/${item.id}/parts/${structured.parts[0].id}`)
      .set(TEST_USER_HEADER, user);
    expect(unstructured.status).toBe(200);
    expect(unstructured.body).toMatchObject({
      status: "done",
      completedAt: oneLeftItem.completedAt,
      partPercentage: null,
      parts: [],
    });
  });

  it("keeps Part mutations User-scoped and rejects partial orders atomically", async () => {
    const owner = "parts-private-owner";
    const intruder = "parts-private-intruder";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, owner)
        .send({ title: "Private structure", type: "other" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, owner)
        .send({ titles: ["Private one", "Private two"] })
    ).body as ItemDetail;

    expect(
      (
        await request(app)
          .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}`)
          .set(TEST_USER_HEADER, intruder)
          .send({ title: "Stolen" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/items/${item.id}/parts/${structured.parts[0].id}`)
          .set(TEST_USER_HEADER, intruder)
      ).status,
    ).toBe(404);

    const incompleteOrder = await request(app)
      .put(`/api/items/${item.id}/parts/order`)
      .set(TEST_USER_HEADER, owner)
      .send({ partIds: [structured.parts[1].id] });
    expect(incompleteOrder.status).toBe(409);
    const unchanged = (
      await request(app)
        .get(`/api/items/${item.id}`)
        .set(TEST_USER_HEADER, owner)
    ).body as ItemDetail;
    expect(unchanged.parts).toEqual(structured.parts);
  });

  it("enforces Part ownership, order, title, and cascade constraints in PostgreSQL", async () => {
    const first = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, "parts-db-first")
        .send({ title: "First owner", type: "book" })
    ).body as Item;
    const second = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, "parts-db-second")
        .send({ title: "Second owner", type: "book" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${first.id}/parts`)
        .set(TEST_USER_HEADER, "parts-db-first")
        .send({ titles: ["Constrained"] })
    ).body as ItemDetail;

    await expect(
      harness.pool.query(
        "INSERT INTO parts (user_id, item_id, title, position) VALUES ($1, $2, 'Foreign', 1)",
        [second.userId, first.id],
      ),
    ).rejects.toMatchObject({ constraint: "parts_item_owner_fk" });
    await expect(
      harness.pool.query(
        "INSERT INTO parts (user_id, item_id, title, position) VALUES ($1, $2, 'Duplicate', 0)",
        [first.userId, first.id],
      ),
    ).rejects.toMatchObject({ constraint: "parts_item_position_idx" });
    await expect(
      harness.pool.query(
        "INSERT INTO parts (user_id, item_id, title, position) VALUES ($1, $2, '   ', 1)",
        [first.userId, first.id],
      ),
    ).rejects.toMatchObject({ constraint: "parts_title_nonblank_check" });

    await harness.pool.query("DELETE FROM items WHERE id = $1", [first.id]);
    const remaining = await harness.pool.query(
      "SELECT id FROM parts WHERE id = $1",
      [structured.parts[0].id],
    );
    expect(remaining.rows).toEqual([]);
  });
});
