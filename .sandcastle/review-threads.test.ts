import { describe, expect, it } from "vitest";
import { verifyUnresolvedThreadSet } from "./review-threads";

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
