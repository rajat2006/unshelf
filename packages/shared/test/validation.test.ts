import { describe, expect, it } from "vitest";
import {
  addDailyFocusItemRequestSchema,
  addStageItemRequestSchema,
  connectLearningPlanNodesRequestSchema,
  createItemRequestSchema,
  createPartsRequestSchema,
  createLabelRequestSchema,
  createLearningPlanRequestSchema,
  createStageRequestSchema,
  prepareFollowRequestSchema,
  itemIdSchema,
  labelIdSchema,
  learningPlanIdSchema,
  partIdSchema,
  reorderPartsRequestSchema,
  stageIdSchema,
  updateItemStatusRequestSchema,
  updateItemTargetDateRequestSchema,
  userIdSchema,
} from "@unshelf/shared/validation";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("named record request schemas", () => {
  it.each([
    ["Label", createLabelRequestSchema],
    ["Stage", createStageRequestSchema],
    ["Learning Plan", createLearningPlanRequestSchema],
  ])("normalizes a %s name at the contract boundary", (_record, schema) => {
    expect(schema.parse({ name: "  Learn   CSS  " })).toEqual({
      name: "Learn   CSS",
    });
  });

  it.each([
    ["Label", createLabelRequestSchema],
    ["Stage", createStageRequestSchema],
    ["Learning Plan", createLearningPlanRequestSchema],
  ])("rejects a blank %s name", (_record, schema) => {
    expect(schema.safeParse({ name: " \t " }).success).toBe(false);
  });

  it.each([
    ["Label", createLabelRequestSchema],
    ["Stage", createStageRequestSchema],
    ["Learning Plan", createLearningPlanRequestSchema],
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

describe("Part request schemas", () => {
  it("normalizes a batch and ignores blank lines", () => {
    expect(
      createPartsRequestSchema.parse({ titles: ["  One  ", " ", "Two"] }),
    ).toEqual({ titles: ["One", "Two"] });
  });

  it("requires at least one nonblank Part title", () => {
    expect(
      createPartsRequestSchema.safeParse({ titles: [" ", "\t"] }).success,
    ).toBe(false);
  });

  it("rejects repeated Part identities in a submitted order", () => {
    expect(
      reorderPartsRequestSchema.safeParse({ partIds: [uuid, uuid] }).success,
    ).toBe(false);
  });
});

describe("identifier schemas", () => {
  it.each([
    ["User", userIdSchema],
    ["Item", itemIdSchema],
    ["Part", partIdSchema],
    ["Stage", stageIdSchema],
    ["Learning Plan", learningPlanIdSchema],
    ["Label", labelIdSchema],
  ])("returns a validated %s identifier", (_identifier, schema) => {
    expect(schema.parse(uuid)).toBe(uuid);
    expect(schema.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("identifier-bearing request schemas", () => {
  it("validates optional Learning Plan and Stage origin for a Daily Focus Item", () => {
    const stageId = "123e4567-e89b-42d3-a456-426614174001";
    expect(
      addDailyFocusItemRequestSchema.parse({
        itemId: uuid,
        origin: { learningPlanId: uuid, stageId },
      }),
    ).toEqual({
      itemId: uuid,
      origin: { learningPlanId: uuid, stageId },
    });
    expect(
      addDailyFocusItemRequestSchema.safeParse({
        itemId: uuid,
        origin: { learningPlanId: uuid, stageId: "not-a-uuid" },
      }).success,
    ).toBe(false);
  });

  it("returns a validated Item before it can be added to a Stage", () => {
    expect(addStageItemRequestSchema.parse({ itemId: uuid })).toEqual({
      itemId: uuid,
    });
  });

  it("rejects a malformed Item before adding it to a Stage", () => {
    expect(
      addStageItemRequestSchema.safeParse({ itemId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects undeclared add-to-Stage fields", () => {
    expect(
      addStageItemRequestSchema.safeParse({ itemId: uuid, position: 1 })
        .success,
    ).toBe(false);
  });

  it("returns both validated ends of a Learning Plan edge", () => {
    const toNodeId = "123e4567-e89b-42d3-a456-426614174001";
    expect(
      connectLearningPlanNodesRequestSchema.parse({
        fromNodeId: uuid,
        toNodeId,
      }),
    ).toEqual({ fromNodeId: uuid, toNodeId });
  });

  it("rejects a malformed Learning Plan edge end", () => {
    expect(
      connectLearningPlanNodesRequestSchema.safeParse({
        fromNodeId: uuid,
        toNodeId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("rejects undeclared Learning Plan edge fields", () => {
    const toNodeId = "123e4567-e89b-42d3-a456-426614174001";
    expect(
      connectLearningPlanNodesRequestSchema.safeParse({
        fromNodeId: uuid,
        toNodeId,
        position: 1,
      }).success,
    ).toBe(false);
  });
});

describe("Follow preview request schema", () => {
  it("accepts only the first-slice public YouTube channel target", () => {
    expect(
      prepareFollowRequestSchema.parse({
        provider: "youtube",
        target: {
          kind: "channel",
          url: "https://www.youtube.com/@unshelf",
        },
      }),
    ).toEqual({
      provider: "youtube",
      target: {
        kind: "channel",
        url: "https://www.youtube.com/@unshelf",
      },
    });
  });

  it.each([
    {
      provider: "rss",
      target: { kind: "channel", url: "https://example.com" },
    },
    {
      provider: "youtube",
      target: { kind: "playlist", url: "https://youtube.com/playlist?list=x" },
    },
    { provider: "youtube", target: { kind: "channel", url: "not a url" } },
    {
      provider: "youtube",
      target: { kind: "channel", url: "https://youtube.com/@x" },
      apiKey: "secret",
    },
  ])("rejects unsupported or undeclared setup input", (input) => {
    expect(prepareFollowRequestSchema.safeParse(input).success).toBe(false);
  });
});
