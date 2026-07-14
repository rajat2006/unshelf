import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item } from "@unshelf/shared";
import { startTestApp, TEST_USER_HEADER, type TestApp } from "./harness";

/**
 * Capture and All at the HTTP boundary (issue #17), driven against a real
 * ephemeral Postgres. These are the load-bearing guarantees of the Item spine:
 * capture is one uniform insert scoped to the current User, All is the query
 * "every Item where user = me", and one User's Items are never visible to
 * another. Every assertion runs through the same auth seam T2 established — a
 * header names the acting User, no Clerk involved.
 */
let harness: TestApp;
let app: Express;

const capture = (clerkUserId: string, body: object) =>
  request(app).post("/api/items").set(TEST_USER_HEADER, clerkUserId).send(body);

const listAll = (clerkUserId: string) =>
  request(app).get("/api/items").set(TEST_USER_HEADER, clerkUserId);

beforeAll(async () => {
  harness = await startTestApp();
  app = harness.app;
});

afterAll(async () => {
  await harness?.stop();
});

describe("POST /api/items — capture", () => {
  it("captures title + type + optional source in one insert, scoped to the User", async () => {
    const res = await capture("clerk_cap_basic", {
      title: "A Philosophy of Software Design",
      type: "book",
      source: "https://example.com/aposd",
    });

    expect(res.status).toBe(201);
    const item = res.body as Item;
    expect(item.id).toBeTruthy();
    expect(item.title).toBe("A Philosophy of Software Design");
    expect(item.type).toBe("book");
    expect(item.source).toBe("https://example.com/aposd");
    expect(typeof item.userId).toBe("string");
    expect(item.userId).not.toBe("clerk_cap_basic"); // our anchor id, not Clerk's
  });

  it("lands a new Item at status not started with the deferred seams empty", async () => {
    const res = await capture("clerk_cap_status", {
      title: "Untracked",
      type: "article",
    });

    const item = res.body as Item;
    expect(item.status).toBe("not_started");
    expect(item.targetDate).toBeNull();
    expect(item.completedAt).toBeNull();
    expect(typeof item.createdAt).toBe("string");
  });

  it("adds an offline Item by title alone — source is optional", async () => {
    const res = await capture("clerk_cap_offline", {
      title: "A paper library book",
      type: "book",
    });

    expect(res.status).toBe(201);
    expect((res.body as Item).source).toBeNull();
  });

  it("stores source verbatim and unvalidated — never mutated, never rejected", async () => {
    const messy = "  not even a url — kept As-Is  ";
    const res = await capture("clerk_cap_verbatim", {
      title: "  spaces around the title kept  ",
      type: "other",
      source: messy,
    });

    expect(res.status).toBe(201);
    const item = res.body as Item;
    expect(item.source).toBe(messy);
    expect(item.title).toBe("  spaces around the title kept  ");
  });

  it("does not dedupe — the same link captured twice yields two distinct Items", async () => {
    const body = { title: "Twice", type: "video", source: "https://dup.example" };
    const first = (await capture("clerk_cap_dupe", body)).body as Item;
    const second = (await capture("clerk_cap_dupe", body)).body as Item;

    expect(first.id).not.toBe(second.id);
    const all = (await listAll("clerk_cap_dupe")).body as Item[];
    expect(all.filter((i) => i.source === "https://dup.example")).toHaveLength(2);
  });

  it("requires a title", async () => {
    expect((await capture("clerk_cap_bad", { type: "article" })).status).toBe(400);
    expect(
      (await capture("clerk_cap_bad", { title: "   ", type: "article" })).status,
    ).toBe(400);
  });

  it("requires a valid, chosen type — no default", async () => {
    expect((await capture("clerk_cap_bad", { title: "No type" })).status).toBe(400);
    expect(
      (await capture("clerk_cap_bad", { title: "Bad type", type: "podcast" }))
        .status,
    ).toBe(400);
  });

  it("refuses an unauthenticated capture", async () => {
    const res = await request(app)
      .post("/api/items")
      .send({ title: "Anon", type: "article" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/items — All", () => {
  it("lists every Item belonging to the current User", async () => {
    await capture("clerk_all_owner", { title: "One", type: "article" });
    await capture("clerk_all_owner", { title: "Two", type: "course" });

    const res = await listAll("clerk_all_owner");
    expect(res.status).toBe(200);
    const titles = (res.body as Item[]).map((i) => i.title);
    expect(titles).toContain("One");
    expect(titles).toContain("Two");
  });

  it("refuses an unauthenticated read of All", async () => {
    expect((await request(app).get("/api/items")).status).toBe(401);
  });
});

describe("per-User isolation", () => {
  it("shows a User only their own Items — never another User's", async () => {
    await capture("clerk_iso_alice", { title: "Alice's item", type: "article" });
    await capture("clerk_iso_bob", { title: "Bob's item", type: "book" });

    const aliceAll = (await listAll("clerk_iso_alice")).body as Item[];
    const bobAll = (await listAll("clerk_iso_bob")).body as Item[];

    const aliceTitles = aliceAll.map((i) => i.title);
    expect(aliceTitles).toContain("Alice's item");
    expect(aliceTitles).not.toContain("Bob's item");

    const bobTitles = bobAll.map((i) => i.title);
    expect(bobTitles).toContain("Bob's item");
    expect(bobTitles).not.toContain("Alice's item");

    // Every Item in Alice's All is stamped with Alice's own anchor id.
    const aliceId = aliceAll[0]!.userId;
    expect(aliceAll.every((i) => i.userId === aliceId)).toBe(true);
    expect(bobAll.every((i) => i.userId !== aliceId)).toBe(true);
  });
});
