import { describe, expect, it } from "vitest";
import {
  addStopItemRequestSchema,
  connectStopsRequestSchema,
  createItemRequestSchema,
  createLabelRequestSchema,
  createStopRequestSchema,
  createTrailRequestSchema,
  itemIdSchema,
  labelIdSchema,
  stopIdSchema,
  trailIdSchema,
  updateItemStatusRequestSchema,
  updateItemTargetDateRequestSchema,
  userIdSchema,
} from "../src/validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("named record request schemas", () => {
  it.each([
    ["Label", createLabelRequestSchema],
    ["Stop", createStopRequestSchema],
    ["Trail", createTrailRequestSchema],
  ])(
    "normalizes a %s name at the contract boundary",
    (_record, schema) => {
      expect(schema.parse({ name: "  Learn   CSS  " })).toEqual({
        name: "Learn   CSS",
      });
      expect(schema.safeParse({ name: " \t " }).success).toBe(false);
      expect(schema.safeParse({ name: "CSS", typo: true }).success).toBe(false);
    },
  );
});

describe("Item capture request schema", () => {
  it("normalizes the title while preserving Source byte-for-byte", () => {
    expect(
      createItemRequestSchema.parse({
        title: "  Zod   guide  ",
        type: "article",
        source: "  not a URL  ",
      }),
    ).toEqual({
      title: "Zod   guide",
      type: "article",
      source: "  not a URL  ",
    });
    expect(
      createItemRequestSchema.parse({
        title: "Offline notes",
        type: "other",
        source: "",
      }).source,
    ).toBe("");
    expect(
      createItemRequestSchema.parse({
        title: "Offline book",
        type: "book",
        source: null,
      }).source,
    ).toBeNull();
  });

  it("rejects invalid Item fields and undeclared fields", () => {
    expect(
      createItemRequestSchema.safeParse({ title: " \t ", type: "article" })
        .success,
    ).toBe(false);
    expect(
      createItemRequestSchema.safeParse({
        title: "Guide",
        type: "essay",
      }).success,
    ).toBe(false);
    expect(
      createItemRequestSchema.safeParse({
        title: "Guide",
        type: "article",
        source: 42,
      }).success,
    ).toBe(false);
    expect(
      createItemRequestSchema.safeParse({
        title: "Guide",
        type: "article",
        status: "done",
      }).success,
    ).toBe(false);
  });
});

describe("Item update request schemas", () => {
  it("accepts only the existing Status vocabulary", () => {
    expect(
      updateItemStatusRequestSchema.parse({ status: "in_progress" }),
    ).toEqual({ status: "in_progress" });
    expect(
      updateItemStatusRequestSchema.safeParse({ status: "almost_done" })
        .success,
    ).toBe(false);
    expect(
      updateItemStatusRequestSchema.safeParse({
        status: "done",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("accepts real calendar Target dates and null", () => {
    expect(
      updateItemTargetDateRequestSchema.parse({ targetDate: "2024-02-29" }),
    ).toEqual({ targetDate: "2024-02-29" });
    expect(
      updateItemTargetDateRequestSchema.parse({ targetDate: null }),
    ).toEqual({ targetDate: null });

    for (const targetDate of [
      "2026-02-30",
      "2026-2-03",
      "0000-01-01",
      "tomorrow",
    ]) {
      expect(
        updateItemTargetDateRequestSchema.safeParse({ targetDate }).success,
      ).toBe(false);
    }
    expect(updateItemTargetDateRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("identifier schemas", () => {
  it.each([
    ["User", userIdSchema],
    ["Item", itemIdSchema],
    ["Stop", stopIdSchema],
    ["Trail", trailIdSchema],
    ["Label", labelIdSchema],
  ])("returns a validated %s identifier", (_identifier, schema) => {
    expect(schema.parse(uuid)).toBe(uuid);
    expect(schema.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("identifier-bearing request schemas", () => {
  it("validates an Item before it can be added to a Stop", () => {
    expect(addStopItemRequestSchema.parse({ itemId: uuid })).toEqual({
      itemId: uuid,
    });
    expect(
      addStopItemRequestSchema.safeParse({ itemId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(
      addStopItemRequestSchema.safeParse({ itemId: uuid, position: 1 }).success,
    ).toBe(false);
  });

  it("validates both ends of a Trail edge", () => {
    const toStopId = "123e4567-e89b-42d3-a456-426614174001";
    expect(
      connectStopsRequestSchema.parse({ fromStopId: uuid, toStopId }),
    ).toEqual({ fromStopId: uuid, toStopId });
    expect(
      connectStopsRequestSchema.safeParse({
        fromStopId: uuid,
        toStopId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      connectStopsRequestSchema.safeParse({
        fromStopId: uuid,
        toStopId,
        position: 1,
      }).success,
    ).toBe(false);
  });
});
