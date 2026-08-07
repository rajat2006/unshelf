import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const cli = new URL("../dist/cli.js", import.meta.url);
const repositories: string[] = [];

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

function createRepository(): {
  repository: string;
  mainSha: string;
  devSha: string;
} {
  const repository = mkdtempSync(path.join(tmpdir(), "unshelf-policy-"));
  repositories.push(repository);
  git(repository, "init", "--quiet");
  git(repository, "config", "user.email", "policy-test@unshelf.invalid");
  git(repository, "config", "user.name", "Unshelf policy test");
  git(repository, "commit", "--quiet", "--allow-empty", "-m", "main");
  const mainSha = git(repository, "rev-parse", "HEAD");
  git(repository, "switch", "--quiet", "-c", "dev");
  git(repository, "commit", "--quiet", "--allow-empty", "-m", "dev");
  const devSha = git(repository, "rev-parse", "HEAD");
  return { repository, mainSha, devSha };
}

function runPolicy({
  repository,
  mainSha,
  devSha,
  headSha,
  headRef = "dev",
  headRepository = "rajat2006/unshelf",
  labels = [],
}: {
  repository: string;
  mainSha: string;
  devSha: string;
  headSha: string;
  headRef?: string;
  headRepository?: string;
  labels?: string[];
}): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [
      cli.pathname,
      "--base-ref",
      "main",
      "--head-ref",
      headRef,
      "--base-repository",
      "rajat2006/unshelf",
      "--head-repository",
      headRepository,
      "--labels-json",
      JSON.stringify(labels),
      "--main-sha",
      mainSha,
      "--dev-sha",
      devSha,
      "--head-sha",
      headSha,
    ],
    { cwd: repository, encoding: "utf8" },
  );
  return { status: result.status, output: result.stdout };
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true });
  }
});

describe("release policy CLI", () => {
  it("accepts a dev-to-main release with exactly one release label", () => {
    const { repository, mainSha, devSha } = createRepository();

    const result = runPolicy({
      repository,
      mainSha,
      devSha,
      headSha: devSha,
      labels: ["release:minor"],
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.output)).toEqual({
      ok: true,
      kind: "release",
      bump: "minor",
    });
  });

  it("accepts an up-to-date direct-to-main hotfix without a release label", () => {
    const { repository, mainSha, devSha } = createRepository();
    git(repository, "switch", "--quiet", "--detach", mainSha);
    git(repository, "switch", "--quiet", "-c", "hotfix/session-refresh");
    git(repository, "commit", "--quiet", "--allow-empty", "-m", "hotfix");
    const headSha = git(repository, "rev-parse", "HEAD");

    const result = runPolicy({
      repository,
      mainSha,
      devSha,
      headSha,
      headRef: "hotfix/session-refresh",
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ ok: true, kind: "hotfix" });
  });

  it.each([
    { name: "no release label", labels: [] },
    {
      name: "more than one release label",
      labels: ["release:patch", "release:major"],
    },
  ])("rejects a dev-to-main release with $name", ({ labels }) => {
    const { repository, mainSha, devSha } = createRepository();

    const result = runPolicy({
      repository,
      mainSha,
      devSha,
      headSha: devSha,
      labels,
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.output)).toEqual({
      ok: false,
      error: {
        code: "policy-rejected",
        message: "Pull request does not satisfy release policy.",
      },
    });
  });

  it("rejects a normal release when dev does not contain current main", () => {
    const { repository, mainSha, devSha } = createRepository();
    git(repository, "switch", "--quiet", "--detach", mainSha);
    git(repository, "commit", "--quiet", "--allow-empty", "-m", "new main");
    const currentMainSha = git(repository, "rev-parse", "HEAD");

    const result = runPolicy({
      repository,
      mainSha: currentMainSha,
      devSha,
      headSha: devSha,
      labels: ["release:patch"],
    });

    expect(result.status).toBe(1);
  });

  it("rejects a hotfix carrying a release label", () => {
    const { repository, mainSha, devSha } = createRepository();
    git(repository, "switch", "--quiet", "--detach", mainSha);
    git(repository, "commit", "--quiet", "--allow-empty", "-m", "hotfix");
    const headSha = git(repository, "rev-parse", "HEAD");

    const result = runPolicy({
      repository,
      mainSha,
      devSha,
      headSha,
      headRef: "hotfix/session-refresh",
      labels: ["release:patch"],
    });

    expect(result.status).toBe(1);
  });

  it("rejects a stale hotfix that does not contain current main", () => {
    const { repository, mainSha, devSha } = createRepository();
    git(repository, "switch", "--quiet", "--detach", mainSha);
    git(repository, "commit", "--quiet", "--allow-empty", "-m", "hotfix");
    const headSha = git(repository, "rev-parse", "HEAD");
    git(repository, "switch", "--quiet", "--detach", mainSha);
    git(repository, "commit", "--quiet", "--allow-empty", "-m", "new main");
    const currentMainSha = git(repository, "rev-parse", "HEAD");

    const result = runPolicy({
      repository,
      mainSha: currentMainSha,
      devSha,
      headSha,
      headRef: "hotfix/session-refresh",
    });

    expect(result.status).toBe(1);
  });

  it("rejects fork authority without echoing external identifiers", () => {
    const { repository, mainSha, devSha } = createRepository();
    const externalIdentifier = "external-user/token_1234567890abcdef";

    const result = runPolicy({
      repository,
      mainSha,
      devSha,
      headSha: devSha,
      headRepository: externalIdentifier,
      labels: ["release:minor"],
    });

    expect(result.status).toBe(1);
    expect(result.output).not.toContain(externalIdentifier);
    expect(result.output).not.toContain("token_1234567890abcdef");
  });
});
