import rootPackage from "../../../package.json" with { type: "json" };
import turboConfig from "../../../turbo.json" with { type: "json" };
import apiPackage from "../../../apps/api/package.json" with { type: "json" };
import webPackage from "../../../apps/web/package.json" with { type: "json" };
import sharedPackage from "../package.json" with { type: "json" };
import { describe, expect, it } from "vitest";

const productFilters = [
  "--filter=@unshelf/web",
  "--filter=@unshelf/api",
  "--filter=@unshelf/shared",
].join(" ");

describe("product lint commands", () => {
  it("exposes explicit read-only and opt-in fix commands for only product workspaces", () => {
    expect(rootPackage.scripts.lint).toBe(`turbo run lint ${productFilters}`);
    expect(rootPackage.scripts["lint:fix"]).toBe(
      `turbo run lint:fix ${productFilters}`,
    );
  });

  it.each([
    ["@unshelf/web", webPackage.scripts],
    ["@unshelf/api", apiPackage.scripts],
    ["@unshelf/shared", sharedPackage.scripts],
  ])(
    "keeps %s lint read-only and fixes explicitly opt-in",
    (_workspace, scripts) => {
      expect(scripts.lint).not.toContain("--fix");
      expect(scripts["lint:fix"]).toContain("--fix");
    },
  );
});

describe("product lint task graph", () => {
  it("builds dependencies and caches read-only lint against root policy inputs", () => {
    expect(turboConfig.tasks.lint.dependsOn).toEqual(["^build"]);
    expect(turboConfig.tasks.lint.inputs).toEqual(
      expect.arrayContaining([
        "$TURBO_DEFAULT$",
        "$TURBO_ROOT$/eslint.config.mjs",
        "$TURBO_ROOT$/tsconfig.base.json",
      ]),
    );
    expect(turboConfig.tasks.lint).not.toHaveProperty("outputs");
    expect(turboConfig.tasks.lint).not.toHaveProperty("cache");
  });

  it("builds dependencies and never caches opt-in fixes", () => {
    expect(turboConfig.tasks["lint:fix"].dependsOn).toEqual(["^build"]);
    expect(turboConfig.tasks["lint:fix"].cache).toBe(false);
  });
});
