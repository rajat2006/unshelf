import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import rootPackage from "../../../package.json" with { type: "json" };
import turboConfig from "../../../turbo.json" with { type: "json" };
import apiPackage from "../../../apps/api/package.json" with { type: "json" };
import webPackage from "../../../apps/web/package.json" with { type: "json" };
import repositoryPolicyPackage from "../../repository-policy/package.json" with { type: "json" };
import dailyProjectDigestPackage from "../../daily-project-digest/package.json" with { type: "json" };
import sharedPackage from "../package.json" with { type: "json" };
import { afterEach, describe, expect, it } from "vitest";

const productFilters = [
  "--filter=@unshelf/web",
  "--filter=@unshelf/api",
  "--filter=@unshelf/shared",
  "--filter=@unshelf/repository-policy",
  "--filter=@unshelf/daily-project-digest",
].join(" ");
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const ciWorkflow = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

const fixFixture = fixturePath("product-lint-fix-fixture.ts");
const ciViolationFixture = fixturePath("product-ci-lint-violation.ts");
const webRuleFixture = fixturePath(
  "../../../apps/web/src/product-lint-rule-fixture.tsx",
);
const apiTestBoundaryFixture = fixturePath(
  "../../../apps/api/test/product-lint-boundary-fixture.test.ts",
);
const apiSourceBoundaryFixture = fixturePath(
  "../../../apps/api/src/product-lint-boundary-fixture.ts",
);
const sandcastleIgnoredFixture = fixturePath(
  "../../../.sandcastle/product-lint-ignored-fixture.ts",
);
const generatedIgnoredFixture = fixturePath(
  "../../../apps/api/drizzle/product-lint-ignored-fixture.ts",
);
const disposableFixtures = [
  fixFixture,
  ciViolationFixture,
  webRuleFixture,
  apiTestBoundaryFixture,
  apiSourceBoundaryFixture,
  sandcastleIgnoredFixture,
  generatedIgnoredFixture,
];
const fixableSource = `export function productLintFixFixture(): string {
  let value = "representative autofix";
  return value;
}
`;
const lintViolationSource = `Promise.resolve("representative lint violation");
`;
const webRuleViolationSource = `import { useEffect } from "react";

export function ProductLintRuleFixture({ value }: { value: string }) {
  useEffect(() => {
    document.title = value;
  }, []);
  return null;
}
`;
const unsafeSupertestBoundarySource = `import type { Response } from "supertest";

export function productLintResponseMessage(response: Response) {
  return response.body.message;
}
`;

