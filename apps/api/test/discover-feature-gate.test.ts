import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { startTestApp, type TestApp } from "./harness";

describe("Discover deployment feature gate", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await startTestApp({ discover: { enabled: false } });
  });

  afterAll(async () => {
    await testApp.stop();
  });

  it("does not mount acquisition routes while Discover is disabled", async () => {
    await request(testApp.app)
      .post("/api/discover/acquisitions")
      .send({ trigger: "app_open" })
      .expect(404);
  });
});
