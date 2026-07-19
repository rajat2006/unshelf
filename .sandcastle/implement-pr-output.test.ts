import { describe, expect, it } from "vitest";
import { implementPrOutputSchema } from "./implement-pr-output";

/** A minimal well-formed addressed-comment item, spread-overridable per test. */
function item(overrides: Record<string, unknown> = {}) {
  return {
    comment: "Extract the duplicated distance calc into a helper",
    status: "addressed",
    file: "apps/web/src/trail/geometry.ts",
    action: "Pulled the haversine formula into `distanceMeters()` and reused it.",
    ...overrides,
  };
}

describe("implementPrOutputSchema — the implement-pr <output> contract", () => {
  it("accepts a full, well-formed run", () => {
    const parsed = implementPrOutputSchema.parse({
      summary: "3 comments: 2 addressed, 1 deferred.",
      items: [
        item(),
        item({ status: "deferred", action: "Needs a product call on the copy." }),
      ],
    });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].status).toBe("addressed");
    expect(parsed.items[1].status).toBe("deferred");
  });

  it("accepts an item without a file (a PR-level comment)", () => {
    const parsed = implementPrOutputSchema.parse({
      summary: "1 comment addressed.",
      items: [item({ file: undefined })],
    });
    expect(parsed.items[0].file).toBeUndefined();
  });

  it("accepts an empty items array (no actionable comments)", () => {
    const parsed = implementPrOutputSchema.parse({
      summary: "No actionable review comments on the PR.",
      items: [],
    });
    expect(parsed.items).toHaveLength(0);
  });

  it("rejects an unknown status", () => {
    expect(() =>
      implementPrOutputSchema.parse({
        summary: "s",
        items: [item({ status: "wontfix" })],
      }),
    ).toThrow();
  });

  it("rejects an item missing its status", () => {
    const { status: _status, ...noStatus } = item();
    expect(() =>
      implementPrOutputSchema.parse({ summary: "s", items: [noStatus] }),
    ).toThrow();
  });

  it("rejects an empty comment", () => {
    expect(() =>
      implementPrOutputSchema.parse({
        summary: "s",
        items: [item({ comment: "" })],
      }),
    ).toThrow();
  });

  it("rejects an empty action", () => {
    expect(() =>
      implementPrOutputSchema.parse({
        summary: "s",
        items: [item({ action: "" })],
      }),
    ).toThrow();
  });

  it("rejects an empty file when the key is present", () => {
    expect(() =>
      implementPrOutputSchema.parse({
        summary: "s",
        items: [item({ file: "" })],
      }),
    ).toThrow();
  });

  it("rejects a missing summary", () => {
    expect(() =>
      implementPrOutputSchema.parse({ items: [item()] }),
    ).toThrow();
  });

  it("rejects an empty summary", () => {
    expect(() =>
      implementPrOutputSchema.parse({ summary: "", items: [item()] }),
    ).toThrow();
  });
});
