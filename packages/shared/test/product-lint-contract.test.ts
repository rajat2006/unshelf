import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import rootPackage from "../../../package.json" with { type: "json" };
import turboConfig from "../../../turbo.json" with { type: "json" };
import apiPackage from "../../../apps/api/package.json" with { type: "json" };
import webPackage from "../../../apps/web/package.json" with { type: "json" };
import sharedPackage from "../package.json" with { type: "json" };
import { afterEach, describe, expect, it } from "vitest";

const productFilters = [
  "--filter=@unshelf/web",
  "--filter=@unshelf/api",
  "--filter=@unshelf/shared",
].join(" ");
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixFixture = fileURLToPath(
  new URL("product-lint-fix-fixture.ts", import.meta.url),
);
const fixableSource = `export function productLintFixFixture(): string {
  let value = "representative autofix";
  return value;
}
`;

function runRootScript(script: "lint" | "lint:fix") {
  return new Promise<{ output: string; status: number | null }>(
    (resolve, reject) => {
      const child = spawn("pnpm", [script], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          TURBO_TELEMETRY_DISABLED: "1",
        },
        timeout: 300_000,
      });
      let output = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        output += chunk;
      });
      child.on("error", reject);
      child.on("close", (status) => {
        resolve({ output, status });
      });
    },
  );
}

afterEach(() => {
  rmSync(fixFixture, { force: true });
});

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

describe("product lint behavior", () => {
  it("keeps validation read-only and cached while fixes mutate without caching", async () => {
    writeFileSync(fixFixture, fixableSource);

    const readOnly = await runRootScript("lint");

    expect(readOnly.status).not.toBe(0);
    expect(readFileSync(fixFixture, "utf8")).toBe(fixableSource);
    expect(readOnly.output).toContain(
      "Packages in scope: @unshelf/api, @unshelf/shared, @unshelf/web",
    );
    expect(readOnly.output).not.toContain("@unshelf/sandcastle");
    expect(readOnly.output.indexOf("@unshelf/shared:build")).toBeLessThan(
      readOnly.output.indexOf("@unshelf/shared:lint"),
    );

    const fixed = await runRootScript("lint:fix");

    expect(fixed.status).toBe(0);
    expect(readFileSync(fixFixture, "utf8")).toContain(
      'const value = "representative autofix";',
    );
    expect(fixed.output.match(/cache bypass, force executing/g)).toHaveLength(
      3,
    );

    expect((await runRootScript("lint")).status).toBe(0);
    const cached = await runRootScript("lint");

    expect(cached.status).toBe(0);
    expect(cached.output).toMatch(
      /@unshelf\/shared:lint[\s\S]*cache hit, replaying logs/,
    );
  }, 300_000);
});
