import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import request from "supertest";
import type { ItemDetail } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

let harness: TestApp;
beforeAll(async () => {
  harness = await startTestApp();
});
afterAll(async () => {
  await harness.stop();
});
async function book(user: string) {
  return (
    await request(harness.app)
      .post("/api/items")
      .set(TEST_USER_HEADER, user)
      .send({ title: "A book", type: "book" })
  ).body as ItemDetail;
}
function confirm(input: {
  user: string;
  item: ItemDetail;
  key: string;
  titles?: string[];
}) {
  return request(harness.app)
    .post(`/api/items/${input.item.id}/chapters/confirm`)
    .set(TEST_USER_HEADER, input.user)
    .send({
      confirmationKey: input.key,
      titles: input.titles ?? ["One", "Two"],
    });
}

it("replays current detail after edits, progress, reorder and removal without resurrecting Parts", async () => {
  const user = "receipt-lifetime";
  const item = await book(user);
  const key = randomUUID();
  const done = await request(harness.app)
    .patch(`/api/items/${item.id}/status`)
    .set(TEST_USER_HEADER, user)
    .send({ status: "done" });
  await request(harness.app)
    .post("/api/daily-focus/today/items")
    .set(TEST_USER_HEADER, user)
    .send({ itemId: item.id })
    .expect(201);
  const created = await confirm({ user, item, key });
  const focus = await request(harness.app)
    .get("/api/daily-focus/today")
    .set(TEST_USER_HEADER, user);
  expect(focus.body.entries[0].snapshot).toEqual({
    status: "done",
    partPercentage: 0,
  });
  expect(created.body).toMatchObject({
    status: "done",
    completedAt: (done.body as ItemDetail).completedAt,
    partPercentage: 0,
  });
  const parts = (created.body as ItemDetail).parts;
  const base = `/api/items/${item.id}/parts`;
  await request(harness.app)
    .patch(`${base}/${parts[0].id}`)
    .set(TEST_USER_HEADER, user)
    .send({ title: "Renamed" });
  await request(harness.app)
    .patch(`${base}/${parts[0].id}/completion`)
    .set(TEST_USER_HEADER, user)
    .send({ completed: true });
  await request(harness.app)
    .put(`${base}/order`)
    .set(TEST_USER_HEADER, user)
    .send({ partIds: [parts[1].id, parts[0].id] })
    .expect(200);
  const read = await request(harness.app)
    .get(`/api/items/${item.id}`)
    .set(TEST_USER_HEADER, user);
  const focusBeforeReplay = await request(harness.app)
    .get("/api/daily-focus/today")
    .set(TEST_USER_HEADER, user);
  expect((await confirm({ user, item, key })).body).toEqual(read.body);
  const focusAfterReplay = await request(harness.app)
    .get("/api/daily-focus/today")
    .set(TEST_USER_HEADER, user);
  expect(focusAfterReplay.body).toEqual(focusBeforeReplay.body);
  expect(focusAfterReplay.body.entries[0].snapshot).toEqual({
    status: "in_progress",
    partPercentage: 50,
  });
  expect(read.body.parts).toMatchObject([
    { id: parts[1].id },
    { id: parts[0].id, title: "Renamed", completed: true },
  ]);
  for (const part of parts)
    await request(harness.app)
      .delete(`${base}/${part.id}`)
      .set(TEST_USER_HEADER, user)
      .expect(200);
  const removed = await request(harness.app)
    .get(`/api/items/${item.id}`)
    .set(TEST_USER_HEADER, user);
  expect((await confirm({ user, item, key })).body).toEqual(removed.body);
  expect(removed.body.parts).toEqual([]);
  expect(
    (await confirm({ user, item, key: randomUUID() })).body.parts,
  ).toHaveLength(2);
});

