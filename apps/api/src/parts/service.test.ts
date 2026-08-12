import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item, ItemDetail } from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";

describe("Part service", () => {
  let harness: TestApp;
  let app: Express;

  beforeAll(async () => {
    harness = await startTestApp();
    app = harness.app;
  });

  afterAll(async () => harness.stop());

  it("coordinates structure and Completion changes for an owned Item", async () => {
    const user = "part-service-owner";
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Service boundary", type: "course" })
    ).body as Item;
    const structured = (
      await request(app)
        .post(`/api/items/${item.id}/parts`)
        .set(TEST_USER_HEADER, user)
        .send({ titles: ["First", "Second"] })
    ).body as ItemDetail;

    const changed = await request(app)
      .patch(`/api/items/${item.id}/parts/${structured.parts[0].id}/completion`)
      .set(TEST_USER_HEADER, user)
      .send({ completed: true });

    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      status: "in_progress",
      partPercentage: 50,
    });
  });
});
