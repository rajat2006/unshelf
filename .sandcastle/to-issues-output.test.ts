import { describe, expect, it } from "vitest";
import {
  renderChildIssueBody,
  toIssuesOutputSchema,
} from "./to-issues-output";

/** A minimal well-formed child issue, spread-overridable per test. */
function child(overrides: Record<string, unknown> = {}) {
  return {
    title: "Foundation: .sandcastle/ scaffold + pure helper seam",
    whatToBuild: "Stand up the testable runner seam under .sandcastle/.",
    acceptanceCriteria: ["turbo run test covers the seam", "helpers are pure"],
    ...overrides,
  };
}

describe("toIssuesOutputSchema — the to-issues <output> contract", () => {
  it("accepts a well-formed structured decomposition", () => {
    const parsed = toIssuesOutputSchema.parse({
      summary: "Split the platform spec into 2 agent-sized tickets.",
      children: [
        child(),
        child({ title: "Provision agent:* labels", blockedBy: ["Foundation"] }),
      ],
    });
    expect(parsed.children).toHaveLength(2);
    expect(parsed.children[1].blockedBy).toEqual(["Foundation"]);
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

  it("rejects a child with empty whatToBuild", () => {
    expect(() =>
      toIssuesOutputSchema.parse({
        summary: "s",
        children: [child({ whatToBuild: "" })],
      }),
    ).toThrow();
  });

  it("rejects a child with zero acceptance criteria", () => {
    expect(() =>
      toIssuesOutputSchema.parse({
        summary: "s",
        children: [child({ acceptanceCriteria: [] })],
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

describe("renderChildIssueBody — deterministic body rendering", () => {
  it("renders the parent reference, prose, and a checkbox list", () => {
    const body = renderChildIssueBody(child(), 52);
    expect(body).toContain("## Parent\n\n#52");
    expect(body).toContain("## What to build\n\nStand up the testable runner");
    expect(body).toContain("## Acceptance criteria");
    expect(body).toContain("- [ ] turbo run test covers the seam");
    expect(body).toContain("- [ ] helpers are pure");
    expect(body.endsWith("\n")).toBe(true);
  });

  it("omits the Blocked by section when there are no dependencies", () => {
    expect(renderChildIssueBody(child(), 52)).not.toContain("## Blocked by");
  });

  it("renders a Blocked by list when dependencies are present", () => {
    const body = renderChildIssueBody(
      child({ blockedBy: ["Foundation seam", "Label taxonomy"] }),
      52,
    );
    expect(body).toContain("## Blocked by\n\n- Foundation seam\n- Label taxonomy");
  });

  it("accepts a string parent number", () => {
    expect(renderChildIssueBody(child(), "69")).toContain("#69");
  });
});
