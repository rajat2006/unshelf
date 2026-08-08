import { runDeploymentCli } from "../src/index.js";
import {
  createFakeDeploymentAdapters,
  parseJson,
  validIntentArgs,
} from "./harness.js";
import { describe, expect, it } from "vitest";

describe("deployment control-plane CLI", () => {
  it("rejects malformed intent before any external mutation", async () => {
    const mutations: string[] = [];
    const output: string[] = [];

    const exitCode = await runDeploymentCli({
      args: ["reconcile", "--channel", "development"],
      adapters: createFakeDeploymentAdapters(mutations),
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(mutations).toEqual([]);
    expect(output.map(parseJson)).toEqual([
      {
        ok: false,
        error: {
          code: "invalid-intent",
          message: "Deployment intent is invalid.",
        },
      },
    ]);
  });

  it("reconciles validated intent through replaceable adapters", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const sourceSha = "a".repeat(40);

    const exitCode = await runDeploymentCli({
      args: [
        "reconcile",
        "--channel",
        "development",
        "--source-sha",
        sourceSha,
        "--api-image",
        `ghcr.io/rajat2006/unshelf-api@sha256:${"b".repeat(64)}`,
        "--web-image",
        `ghcr.io/rajat2006/unshelf-web@sha256:${"c".repeat(64)}`,
        "--public-origin",
        "https://dev-123.dokploy.example",
        "--correlation",
        `development:${sourceSha}:run-42`,
      ],
      adapters: createFakeDeploymentAdapters(mutations),
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(mutations).toEqual([
      "github",
      "ghcr",
      "dokploy:inspect",
      "dokploy:converge",
      "dokploy:start",
      "dokploy:inspect",
      "health-check",
      "ghcr:advance-channel",
    ]);
    expect(output.map(parseJson)).toEqual([
      {
        ok: true,
        channel: "development",
        sourceSha,
        apiDigest: `sha256:${"b".repeat(64)}`,
        webDigest: `sha256:${"c".repeat(64)}`,
        deploymentId: "deployment-1",
        state: "healthy",
        durationMs: 250,
      },
    ]);
  });

  it("rejects a malformed source SHA before external work", async () => {
    const mutations: string[] = [];
    const output: string[] = [];

    const exitCode = await runDeploymentCli({
      args: [
        "reconcile",
        "--channel",
        "development",
        "--source-sha",
        "not-a-full-source-sha",
        "--api-image",
        `ghcr.io/rajat2006/unshelf-api@sha256:${"b".repeat(64)}`,
        "--web-image",
        `ghcr.io/rajat2006/unshelf-web@sha256:${"c".repeat(64)}`,
        "--public-origin",
        "https://dev-123.dokploy.example",
        "--correlation",
        `development:${"a".repeat(40)}:run-42`,
      ],
      adapters: createFakeDeploymentAdapters(mutations),
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(mutations).toEqual([]);
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      ok: false,
      error: { code: "invalid-intent" },
    });
  });

  it.each([
    {
      name: "a moving API tag",
      overrides: { apiImage: "ghcr.io/rajat2006/unshelf-api:development" },
    },
    {
      name: "an API digest from the web repository",
      overrides: {
        apiImage: `ghcr.io/rajat2006/unshelf-web@sha256:${"b".repeat(64)}`,
      },
    },
    {
      name: "a non-HTTPS public origin",
      overrides: { publicOrigin: "http://dev-123.dokploy.example" },
    },
    {
      name: "a public origin containing a path",
      overrides: { publicOrigin: "https://dev-123.dokploy.example/app" },
    },
    {
      name: "a non-canonical production origin",
      overrides: {
        channel: "production",
        publicOrigin: "https://prod.dokploy.example",
      },
    },
    {
      name: "the production origin on a non-production channel",
      overrides: { publicOrigin: "https://unshelf.tech" },
    },
    {
      name: "an unsafe correlation value",
      overrides: { correlation: "development/run 42" },
    },
  ])("rejects intent containing $name", async ({ overrides }) => {
    const mutations: string[] = [];

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(overrides),
      adapters: createFakeDeploymentAdapters(mutations),
      write: () => undefined,
    });

    expect(exitCode).toBe(1);
    expect(mutations).toEqual([]);
  });

  it("rejects undeclared named inputs", async () => {
    const mutations: string[] = [];

    const exitCode = await runDeploymentCli({
      args: [...validIntentArgs(), "--database-url", "postgres://secret"],
      adapters: createFakeDeploymentAdapters(mutations),
      write: () => undefined,
    });

    expect(exitCode).toBe(1);
    expect(mutations).toEqual([]);
  });

  it("reuses the correlated deployment when the command is replayed", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const adapters = createFakeDeploymentAdapters(
      mutations,
      [1_000, 1_100, 2_000, 2_125],
    );

    const firstExit = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });
    const replayExit = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect([firstExit, replayExit]).toEqual([0, 0]);
    expect(
      mutations.filter((mutation) => mutation === "dokploy:start"),
    ).toEqual(["dokploy:start"]);
    expect(output.map(parseJson)).toMatchObject([
      { deploymentId: "deployment-1" },
      { deploymentId: "deployment-1" },
    ]);
  });

  it("redacts malformed external results instead of leaking their contents", async () => {
    const seededConnection = [
      "postgres",
      "://operator:secret@db/internal",
    ].join("");
    const seededToken = ["ghp", "_1234567890abcdefghijklmnop"].join("");
    const seededExternalUser = ["user", "_external_123456"].join("");
    const adapters = createFakeDeploymentAdapters([]);
    adapters.ghcr.verifyImagePair = async () => ({
      ok: true,
      value: {
        apiDigest: seededConnection,
        webDigest: `${seededToken}:${seededExternalUser}`,
        sourceSha: "a".repeat(40),
      },
    });
    const output: string[] = [];

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      ok: false,
      error: { code: "invalid-adapter-result" },
    });
    expect(output.join("\n")).not.toContain(seededConnection);
    expect(output.join("\n")).not.toContain(seededToken);
    expect(output.join("\n")).not.toContain(seededExternalUser);
  });

  it.each([
    {
      name: "a token-shaped value",
      seededId: ["ghp", "_1234567890abcdefghijklmnop"].join(""),
    },
    {
      name: "a provider secret",
      seededId: ["dokploy", "_token_1234567890"].join(""),
    },
    {
      name: "an external User identifier",
      seededId: ["user", "_external_123456"].join(""),
    },
  ])(
    "redacts $name returned as a deployment identifier",
    async ({ seededId }) => {
      const adapters = createFakeDeploymentAdapters([]);
      adapters.dokploy.inspectAttempt = async () => ({
        ok: true,
        value: {
          queue: [],
          deployments: [{ deploymentId: seededId, status: "done" }],
        },
      });
      const output: string[] = [];

      const exitCode = await runDeploymentCli({
        args: validIntentArgs(),
        adapters,
        write: (line) => output.push(line),
      });

      expect(exitCode).toBe(1);
      expect(parseJson(output[0] ?? "null")).toMatchObject({
        ok: false,
        error: { code: "invalid-adapter-result" },
      });
      expect(output.join("\n")).not.toContain(seededId);
    },
  );

  it("accepts a Dokploy identifier that opens with the URL-safe alphabet", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    let inspections = 0;
    adapters.dokploy.inspectAttempt = async () => {
      inspections += 1;
      mutations.push("dokploy:inspect");
      return {
        ok: true,
        value: {
          queue: [],
          deployments:
            inspections === 1
              ? []
              : [{ deploymentId: "-GnwVscJnNNkhC-nhW9wd", status: "done" }],
        },
      };
    };

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      ok: true,
      deploymentId: "-GnwVscJnNNkhC-nhW9wd",
      state: "healthy",
    });
    expect(mutations).toContain("ghcr:advance-channel");
  });

  it("waits for the public origin to answer before advancing the channel", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    let checks = 0;
    adapters.healthCheck.verify = async () => {
      checks += 1;
      mutations.push("health-check");
      return checks < 3
        ? { ok: false, code: "rejected" }
        : { ok: true, value: undefined };
    };

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(checks).toBe(3);
    expect(mutations).toContain("ghcr:advance-channel");
  });

  it("rejects a created deployment record for different intent", async () => {
    const adapters = createFakeDeploymentAdapters([]);
    adapters.dokploy.inspectAttempt = async () => ({
      ok: true,
      value: {
        queue: [],
        deployments: [
          { deploymentId: "deployment-1", status: "unexpected" as "done" },
        ],
      },
    });
    const output: string[] = [];

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      ok: false,
      error: { code: "invalid-adapter-result" },
    });
  });

  it("rejects images that GHCR cannot bind to the declared source", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    adapters.ghcr.verifyImagePair = async () => ({
      ok: true,
      value: {
        apiDigest: `sha256:${"b".repeat(64)}`,
        webDigest: `sha256:${"c".repeat(64)}`,
        sourceSha: "d".repeat(40),
      },
    });

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(mutations).not.toContain("dokploy:start");
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      ok: false,
      error: { code: "invalid-adapter-result" },
    });
  });

  it("fails closed when a correlation matches multiple remote attempts", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const adapters = createFakeDeploymentAdapters(
      mutations,
      [1_000, 1_100, 2_000, 2_100],
    );

    adapters.dokploy.inspectAttempt = async () => ({
      ok: true,
      value: {
        queue: [
          { jobId: "job-1", state: "waiting" },
          { jobId: "job-2", state: "waiting" },
        ],
        deployments: [],
      },
    });
    const conflictingExit = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(conflictingExit).toBe(1);
    expect(mutations).not.toContain("dokploy:start");
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      ok: false,
      error: { code: "ambiguous-deployment" },
    });
  });

  it("does not advance the development tags when external health fails", async () => {
    const mutations: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    adapters.healthCheck.verify = async () => ({
      ok: false,
      code: "rejected",
    });

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: () => undefined,
    });

    expect(exitCode).toBe(1);
    expect(mutations).not.toContain("ghcr:advance-channel");
  });

  it("rejects stale GitHub intent before converging Compose", async () => {
    const mutations: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    adapters.github.verifyIntent = async () => ({
      ok: false,
      code: "rejected",
    });

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: () => undefined,
    });

    expect(exitCode).toBe(1);
    expect(mutations).not.toContain("dokploy:converge");
    expect(mutations).not.toContain("dokploy:start");
  });

  it.each(["error", "cancelled"] as const)(
    "stops on a terminal %s deployment without health or tag mutation",
    async (status) => {
      const mutations: string[] = [];
      const output: string[] = [];
      const adapters = createFakeDeploymentAdapters(mutations);
      adapters.dokploy.inspectAttempt = async () => ({
        ok: true,
        value: {
          queue: [],
          deployments: [{ deploymentId: "deployment-1", status }],
        },
      });

      const exitCode = await runDeploymentCli({
        args: validIntentArgs(),
        adapters,
        write: (line) => output.push(line),
      });

      expect(exitCode).toBe(1);
      expect(parseJson(output[0] ?? "null")).toMatchObject({
        error: { code: "remote-deployment-failed" },
      });
      expect(mutations).not.toContain("health-check");
      expect(mutations).not.toContain("ghcr:advance-channel");
    },
  );

  it("follows running remote work to completion without a cancellation port", async () => {
    const mutations: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    let inspection = 0;
    adapters.dokploy.inspectAttempt = async () => {
      inspection += 1;
      return {
        ok: true,
        value: {
          queue: [],
          deployments: [
            {
              deploymentId: "deployment-1",
              status: inspection === 1 ? "running" : "done",
            },
          ],
        },
      };
    };

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: () => undefined,
    });

    expect(exitCode).toBe(0);
    expect(mutations).not.toContain("dokploy:start");
    expect("cancelDeployment" in adapters.dokploy).toBe(false);
  });

  it("fails closed when a triggered correlation never appears remotely", async () => {
    const mutations: string[] = [];
    const output: string[] = [];
    const adapters = createFakeDeploymentAdapters(mutations);
    adapters.dokploy.inspectAttempt = async () => ({
      ok: true,
      value: { queue: [], deployments: [] },
    });

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(parseJson(output[0] ?? "null")).toMatchObject({
      error: { code: "missing-deployment" },
    });
    expect(mutations).not.toContain("health-check");
  });

  it("converts thrown adapter diagnostics into a safe structured failure", async () => {
    const seededToken = ["dokploy", "_token_1234567890"].join("");
    const adapters = createFakeDeploymentAdapters([]);
    adapters.clock.nowMilliseconds = () => {
      throw new Error(`clock failed with ${seededToken}`);
    };
    const output: string[] = [];

    const exitCode = await runDeploymentCli({
      args: validIntentArgs(),
      adapters,
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(parseJson(output[0] ?? "null")).toEqual({
      ok: false,
      error: {
        code: "unexpected-failure",
        message: "Deployment reconciliation failed safely.",
      },
      evidence: {
        channel: "development",
        sourceSha: "a".repeat(40),
        correlation: `development:${"a".repeat(40)}:run-42`,
      },
      durationMs: 0,
    });
    expect(output.join("\n")).not.toContain(seededToken);
  });
});
