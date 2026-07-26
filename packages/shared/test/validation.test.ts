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
} from "@unshelf/shared/validation";

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
    },
  );

  it.each([
    ["Label", createLabelRequestSchema],
    ["Stop", createStopRequestSchema],
    ["Trail", createTrailRequestSchema],
  ])("rejects a blank %s name", (_record, schema) => {
    expect(schema.safeParse({ name: " \t " }).success).toBe(false);
  });

  it.each([
    ["Label", createLabelRequestSchema],
    ["Stop", createStopRequestSchema],
    ["Trail", createTrailRequestSchema],
  ])("rejects undeclared %s fields", (_record, schema) => {
    expect(schema.safeParse({ name: "CSS", typo: true }).success).toBe(false);
  });
});

describe("Item capture request schema", () => {
  it("normalizes only the title's outer whitespace", () => {
    expect(
      createItemRequestSchema.parse({
        title: "  Zod   guide  ",
        type: "article",
      }),
    ).toEqual({
      title: "Zod   guide",
      type: "article",
    });
  });

  it.each([
    ["surrounding whitespace", "  not a URL  "],
    ["a blank string", ""],
    ["null", null],
  ])("preserves Source when it contains %s", (_case, source) => {
    expect(
      createItemRequestSchema.parse({
        title: "Source keeper",
        type: "other",
        source,
      }).source,
    ).toBe(source);
  });

  it("rejects a blank-after-trim title", () => {
    expect(
      createItemRequestSchema.safeParse({ title: " \t ", type: "article" })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown Type", () => {
    expect(
      createItemRequestSchema.safeParse({
        title: "Guide",
        type: "essay",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-string Source", () => {
    expect(
      createItemRequestSchema.safeParse({
        title: "Guide",
        type: "article",
        source: 42,
      }).success,
    ).toBe(false);
  });

  it("rejects undeclared capture fields", () => {
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
  it("accepts the existing Status vocabulary", () => {
    expect(
      updateItemStatusRequestSchema.parse({ status: "in_progress" }),
    ).toEqual({ status: "in_progress" });
  });

  it("rejects a value outside the Status vocabulary", () => {
    expect(
      updateItemStatusRequestSchema.safeParse({ status: "almost_done" })
        .success,
    ).toBe(false);
  });

  it("rejects undeclared Status update fields", () => {
    expect(
      updateItemStatusRequestSchema.safeParse({
        status: "done",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("accepts a real calendar Target date", () => {
    expect(
      updateItemTargetDateRequestSchema.parse({ targetDate: "2024-02-29" }),
    ).toEqual({ targetDate: "2024-02-29" });
  });

  it("accepts null to clear the Target date", () => {
    expect(
      updateItemTargetDateRequestSchema.parse({ targetDate: null }),
    ).toEqual({ targetDate: null });
  });

  it.each(["2026-02-30", "2026-2-03", "0000-01-01", "tomorrow"])(
    "rejects invalid Target date %s",
    (targetDate) => {
      expect(
        updateItemTargetDateRequestSchema.safeParse({ targetDate }).success,
      ).toBe(false);
    },
  );

  it("rejects a missing Target date", () => {
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
  it("returns a validated Item before it can be added to a Stop", () => {
    expect(addStopItemRequestSchema.parse({ itemId: uuid })).toEqual({
      itemId: uuid,
    });
  });

  it("rejects a malformed Item before adding it to a Stop", () => {
    expect(
      addStopItemRequestSchema.safeParse({ itemId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects undeclared add-to-Stop fields", () => {
    expect(
      addStopItemRequestSchema.safeParse({ itemId: uuid, position: 1 }).success,
    ).toBe(false);
  });

  it("returns both validated ends of a Trail edge", () => {
    const toStopId = "123e4567-e89b-42d3-a456-426614174001";
    expect(
      connectStopsRequestSchema.parse({ fromStopId: uuid, toStopId }),
    ).toEqual({ fromStopId: uuid, toStopId });
  });

  it("rejects a malformed Trail edge end", () => {
    expect(
      connectStopsRequestSchema.safeParse({
        fromStopId: uuid,
        toStopId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects undeclared Trail edge fields", () => {
    const toStopId = "123e4567-e89b-42d3-a456-426614174001";
    expect(
      connectStopsRequestSchema.safeParse({
        fromStopId: uuid,
        toStopId,
        position: 1,
      }).success,
    ).toBe(false);
  });
});
