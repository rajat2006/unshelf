import { describe, expect, it } from "vitest";
import {
  collectUnresolvedThreadIds,
  verifyUnresolvedThreadSet,
} from "./review-threads";

describe("review-thread pagination", () => {
  it("collects unresolved thread IDs across every page", async () => {
    const pages = [
      {
        nodes: [
          { id: "thread-a", isResolved: false },
          { id: "resolved", isResolved: true },
        ],
        pageInfo: { hasNextPage: true, endCursor: "page-2" },
      },
      {
        nodes: [{ id: "thread-b", isResolved: false }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ];

    await expect(
      collectUnresolvedThreadIds({
        loadPage: async () => pages.shift() ?? pages[0]!,
      }),
    ).resolves.toEqual(["thread-a", "thread-b"]);
  });

  it("fails closed when GitHub claims another page without a usable cursor", async () => {
    await expect(
      collectUnresolvedThreadIds({
        loadPage: async () => ({
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: null },
        }),
      }),
    ).rejects.toThrow("pagination cursor");
  });
});

describe("unresolved review-thread publication guard", () => {
  it("accepts the same set regardless of GitHub response order", () => {
    expect(
      verifyUnresolvedThreadSet({
        expected: ["thread-a", "thread-b"],
        current: ["thread-b", "thread-a"],
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    { expected: ["thread-a"], current: [] },
    { expected: ["thread-a"], current: ["thread-a", "thread-b"] },
  ])("fails closed when a concurrent change produces $current", (sets) => {
    expect(verifyUnresolvedThreadSet(sets)).toEqual({
      ok: false,
      error:
        "The unresolved review-thread set changed after agent inspection; refusing stale publication.",
    });
  });
});
