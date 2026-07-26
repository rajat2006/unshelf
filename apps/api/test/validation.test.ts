import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLabelRequestSchema } from "@unshelf/shared/validation";
import { validateRequest } from "../src/validation";

describe("request validation boundary", () => {
  it("parses a declared query schema for future query-bearing routes", async () => {
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

    const parsed = await request(app).get("/search").query({
      name: "  spaced   query  ",
    });
    expect(parsed.status).toBe(200);
    expect(parsed.body).toEqual({ name: "spaced   query" });

    const rejected = await request(app).get("/search").query({
      name: "valid",
      extra: "private value",
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual({
      error: "invalid_request",
      issues: [{ path: "query", message: "Unrecognized field: extra" }],
    });
    expect(rejected.text).not.toContain("private value");
  });
});
