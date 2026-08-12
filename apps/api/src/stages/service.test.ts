import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Item, LearningPlan, StageDetail } from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";

describe("Stage service", () => {
  let harness: TestApp;
  let app: Express;

  beforeAll(async () => {
    harness = await startTestApp();
    app = harness.app;
  });

  afterAll(async () => harness.stop());

  it("coordinates rename and membership changes for an owned Stage", async () => {
    const user = "stage-service-owner";
    const plan = (
      await request(app)
        .post("/api/learning-plans")
        .set(TEST_USER_HEADER, user)
        .send({ name: "Service boundary" })
    ).body as LearningPlan;
    const stage = (
      await request(app)
        .post(`/api/learning-plans/${plan.id}/stages`)
        .set(TEST_USER_HEADER, user)
        .send({ name: "Before" })
    ).body as StageDetail;
    const item = (
      await request(app)
        .post("/api/items")
        .set(TEST_USER_HEADER, user)
        .send({ title: "Shared Item", type: "article" })
    ).body as Item;

    const renamed = await request(app)
      .patch(`/api/stages/${stage.id}`)
      .set(TEST_USER_HEADER, user)
      .send({ name: "After" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ id: stage.id, name: "After" });

    const placed = await request(app)
      .post(`/api/stages/${stage.id}/items`)
      .set(TEST_USER_HEADER, user)
      .send({ itemId: item.id });
    expect(placed.status).toBe(200);
    expect(placed.body).toMatchObject({
      id: stage.id,
      name: "After",
      items: [{ id: item.id }],
    });
  });
});
