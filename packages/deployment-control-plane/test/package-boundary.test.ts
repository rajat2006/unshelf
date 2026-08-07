import { readFileSync } from "node:fs";
import sharedPackage from "../../shared/package.json" with { type: "json" };
import { describe, expect, it } from "vitest";

const sharedSource = ["index.ts", "validation.ts"]
  .map((file) =>
    readFileSync(new URL(`../../shared/src/${file}`, import.meta.url), "utf8"),
  )
  .join("\n");

describe("deployment package boundary", () => {
  it("keeps infrastructure concepts outside the shared product domain", () => {
    expect(sharedPackage.dependencies).not.toHaveProperty(
      "@unshelf/deployment-control-plane",
    );
    expect(sharedSource).not.toMatch(/dokploy|ghcr|deployment|control-plane/i);
  });
});