function runPnpm(args: string[]) {
  return new Promise<{ output: string; status: number | null }>(
    (resolve, reject) => {
      const child = spawn("pnpm", args, {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          UNSHELF_PRODUCT_CI_CHILD: "1",
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

function runRootScript(script: "ci:product" | "lint" | "lint:fix") {
  return runPnpm([script]);
}

function runEslint(files: string[]) {
  return runPnpm(["exec", "eslint", ...files]);
}

afterEach(() => {
  for (const fixture of disposableFixtures) {
    rmSync(fixture, { force: true });
  }
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
    ["@unshelf/repository-policy", repositoryPolicyPackage.scripts],
    ["@unshelf/daily-project-digest", dailyProjectDigestPackage.scripts],
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
  it("enforces the essential React Hooks rule boundary", async () => {
    writeFileSync(webRuleFixture, webRuleViolationSource);

    const result = await runEslint([webRuleFixture]);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("react-hooks/exhaustive-deps");
  }, 60_000);

  it("accepts Supertest response bodies only at the API test boundary", async () => {
    writeFileSync(apiTestBoundaryFixture, unsafeSupertestBoundarySource);
    writeFileSync(apiSourceBoundaryFixture, unsafeSupertestBoundarySource);

    const accepted = await runEslint([apiTestBoundaryFixture]);
    const rejected = await runEslint([apiSourceBoundaryFixture]);

    expect(accepted.status).toBe(0);
    expect(rejected.status).not.toBe(0);
    expect(rejected.output).toContain(
      "@typescript-eslint/no-unsafe-member-access",
    );
    expect(rejected.output).toContain("@typescript-eslint/no-unsafe-return");
  }, 60_000);

  it("explicitly ignores Sandcastle and generated migrations", async () => {
    writeFileSync(sandcastleIgnoredFixture, lintViolationSource);
    writeFileSync(generatedIgnoredFixture, lintViolationSource);

    const result = await runEslint([
      sandcastleIgnoredFixture,
      generatedIgnoredFixture,
    ]);

    expect(result.status).toBe(0);
    expect(result.output.match(/matching ignore pattern/g)).toHaveLength(2);
  }, 60_000);

  it("keeps validation read-only and cached while fixes mutate without caching", async () => {
    writeFileSync(fixFixture, fixableSource);

    const readOnly = await runRootScript("lint");

    expect(readOnly.status).not.toBe(0);
    expect(readFileSync(fixFixture, "utf8")).toBe(fixableSource);
    expect(readOnly.output).toContain(
      "Packages in scope: @unshelf/api, @unshelf/daily-project-digest, @unshelf/repository-policy, @unshelf/shared, @unshelf/web",
    );
    expect(readOnly.output).not.toContain("@unshelf/sandcastle");
    const sharedBuildPosition = readOnly.output.indexOf(
      "@unshelf/shared:build",
    );
    expect(sharedBuildPosition).toBeGreaterThan(-1);
    expect(readOnly.output.indexOf("@unshelf/api:lint")).toBeGreaterThan(
      sharedBuildPosition,
    );
    expect(readOnly.output.indexOf("@unshelf/web:lint")).toBeGreaterThan(
      sharedBuildPosition,
    );

    const fixed = await runRootScript("lint:fix");

    expect(fixed.status).toBe(0);
    expect(readFileSync(fixFixture, "utf8")).toContain(
      'const value = "representative autofix";',
    );
    expect(fixed.output.match(/cache bypass, force executing/g)).toHaveLength(
      5,
    );

    expect((await runRootScript("lint")).status).toBe(0);
    const cached = await runRootScript("lint");

    expect(cached.status).toBe(0);
    expect(cached.output).toMatch(
      /@unshelf\/shared:lint[\s\S]*cache hit, replaying logs/,
    );
  }, 300_000);
});

describe("product CI behavior", () => {
  it("keeps the Product workflow aligned with the read-only root phase order", () => {
    expect(rootPackage.scripts["ci:product:lint"]).toBe("pnpm run lint");
    expect(rootPackage.scripts["ci:product"]).toBe(
      [
        "pnpm run ci:product:build",
        "pnpm run ci:product:typecheck",
        "pnpm run ci:product:lint",
        "pnpm run ci:product:test",
      ].join(" && "),
    );

    const buildPosition = ciWorkflow.indexOf("run: pnpm run ci:product:build");
    const typecheckPosition = ciWorkflow.indexOf(
      "run: pnpm run ci:product:typecheck",
    );
    const lintPosition = ciWorkflow.indexOf("run: pnpm run ci:product:lint");
    const testPosition = ciWorkflow.indexOf("run: pnpm run ci:product:test");

    expect(ciWorkflow).toContain("name: Product");
    expect(ciWorkflow).toContain("- name: Lint");
    expect(buildPosition).toBeGreaterThan(-1);
    expect(typecheckPosition).toBeGreaterThan(buildPosition);
    expect(lintPosition).toBeGreaterThan(typecheckPosition);
    expect(testPosition).toBeGreaterThan(lintPosition);
    expect(ciWorkflow).not.toContain("lint:fix");
  });

  it("stops after a lint violation without running product tests", async () => {
    if (process.env.UNSHELF_PRODUCT_CI_CHILD === "1") {
      return;
    }

    writeFileSync(ciViolationFixture, lintViolationSource);

    const result = await runRootScript("ci:product");

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("product-ci-lint-violation.ts");
    expect(result.output).toContain("@typescript-eslint/no-floating-promises");
    expect(result.output).not.toContain("turbo run test:product");
  }, 300_000);
});
