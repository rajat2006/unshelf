import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Item } from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";
import { deleteItem } from "./delete-item-service";

describe("Item deletion service", () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await startTestApp();
  });

  afterAll(async () => harness.stop());

  it("ends an owned Item once and treats its retained tombstone as success", async () => {
    const item = (
      await request(harness.app)
        .post("/api/items")
        .set(TEST_USER_HEADER, "delete-item-service-owner")
        .send({ title: "End once", type: "article" })
    ).body as Item;

    const first = await deleteItem({
      db: harness.db,
      userId: item.userId,
      itemId: item.id,
    });
    const firstDeletion = await harness.pool.query<{ deleted_at: Date }>(
      "SELECT deleted_at FROM items WHERE id = $1",
      [item.id],
    );
    const replay = await deleteItem({
      db: harness.db,
      userId: item.userId,
      itemId: item.id,
    });
    const replayDeletion = await harness.pool.query<{ deleted_at: Date }>(
      "SELECT deleted_at FROM items WHERE id = $1",
      [item.id],
    );

    expect(first).toEqual({ ok: true });
    expect(replay).toEqual({ ok: true });
    expect(firstDeletion.rows[0].deleted_at).toBeInstanceOf(Date);
    expect(replayDeletion.rows[0].deleted_at).toEqual(
      firstDeletion.rows[0].deleted_at,
    );
  });

  it("returns the tagged not-found result for an Item outside the User boundary", async () => {
    const owner = (
      await request(harness.app)
        .post("/api/items")
        .set(TEST_USER_HEADER, "delete-item-service-private-owner")
        .send({ title: "Private Item", type: "book" })
    ).body as Item;
    const intruder = (
      await request(harness.app)
        .post("/api/items")
        .set(TEST_USER_HEADER, "delete-item-service-private-intruder")
        .send({ title: "Intruder anchor", type: "article" })
    ).body as Item;

    const result = await deleteItem({
      db: harness.db,
      userId: intruder.userId,
      itemId: owner.id,
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
