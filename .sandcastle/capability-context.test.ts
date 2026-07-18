import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCapabilityContext } from "./capability-context";
import { CLAUDE_MODEL, CODEX_MODEL } from "./resolve-agent";

const ENV_KEYS = [
  "ISSUE_NUMBER",
  "ISSUE_TITLE",
  "BRANCH",
  "OUTPUT_DIR",
  "AGENT_LABELS",
];

function setEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    ISSUE_NUMBER: "63",
    ISSUE_TITLE: "agent-implement workflow",
    BRANCH: "agent/issue-63-agent-implement-workflow",
    OUTPUT_DIR: "/run/tmp",
    AGENT_LABELS: '["ready-for-agent","agent:implement"]',
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("loadCapabilityContext", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("reads the issue coordinates and output dir from the environment", () => {
    setEnv();
    const ctx = loadCapabilityContext();

    expect(ctx.issueNumber).toBe("63");
    expect(ctx.issueTitle).toBe("agent-implement workflow");
    expect(ctx.branch).toBe("agent/issue-63-agent-implement-workflow");
    expect(ctx.outputDir).toBe("/run/tmp");
  });

  it("exposes promptArgs shaped for {{...}} substitution", () => {
    setEnv();
    expect(loadCapabilityContext().promptArgs).toEqual({
      ISSUE_NUMBER: "63",
      ISSUE_TITLE: "agent-implement workflow",
      BRANCH: "agent/issue-63-agent-implement-workflow",
    });
  });

  it("resolves the provider from the full label set (default is Claude)", () => {
    setEnv();
    const ctx = loadCapabilityContext();
    expect(ctx.agent.name).toBe("claude-code");
    expect(ctx.model).toBe(CLAUDE_MODEL);
  });

  it("routes to Codex when agent:codex is anywhere in the label set", () => {
    setEnv({ AGENT_LABELS: '["agent:codex","agent:implement"]' });
    const ctx = loadCapabilityContext();
    expect(ctx.agent.name).toBe("codex");
    expect(ctx.model).toBe(CODEX_MODEL);
    expect(ctx.labels).toContain("agent:codex");
  });

  it("treats absent AGENT_LABELS as an empty set (Claude default)", () => {
    setEnv({ AGENT_LABELS: undefined });
    const ctx = loadCapabilityContext();
    expect(ctx.labels).toEqual([]);
    expect(ctx.agent.name).toBe("claude-code");
  });

  it("throws when a required var (OUTPUT_DIR) is missing", () => {
    setEnv({ OUTPUT_DIR: undefined });
    expect(() => loadCapabilityContext()).toThrow("OUTPUT_DIR");
  });
});
