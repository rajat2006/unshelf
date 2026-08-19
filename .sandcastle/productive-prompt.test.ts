import * as path from "node:path";
import * as fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadProductivePrompt } from "./productive-prompt";

const capabilityPrompts = [
  ["implement", { ISSUE_NUMBER: "481", ISSUE_TITLE: "Self heal", BRANCH: "agent/issue-481", BASE_BRANCH: "dev" }],
  ["implement-prd", { PRD_NUMBER: "468", PRD_TITLE: "Self heal", SUB_ISSUE_NUMBER: "481", SUB_ISSUE_TITLE: "Implement", BRANCH: "agent/prd-468", BASE_BRANCH: "dev" }],
  ["review", { ISSUE_NUMBER: "481", ISSUE_TITLE: "Self heal", BRANCH: "agent/issue-481", BASE_BRANCH: "dev" }],
  ["implement-pr", { ISSUE_NUMBER: "481", ISSUE_TITLE: "Self heal", PR_NUMBER: "500", BRANCH: "agent/issue-481", BASE_BRANCH: "dev" }],
] as const;

describe("productive prompt contract", () => {
  it.each(capabilityPrompts)("includes the shared Product CI contract once in %s", (directory, promptArgs) => {
    const prompt = loadProductivePrompt({
      promptFile: path.join(import.meta.dirname, directory, "prompt.md"),
      promptArgs,
    });

    expect(prompt.match(/## Product CI recovery contract/g)).toHaveLength(1);
    expect(prompt).toContain("at most two recovery actions");
    expect(prompt).toContain("exact live pull-request head and base");
    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("places recovery before Review re-review and Implement-PR feedback regeneration", () => {
    const review = loadProductivePrompt({
      promptFile: path.join(import.meta.dirname, "review", "prompt.md"),
      promptArgs: capabilityPrompts[2][1],
    });
    const implementPr = loadProductivePrompt({
      promptFile: path.join(import.meta.dirname, "implement-pr", "prompt.md"),
      promptArgs: capabilityPrompts[3][1],
    });

    expect(review.indexOf("Product CI recovery contract")).toBeLessThan(
      review.indexOf("Re-review the green head"),
    );
    expect(implementPr.indexOf("Product CI recovery contract")).toBeLessThan(
      implementPr.indexOf("Re-check the green head"),
    );
  });

  it("keeps Product CI recovery out of extraction and metadata prompts", () => {
    for (const file of [
      "review/extraction.md",
      "implement-pr/extraction.md",
      "implement-prd/extraction.md",
      "write-pr/prompt.md",
      "write-prd-pr/prompt.md",
    ]) {
      expect(
        fs.readFileSync(path.join(import.meta.dirname, file), "utf8"),
        file,
      ).not.toContain("Product CI recovery contract");
    }
  });
});
