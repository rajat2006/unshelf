import { createGitHubActionsCandidateAdapters } from "../src/candidate-adapters.js";
import { describe, expect, it } from "vitest";

describe("GitHub Actions candidate adapters", () => {
  it("accepts only the exact trusted repository, channel, and approved SHA", async () => {
    const sourceSha = "a".repeat(40);
    const adapters = createGitHubActionsCandidateAdapters({
      environment: {
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "rajat2006/unshelf",
        APPROVED_EVENT: "push",
        APPROVED_CHANNEL: "development",
        APPROVED_HEAD_BRANCH: "dev",
        APPROVED_HEAD_REPOSITORY: "rajat2006/unshelf",
        APPROVED_SOURCE_SHA: sourceSha,
      },
      runRegistryInspect: async () => ({ ok: false, reason: "not-found" }),
      runGitHubInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({ headSha: sourceSha }),
      }),
    });

    await expect(
      adapters.github.verifyCandidate({ channel: "development", sourceSha }),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(
      adapters.github.verifyCandidate({
        channel: "development",
        sourceSha: "b".repeat(40),
      }),
    ).resolves.toEqual({ ok: false, code: "rejected" });
  });

  it("revalidates an eligible preview from the current pull request state", async () => {
    const sourceSha = "a".repeat(40);
    const adapters = createGitHubActionsCandidateAdapters({
      environment: {
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "rajat2006/unshelf",
        APPROVED_EVENT: "pull_request",
        APPROVED_CHANNEL: "preview",
        APPROVED_HEAD_BRANCH: "feature/candidate",
        APPROVED_HEAD_REPOSITORY: "rajat2006/unshelf",
        APPROVED_SOURCE_SHA: sourceSha,
      },
      runGitHubInspect: async () => ({
        ok: true,
        stdout: JSON.stringify([
          {
            state: "open",
            draft: false,
            baseRef: "dev",
            headSha: sourceSha,
            headRepository: "rajat2006/unshelf",
          },
        ]),
      }),
    });

    await expect(
      adapters.github.verifyCandidate({ channel: "preview", sourceSha }),
    ).resolves.toEqual({ ok: true, value: undefined });
  });

  it.each([
    { name: "draft", overrides: { draft: true } },
    { name: "closed", overrides: { state: "closed" } },
    { name: "wrong base", overrides: { baseRef: "main" } },
    {
      name: "fork",
      overrides: { headRepository: "outside/unshelf" },
    },
    { name: "stale SHA", overrides: { headSha: "b".repeat(40) } },
  ])("rejects a $name preview", async ({ overrides }) => {
    const sourceSha = "a".repeat(40);
    const adapters = createGitHubActionsCandidateAdapters({
      environment: {
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "rajat2006/unshelf",
        APPROVED_EVENT: "pull_request",
        APPROVED_CHANNEL: "preview",
        APPROVED_HEAD_BRANCH: "feature/candidate",
        APPROVED_HEAD_REPOSITORY: "rajat2006/unshelf",
        APPROVED_SOURCE_SHA: sourceSha,
      },
      runGitHubInspect: async () => ({
        ok: true,
        stdout: JSON.stringify([
          {
            state: "open",
            draft: false,
            baseRef: "dev",
            headSha: sourceSha,
            headRepository: "rajat2006/unshelf",
            ...overrides,
          },
        ]),
      }),
    });

    await expect(
      adapters.github.verifyCandidate({ channel: "preview", sourceSha }),
    ).resolves.toEqual({ ok: false, code: "rejected" });
  });

  it("returns only a validated digest from a sanitized registry manifest", async () => {
    const digest = `sha256:${"b".repeat(64)}`;
    const adapters = createGitHubActionsCandidateAdapters({
      environment: {},
      runRegistryInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({
          schemaVersion: 2,
          mediaType: "application/vnd.oci.image.index.v1+json",
          digest,
          manifests: [],
        }),
      }),
      runPackageInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({ visibility: "private" }),
      }),
    });

    await expect(
      adapters.ghcr.inspectTrace({
        trace: `ghcr.io/rajat2006/unshelf-api:development-${"a".repeat(40)}`,
      }),
    ).resolves.toEqual({ ok: true, value: { digest } });
  });

  it("distinguishes an unused trace from an unavailable registry", async () => {
    const absent = createGitHubActionsCandidateAdapters({
      environment: {},
      runRegistryInspect: async () => ({ ok: false, reason: "not-found" }),
      runPackageInspect: async () => ({ ok: false, reason: "not-found" }),
    });
    const unavailable = createGitHubActionsCandidateAdapters({
      environment: {},
      runRegistryInspect: async () => ({ ok: false, reason: "failed" }),
      runPackageInspect: async () => ({ ok: false, reason: "not-found" }),
    });
    const input = {
      trace: `ghcr.io/rajat2006/unshelf-web:preview-${"a".repeat(40)}`,
    };

    await expect(absent.ghcr.inspectTrace(input)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(unavailable.ghcr.inspectTrace(input)).resolves.toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("rejects malformed registry output without returning its contents", async () => {
    const seededToken = ["github_pat", "_secret_1234567890"].join("");
    const adapters = createGitHubActionsCandidateAdapters({
      environment: {},
      runRegistryInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({ digest: seededToken }),
      }),
      runPackageInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({ visibility: "private" }),
      }),
    });

    const result = await adapters.ghcr.inspectTrace({
      trace: `ghcr.io/rajat2006/unshelf-api:production-${"a".repeat(40)}`,
    });

    expect(result).toEqual({ ok: false, code: "rejected" });
    expect(JSON.stringify(result)).not.toContain(seededToken);
  });

  it("rejects a public container package", async () => {
    const adapters = createGitHubActionsCandidateAdapters({
      environment: {},
      runRegistryInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({ digest: `sha256:${"b".repeat(64)}` }),
      }),
      runPackageInspect: async () => ({
        ok: true,
        stdout: JSON.stringify({ visibility: "public" }),
      }),
    });

    await expect(
      adapters.ghcr.inspectTrace({
        trace: `ghcr.io/rajat2006/unshelf-api:development-${"a".repeat(40)}`,
      }),
    ).resolves.toEqual({ ok: false, code: "rejected" });
  });
});
