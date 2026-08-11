import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { LearningPlan, Stage } from "@unshelf/shared";
import {
  startTestApp,
  TEST_USER_HEADER,
  type TestApp,
} from "../../test/harness";

describe("Learning Plan service", () => {
  let harness: TestApp;
  let app: Express;

  beforeAll(async () => {
    harness = await startTestApp();
    app = harness.app;
  });

  afterAll(async () => harness.stop());

  it("returns the standard service failure for a self-edge", async () => {
    const user = "learning-plan-service-self-edge";
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
        .send({ name: "Only Stage" })
    ).body as Stage;

    const response = await request(app)
      .post(`/api/learning-plans/${plan.id}/edges`)
      .set(TEST_USER_HEADER, user)
      .send({ fromNodeId: stage.id, toNodeId: stage.id });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "a stage cannot link to itself" });
  });
});
