import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadCapabilityContext,
  loadIssueCapabilityContext,
  loadPrdImplementContext,
  loadPrdPrContext,
} from "./capability-context";
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

describe("loadIssueCapabilityContext", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("loads a read-only issue capability without requiring a branch", () => {
    setEnv({ BRANCH: undefined });

    expect(loadIssueCapabilityContext()).toMatchObject({
      issueNumber: "63",
      issueTitle: "agent-implement workflow",
      outputDir: "/run/tmp",
      promptArgs: {
        ISSUE_NUMBER: "63",
        ISSUE_TITLE: "agent-implement workflow",
      },
    });
  });

  it("routes a read-only issue capability from the full label set", () => {
    setEnv({
      BRANCH: undefined,
      AGENT_LABELS: '["agent:explore","agent:codex"]',
    });

    const ctx = loadIssueCapabilityContext();
    expect(ctx.agent.name).toBe("codex");
    expect(ctx.model).toBe(CODEX_MODEL);
    expect(ctx.labels).toEqual(["agent:explore", "agent:codex"]);
  });
});

const PRD_ENV_KEYS = [
  "PRD_NUMBER",
  "PRD_TITLE",
  "SUB_ISSUE_NUMBER",
  "SUB_ISSUE_TITLE",
  "BRANCH",
  "OUTPUT_DIR",
  "AGENT_LABELS",
];

function setPrdEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    PRD_NUMBER: "52",
    PRD_TITLE: "Build the Sandcastle platform",
    SUB_ISSUE_NUMBER: "68",
    SUB_ISSUE_TITLE: "agent-implement-prd workflow",
    BRANCH: "agent/prd-52-build-the-sandcastle-platform",
    OUTPUT_DIR: "/run/tmp",
    AGENT_LABELS: '["ready-for-agent","agent:implement"]',
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("loadPrdPrContext", () => {
  beforeEach(() => {
    for (const key of PRD_ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of PRD_ENV_KEYS) delete process.env[key];
  });

  it("reads the PRD coordinates and output dir", () => {
    setPrdEnv();
    const ctx = loadPrdPrContext();
    expect(ctx.prdNumber).toBe("52");
    expect(ctx.prdTitle).toBe("Build the Sandcastle platform");
    expect(ctx.outputDir).toBe("/run/tmp");
  });

  it("exposes only PRD promptArgs (no sub-issue — the body is whole-PRD)", () => {
    setPrdEnv();
    expect(loadPrdPrContext().promptArgs).toEqual({
      PRD_NUMBER: "52",
      PRD_TITLE: "Build the Sandcastle platform",
    });
  });

  it("resolves the provider from the PRD's full label set", () => {
    setPrdEnv({ AGENT_LABELS: '["agent:codex","agent:implement"]' });
    const ctx = loadPrdPrContext();
    expect(ctx.agent.name).toBe("codex");
    expect(ctx.model).toBe(CODEX_MODEL);
  });

  it("throws when a required var (PRD_NUMBER) is missing", () => {
    setPrdEnv({ PRD_NUMBER: undefined });
    expect(() => loadPrdPrContext()).toThrow("PRD_NUMBER");
  });
});

describe("loadPrdImplementContext", () => {
  beforeEach(() => {
    for (const key of PRD_ENV_KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of PRD_ENV_KEYS) delete process.env[key];
  });

  it("reads the PRD coordinates, the sub-issue, and the branch", () => {
    setPrdEnv();
    const ctx = loadPrdImplementContext();
    expect(ctx.prdNumber).toBe("52");
    expect(ctx.subIssueNumber).toBe("68");
    expect(ctx.subIssueTitle).toBe("agent-implement-prd workflow");
    expect(ctx.branch).toBe("agent/prd-52-build-the-sandcastle-platform");
  });

  it("exposes promptArgs shaped for {{...}} substitution", () => {
    setPrdEnv();
    expect(loadPrdImplementContext().promptArgs).toEqual({
      PRD_NUMBER: "52",
      PRD_TITLE: "Build the Sandcastle platform",
      SUB_ISSUE_NUMBER: "68",
      SUB_ISSUE_TITLE: "agent-implement-prd workflow",
      BRANCH: "agent/prd-52-build-the-sandcastle-platform",
    });
  });

  it("resolves the provider from the PRD's full label set (default Claude)", () => {
    setPrdEnv();
    const ctx = loadPrdImplementContext();
    expect(ctx.agent.name).toBe("claude-code");
    expect(ctx.model).toBe(CLAUDE_MODEL);
  });

  it("throws when the sub-issue var (SUB_ISSUE_NUMBER) is missing", () => {
    setPrdEnv({ SUB_ISSUE_NUMBER: undefined });
    expect(() => loadPrdImplementContext()).toThrow("SUB_ISSUE_NUMBER");
  });
});