it("rolls back Parts when receipt insertion fails and permits a corrected new confirmation", async () => {
  const user = "receipt-rollback";
  const item = await book(user);
  const key = randomUUID();
  // A real database constraint fails after the Part insert, exercising transaction rollback.
  await harness.pool.query(
    `ALTER TABLE part_confirmation_receipts ADD CONSTRAINT test_receipt_failure CHECK (item_id <> '${item.id}'::uuid)`,
  );
  try {
    expect(
      (await confirm({ user, item, key, titles: ["PRIVATE_ROLLBACK"] })).status,
    ).toBe(500);
    const read = await request(harness.app)
      .get(`/api/items/${item.id}`)
      .set(TEST_USER_HEADER, user);
    expect(read.body.parts).toEqual([]);
  } finally {
    await harness.pool.query(
      "ALTER TABLE part_confirmation_receipts DROP CONSTRAINT test_receipt_failure",
    );
  }
  const retry = await confirm({ user, item, key });
  expect(retry.status).toBe(200);
  expect(retry.body.parts).toHaveLength(2);
  expect(JSON.stringify(harness.logger.records)).not.toContain(
    "PRIVATE_ROLLBACK",
  );
});

it("isolates receipts by User and Item and cleans them up with their owner", async () => {
  const user = "receipt-owner";
  const item = await book(user);
  const other = await book("receipt-other");
  const sibling = await book(user);
  const key = randomUUID();
  await confirm({ user, item, key }).expect(200);
  await confirm({ user: "receipt-other", item, key }).expect(404);
  await request(harness.app)
    .post(`/api/items/${item.id}/chapters/confirm`)
    .send({ confirmationKey: key, titles: ["One"] })
    .expect(401);
  await confirm({
    user: "receipt-other",
    item: other,
    key,
    titles: ["Different"],
  }).expect(200);
  await confirm({ user, item: sibling, key, titles: ["Sibling"] }).expect(200);
  await expect(
    harness.pool.query(
      "UPDATE part_confirmation_receipts SET user_id = $1 WHERE item_id = $2",
      [other.userId, item.id],
    ),
  ).rejects.toMatchObject({ constraint: "part_confirmation_item_owner_fk" });
  await harness.pool.query("DELETE FROM items WHERE user_id = $1", [
    item.userId,
  ]);
  await harness.pool.query("DELETE FROM users WHERE id = $1", [item.userId]);
  expect(
    (
      await harness.pool.query(
        "SELECT * FROM part_confirmation_receipts WHERE user_id = $1",
        [item.userId],
      )
    ).rows,
  ).toEqual([]);
  await confirm({
    user: "receipt-other",
    item: other,
    key,
    titles: ["Different"],
  }).expect(200);
});

it("finishes a disconnected confirmation and safely replays its lost response", async () => {
  const user = "receipt-disconnect";
  const item = await book(user);
  const key = randomUUID();
  const lock = await harness.pool.connect();
  await lock.query("BEGIN");
  await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    item.id,
  ]);
  const pending = confirm({ user, item, key, titles: ["PRIVATE_DISCONNECT"] });
  pending.end(() => undefined);
  try {
    await vi.waitFor(async () => {
      const waiting = await harness.pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE wait_event = 'advisory' AND datname = current_database()",
      );
      expect(waiting.rows.length).toBeGreaterThan(0);
    });
    pending.abort();
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
  await vi.waitFor(async () => {
    const read = await request(harness.app)
      .get(`/api/items/${item.id}`)
      .set(TEST_USER_HEADER, user);
    expect(read.body.parts).toHaveLength(1);
  });
  const read = await request(harness.app)
    .get(`/api/items/${item.id}`)
    .set(TEST_USER_HEADER, user);
  expect(
    (await confirm({ user, item, key, titles: ["PRIVATE_DISCONNECT"] })).body,
  ).toEqual(read.body);
  expect(
    harness.logger.records.some((record) => record.termination === "aborted"),
  ).toBe(true);
  expect(JSON.stringify(harness.logger.records)).not.toContain(
    "PRIVATE_DISCONNECT",
  );
});
