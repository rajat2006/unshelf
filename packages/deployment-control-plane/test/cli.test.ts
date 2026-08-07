import { spawnSync } from "node:child_process";
import rootPackage from "../../../package.json" with { type: "json" };
import { parseJson } from "./harness.js";
import { describe, expect, it } from "vitest";

const cli = new URL("../dist/cli.js", import.meta.url);

describe("deployment executable", () => {
  it("drives the public CLI interface with structured output", () => {
    const result = spawnSync(
      process.execPath,
      [cli.pathname, "reconcile", "--channel", "development"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(parseJson(result.stdout)).toEqual({
      ok: false,
      error: {
        code: "invalid-intent",
        message: "Deployment intent is invalid.",
      },
    });
    expect(result.stderr).toBe("");
  });

  it("is driven by one thin repository command", () => {
    expect(rootPackage.scripts["deployment:control"]).toBe(
      "pnpm --filter @unshelf/deployment-control-plane cli",
    );
  });
});
