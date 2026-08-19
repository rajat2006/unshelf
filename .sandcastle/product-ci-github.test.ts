import { describe, expect, it } from "vitest";
import { GhProductCiGitHub } from "./product-ci-github";

describe("GitHub Product CI adapter", () => {
  it("maps pull request, run, and Product-job API responses", async () => {
    const responses = [
      JSON.stringify({
        number: 42,
        state: "open",
        draft: true,
        head: { sha: "head", ref: "agent/issue-42", repo: { full_name: "o/r" } },
        base: { sha: "base", ref: "dev", repo: { full_name: "o/r" } },
      }),
      JSON.stringify({
        workflow_runs: [{
          id: 100,
          run_attempt: 2,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "success",
          html_url: "run-url",
          created_at: "2026-08-19T00:00:00Z",
          pull_requests: [{ number: 42, head: { sha: "head" }, base: { sha: "base" } }],
        }],
      }),
      JSON.stringify({ jobs: [{ id: 200, name: "Product", status: "completed", conclusion: "success", html_url: "job-url" }] }),
    ];
    const github = new GhProductCiGitHub({
      repository: "o/r",
      execute: async () => responses.shift() ?? "",
    });

    await expect(github.getPullRequest(42)).resolves.toMatchObject({
      headSha: "head",
      baseSha: "base",
      repository: "o/r",
    });
    await expect(github.listWorkflowRuns()).resolves.toEqual([
      expect.objectContaining({ id: 100, attempt: 2, workflowName: "CI" }),
    ]);
    await expect(github.listRunJobs(100)).resolves.toEqual([
      expect.objectContaining({ id: 200, name: "Product" }),
    ]);
  });

  it("rejects malformed GitHub data instead of guessing", async () => {
    const github = new GhProductCiGitHub({
      repository: "o/r",
      execute: async () => JSON.stringify({ number: 42, state: "open" }),
    });

    await expect(github.getPullRequest(42)).rejects.toThrow("Malformed GitHub");
  });
});
