import { describe, expect, it } from "vitest";
import { architectureReviewOutputSchema } from "./architecture-review-output";

/** A minimal well-formed finding, spread-overridable per test. */
function finding(overrides: Record<string, unknown> = {}) {
  return {
    category: "drift",
    severity: "high",
    area: "apps/web/src/trail",
    title: "Trail module bypasses the geometry seam",
    detail:
      "ADR-0011 puts distance behind the geometry module, but the trail view " +
      "inlines haversine again — the decision has drifted.",
    ...overrides,
  };
}

describe("architectureReviewOutputSchema — the architecture-review <output> contract", () => {
  it("accepts a full, well-formed review", () => {
    const parsed = architectureReviewOutputSchema.parse({
      summary: "3 findings: 1 high drift, 2 deepening opportunities.",
      findings: [
        finding(),
        finding({ category: "deepening", severity: "medium" }),
        finding({ category: "duplication", severity: "low" }),
      ],
    });
    expect(parsed.findings).toHaveLength(3);
    expect(parsed.findings[0].category).toBe("drift");
  });

  it("accepts a clean sweep with zero findings", () => {
    const parsed = architectureReviewOutputSchema.parse({
      summary: "No architectural drift or deepening opportunities found.",
      findings: [],
    });
    expect(parsed.findings).toEqual([]);
  });

  it("accepts every category and severity", () => {
    for (const category of [
      "drift",
      "deepening",
      "duplication",
      "coupling",
      "other",
    ]) {
      for (const severity of ["high", "medium", "low"]) {
        expect(() =>
          architectureReviewOutputSchema.parse({
            summary: "s",
            findings: [finding({ category, severity })],
          }),
        ).not.toThrow();
      }
    }
  });

  it("rejects an unknown category", () => {
    expect(() =>
      architectureReviewOutputSchema.parse({
        summary: "s",
        findings: [finding({ category: "refactor" })],
      }),
    ).toThrow();
  });

  it("rejects an unknown severity", () => {
    expect(() =>
      architectureReviewOutputSchema.parse({
        summary: "s",
        findings: [finding({ severity: "blocking" })],
      }),
    ).toThrow();
  });

  it("rejects a missing summary", () => {
    expect(() =>
      architectureReviewOutputSchema.parse({ findings: [] }),
    ).toThrow();
  });

  it("rejects an empty summary", () => {
    expect(() =>
      architectureReviewOutputSchema.parse({ summary: "", findings: [] }),
    ).toThrow();
  });

  it("rejects a missing findings array", () => {
    expect(() =>
      architectureReviewOutputSchema.parse({ summary: "s" }),
    ).toThrow();
  });

  it("rejects a finding missing its category", () => {
    const { category: _category, ...noCategory } = finding();
    expect(() =>
      architectureReviewOutputSchema.parse({
        summary: "s",
        findings: [noCategory],
      }),
    ).toThrow();
  });

  it("rejects an empty area, title, or detail", () => {
    for (const key of ["area", "title", "detail"]) {
      expect(() =>
        architectureReviewOutputSchema.parse({
          summary: "s",
          findings: [finding({ [key]: "" })],
        }),
      ).toThrow();
    }
  });
});
