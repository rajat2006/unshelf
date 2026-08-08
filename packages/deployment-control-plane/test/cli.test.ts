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

  it("routes candidate commands through the public candidate seam", () => {
    const result = spawnSync(
      process.execPath,
      [cli.pathname, "prepare-candidate", "--channel", "preview"],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(parseJson(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "invalid-candidate-intent" },
    });
    expect(result.stderr).toBe("");
  });

  it("validates immutable image pairs without external adapters", () => {
    const apiImage = `ghcr.io/rajat2006/unshelf-api@sha256:${"a".repeat(64)}`;
    const webImage = `ghcr.io/rajat2006/unshelf-web@sha256:${"b".repeat(64)}`;

    const result = spawnSync(
      process.execPath,
      [
        cli.pathname,
        "validate-image-pair",
        "--api-image",
        apiImage,
        "--web-image",
        webImage,
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(parseJson(result.stdout)).toMatchObject({
      ok: true,
      apiImage,
      webImage,
      state: "verified",
    });
    expect(result.stderr).toBe("");
  });
});
