import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLabelRequestSchema } from "@unshelf/shared/validation";
import { validateRequest } from "../src/validation";

describe("request validation boundary", () => {
  it("parses a declared query schema for future query-bearing routes", async () => {
    const app = queryTestApp();

    const parsed = await request(app).get("/search").query({
      name: "  spaced   query  ",
    });
    expect(parsed.status).toBe(200);
    expect(parsed.body).toEqual({ name: "spaced   query" });
  });

  it("rejects undeclared query fields without reflecting their values", async () => {
    const app = queryTestApp();
    const rejected = await request(app).get("/search").query({
      name: "valid",
      "password=private": "private value",
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({
      error: "invalid_request",
      issues: [
        {
          path: "query.$unknown",
          message: "Contains unrecognized fields",
        },
      ],
    });
    expect(rejected.text).not.toContain("private value");
    expect(rejected.text).not.toContain("password");
  });
});

function queryTestApp() {
  const app = express();
  app.get(
    "/search",
    validateRequest(
      { query: createLabelRequestSchema },
      ({ query }, _req, res) => {
        res.json(query);
      },
    ),
  );
  return app;
}
