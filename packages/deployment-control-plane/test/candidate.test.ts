import { runCandidateCli } from "../src/candidate.js";
import { describe, expect, it } from "vitest";

describe("candidate publication CLI", () => {
  it("prepares write-once environment-specific trace identities", async () => {
    const output: string[] = [];
    const sourceSha = "a".repeat(40);

    const exitCode = await runCandidateCli({
      args: [
        "prepare-candidate",
        "--channel",
        "development",
        "--source-sha",
        sourceSha,
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async () => ({ ok: true, value: undefined }),
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output[0] ?? "null") as unknown).toEqual({
      ok: true,
      channel: "development",
      sourceSha,
      apiTrace: `ghcr.io/rajat2006/unshelf-api:development-${sourceSha}`,
      webTrace: `ghcr.io/rajat2006/unshelf-web:development-${sourceSha}`,
      state: "ready",
      durationMs: 0,
    });
  });

  it("emits one immutable pair only after both published traces resolve", async () => {
    const output: string[] = [];
    const sourceSha = "a".repeat(40);
    const apiDigest = `sha256:${"b".repeat(64)}`;
    const webDigest = `sha256:${"c".repeat(64)}`;

    const exitCode = await runCandidateCli({
      args: [
        "finalize-candidate",
        "--channel",
        "preview",
        "--source-sha",
        sourceSha,
        "--api-digest",
        apiDigest,
        "--web-digest",
        webDigest,
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async ({ trace }) => ({
            ok: true,
            value: {
              digest: trace.includes("unshelf-api") ? apiDigest : webDigest,
            },
          }),
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output[0] ?? "null") as unknown).toEqual({
      ok: true,
      channel: "preview",
      sourceSha,
      apiImage: `ghcr.io/rajat2006/unshelf-api@${apiDigest}`,
      webImage: `ghcr.io/rajat2006/unshelf-web@${webDigest}`,
      apiDigest,
      webDigest,
      state: "candidate",
      durationMs: 0,
    });
  });

  it("rejects malformed candidate intent before registry access", async () => {
    let registryReads = 0;

    const exitCode = await runCandidateCli({
      args: [
        "prepare-candidate",
        "--channel",
        "development",
        "--source-sha",
        "A".repeat(40),
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async () => {
            registryReads += 1;
            return { ok: true, value: undefined };
          },
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: () => undefined,
    });

    expect(exitCode).toBe(1);
    expect(registryReads).toBe(0);
  });

  it("rejects a stale source SHA before registry access", async () => {
    let registryReads = 0;
    const output: string[] = [];

    const exitCode = await runCandidateCli({
      args: [
        "prepare-candidate",
        "--channel",
        "preview",
        "--source-sha",
        "a".repeat(40),
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: false, code: "rejected" }),
        },
        ghcr: {
          inspectTrace: async () => {
            registryReads += 1;
            return { ok: true, value: undefined };
          },
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(registryReads).toBe(0);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      ok: false,
      error: { code: "github-failure" },
    });
  });

  it("fails closed when either trace identity already exists", async () => {
    const output: string[] = [];

    const exitCode = await runCandidateCli({
      args: [
        "prepare-candidate",
        "--channel",
        "production",
        "--source-sha",
        "a".repeat(40),
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async ({ trace }) => ({
            ok: true,
            value: trace.includes("unshelf-api")
              ? { digest: `sha256:${"b".repeat(64)}` }
              : undefined,
          }),
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      ok: false,
      error: { code: "duplicate-trace-identity" },
    });
  });

  it("emits no candidate for a partial publication", async () => {
    const output: string[] = [];
    const apiDigest = `sha256:${"b".repeat(64)}`;

    const exitCode = await runCandidateCli({
      args: [
        "finalize-candidate",
        "--channel",
        "development",
        "--source-sha",
        "a".repeat(40),
        "--api-digest",
        apiDigest,
        "--web-digest",
        `sha256:${"c".repeat(64)}`,
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async ({ trace }) => ({
            ok: true,
            value: trace.includes("unshelf-api")
              ? { digest: apiDigest }
              : undefined,
          }),
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      ok: false,
      error: { code: "partial-publication" },
    });
    expect(output.join("\n")).not.toContain('"state":"candidate"');
  });

  it("rejects a published digest that does not match the exact trace", async () => {
    const output: string[] = [];

    const exitCode = await runCandidateCli({
      args: [
        "finalize-candidate",
        "--channel",
        "development",
        "--source-sha",
        "a".repeat(40),
        "--api-digest",
        `sha256:${"b".repeat(64)}`,
        "--web-digest",
        `sha256:${"c".repeat(64)}`,
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async ({ trace }) => ({
            ok: true,
            value: {
              digest: trace.includes("unshelf-api")
                ? `sha256:${"d".repeat(64)}`
                : `sha256:${"c".repeat(64)}`,
            },
          }),
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      ok: false,
      error: { code: "digest-mismatch" },
    });
  });

  it("redacts credentials from thrown registry diagnostics", async () => {
    const seededToken = ["ghp", "_1234567890abcdefghijklmnop"].join("");
    const output: string[] = [];

    const exitCode = await runCandidateCli({
      args: [
        "prepare-candidate",
        "--channel",
        "preview",
        "--source-sha",
        "a".repeat(40),
      ],
      adapters: {
        github: {
          verifyCandidate: async () => ({ ok: true, value: undefined }),
        },
        ghcr: {
          inspectTrace: async () => {
            throw new Error(`registry rejected ${seededToken}`);
          },
        },
        clock: { nowMilliseconds: () => 1_000 },
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      ok: false,
      error: { code: "unexpected-failure" },
    });
    expect(output.join("\n")).not.toContain(seededToken);
  });
});
