import { describe, expect, it } from "vitest";
import { architectureReviewOutputSchema } from "./architecture-review-output";

/** A well-formed `proposed` output, spread-overridable per test. */
function proposed(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "proposed",
    summary: "Proposed deepening the trail-geometry seam.",
    prdTitle: "Deepen the trail-geometry module behind a distance interface",
    prdBody:
      "## Problem\nHaversine is inlined in three views.\n\n## Solution\n" +
      "Put distance behind the geometry module.\n\n## Acceptance criteria\n- [ ] ...",
    ...overrides,
  };
}

/** A well-formed `skipped` output, spread-overridable per test. */
function skipped(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "skipped",
    summary: "No fresh deepening opportunity this run.",
    reason: "The only candidate is already open as proposal #123.",
    ...overrides,
  };
}

describe("architectureReviewOutputSchema — the architecture-review <output> contract", () => {
  it("accepts a well-formed proposed outcome", () => {
    const parsed = architectureReviewOutputSchema.parse(proposed());
    expect(parsed.outcome).toBe("proposed");
    expect(parsed.prdTitle).toBeTruthy();
  });

  it("accepts a well-formed skipped outcome", () => {
    const parsed = architectureReviewOutputSchema.parse(skipped());
    expect(parsed.outcome).toBe("skipped");
    expect(parsed.reason).toBeTruthy();
  });

  it("rejects an unknown outcome", () => {
    expect(() =>
      architectureReviewOutputSchema.parse(proposed({ outcome: "deferred" })),
    ).toThrow();
  });

  it("rejects a proposed outcome missing its PRD title", () => {
    const { prdTitle: _t, ...noTitle } = proposed();
    expect(() => architectureReviewOutputSchema.parse(noTitle)).toThrow();
  });

  it("rejects a proposed outcome missing its PRD body", () => {
    const { prdBody: _b, ...noBody } = proposed();
    expect(() => architectureReviewOutputSchema.parse(noBody)).toThrow();
  });

  it("rejects a PRD title over GitHub's 256-char limit", () => {
    expect(() =>
      architectureReviewOutputSchema.parse(
        proposed({ prdTitle: "x".repeat(257) }),
      ),
    ).toThrow();
  });

  it("rejects a skipped outcome missing its reason", () => {
    const { reason: _r, ...noReason } = skipped();
    expect(() => architectureReviewOutputSchema.parse(noReason)).toThrow();
  });

  it("rejects a skipped outcome that smuggles a PRD", () => {
    expect(() =>
      architectureReviewOutputSchema.parse(
        skipped({ prdTitle: "x", prdBody: "y" }),
      ),
    ).toThrow();
  });

  it("rejects a missing summary", () => {
    const { summary: _s, ...noSummary } = proposed();
    expect(() => architectureReviewOutputSchema.parse(noSummary)).toThrow();
  });

  it("rejects an empty summary", () => {
    expect(() =>
      architectureReviewOutputSchema.parse(proposed({ summary: "" })),
    ).toThrow();
  });
});
