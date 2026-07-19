import { describe, expect, it } from "vitest";
import { toIssuesOutputSchema } from "./to-issues-output";

/** A minimal well-formed child issue, spread-overridable per test. */
function child(overrides: Record<string, unknown> = {}) {
  return {
    title: "Foundation: .sandcastle/ scaffold + pure helper seam",
    body: "## Parent\n#52\n\n## What to build\n\nThe testable runner seam.",
    ...overrides,
  };
}

describe("toIssuesOutputSchema — the to-issues <output> contract", () => {
  it("accepts a well-formed decomposition", () => {
    const parsed = toIssuesOutputSchema.parse({
      summary: "Split the platform spec into 3 agent-sized tickets.",
      children: [child(), child({ title: "Provision agent:* labels" })],
    });
    expect(parsed.children).toHaveLength(2);
    expect(parsed.children[0].title).toContain("Foundation");
  });

  it("rejects an empty children array — a decomposition needs a child", () => {
    expect(() =>
      toIssuesOutputSchema.parse({ summary: "s", children: [] }),
    ).toThrow();
  });

  it("rejects a child with an empty title", () => {
    expect(() =>
      toIssuesOutputSchema.parse({
        summary: "s",
        children: [child({ title: "" })],
      }),
    ).toThrow();
  });

  it("rejects a child with an empty body — a ticket needs a description", () => {
    expect(() =>
      toIssuesOutputSchema.parse({
        summary: "s",
        children: [child({ body: "" })],
      }),
    ).toThrow();
  });

  it("rejects a child title over GitHub's 256-char limit", () => {
    expect(() =>
      toIssuesOutputSchema.parse({
        summary: "s",
        children: [child({ title: "x".repeat(257) })],
      }),
    ).toThrow();
  });

  it("rejects a missing summary", () => {
    expect(() =>
      toIssuesOutputSchema.parse({ children: [child()] }),
    ).toThrow();
  });
});
