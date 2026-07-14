import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * Per-User tenancy through the auth seam (issue #16). Every request injects a
 * current User via the middleware — no Clerk — and we assert the two load-bearing
 * properties: a `users` row is provisioned per identity holding Clerk's id as an
 * external reference, and one User's request never resolves to another User's
 * row. This is the isolation guarantee every later ticket's domain routes inherit
 * by scoping to `req.user`.
 */
let harness: TestApp;
let app: Express;

const asUser = (clerkUserId: string) =>
  request(app).get("/api/me").set(TEST_USER_HEADER, clerkUserId);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("GET /api/me — tenancy through the auth seam", () => {
  it("refuses a request with no injected User", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("provisions a users row holding Clerk's id as an external reference", async () => {
    const res = await asUser("clerk_alice");

    expect(res.status).toBe(200);
    expect(res.body.clerkUserId).toBe("clerk_alice");
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id).not.toBe("clerk_alice"); // our id, not Clerk's
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it("maps the same Clerk identity to the same anchor id (idempotent provisioning)", async () => {
    const first = await asUser("clerk_repeat");
    const second = await asUser("clerk_repeat");

    expect(first.body.id).toBe(second.body.id);
  });

  it("keeps each User's row private — one User never resolves to another's", async () => {
    const alice = await asUser("clerk_alice_iso");
    const bob = await asUser("clerk_bob_iso");

    expect(alice.body.id).not.toBe(bob.body.id);
    expect(alice.body.clerkUserId).toBe("clerk_alice_iso");
    expect(bob.body.clerkUserId).toBe("clerk_bob_iso");

    // Acting as Bob again returns strictly Bob's row — never Alice's.
    const bobAgain = await asUser("clerk_bob_iso");
    expect(bobAgain.body.id).toBe(bob.body.id);
    expect(bobAgain.body.id).not.toBe(alice.body.id);
  });

  it("provisioning one User never affects another's row", async () => {
    const rowOf = async (clerkUserId: string) =>
      (
        await harness.pool.query(
          "SELECT id, clerk_user_id, created_at FROM users WHERE clerk_user_id = $1",
          [clerkUserId],
        )
      ).rows;

    await asUser("clerk_carol");
    const before = await rowOf("clerk_carol");
    expect(before).toHaveLength(1);

    // Provisioning is v1's only write path; first-time and repeat provisioning
    // of another identity must leave Carol's row untouched, column for column.
    // Later tickets' domain writes extend this same assertion to their tables.
    await asUser("clerk_dan");
    await asUser("clerk_dan");

    expect(await rowOf("clerk_carol")).toEqual(before);
  });
});
