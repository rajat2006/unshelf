import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { apiErrorHandler } from "../src/middleware/error-handler";

describe("API error policy", () => {
  it("does not treat an unrelated typed error as malformed JSON", async () => {
    const app = express();
    app.get("/failure", (_req, _res, next) => {
      const error = Object.assign(new Error("private diagnostic"), {
        type: "entity.parse.failed",
      });
      next(error);
    });
    app.use(apiErrorHandler);

    const response = await request(app).get("/failure");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "internal_server_error",
      message: "An unexpected error occurred",
    });
    expect(response.text).not.toContain("private diagnostic");
  });
});
