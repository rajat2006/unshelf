import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Capability,
  BUILD_CLAUDE_MODEL,
  CODEX_MODEL,
  resolveAgent,
} from "./resolve-agent";

/**
 * The capability policy the resolver is checked against. Table-driven so a
 * missing policy entry or an accidental fallback is visible: every capability
 * names its exact Claude and Codex model + effort. This seam-only commit keeps
 * every capability on the previous uniform values; the tier policy lands next.
 */
const uniform = {
  claudeModel: "claude-opus-4-8",
  claudeEffort: "medium",
  codexModel: "gpt-5.6-sol",
  codexEffort: "medium",
};
const POLICY: Record<
  Capability,
  {
    claudeModel: string;
    claudeEffort: string;
    codexModel: string;
    codexEffort: string;
  }
> = {
  implement: uniform,
  "implement-prd": uniform,
  "implement-pr": uniform,
  "update-branch": uniform,
  "write-pr": uniform,
  "write-prd-pr": uniform,
  review: uniform,
  "to-issues": uniform,
  "architecture-review": uniform,
  explore: uniform,
};

const CAPABILITIES = Object.keys(POLICY) as Capability[];

describe("resolveAgent — capability-specific model and effort policy", () => {
  describe.each(CAPABILITIES)("capability %s", (capability) => {
    const expected = POLICY[capability];

    it("resolves the Claude entry when agent:codex is absent", () => {
      const { agent, model, effort } = resolveAgent(
        ["ready-for-agent"],
        capability,
      );

      expect(agent.name).toBe("claude-code");
      expect(model).toBe(expected.claudeModel);
      expect(effort).toBe(expected.claudeEffort);
    });

    it("builds Claude Code with the configured effort", () => {
      const { agent } = resolveAgent([], capability);

      expect(
        agent.buildPrintCommand({
          prompt: "Inspect the issue",
          dangerouslySkipPermissions: true,
        }).command,
      ).toContain(`--effort ${expected.claudeEffort}`);
    });

    it("resolves the Codex entry when agent:codex is present", () => {
      const { agent, model, effort } = resolveAgent(
        ["agent:codex", "ready-for-agent"],
        capability,
      );

      expect(agent.name).toBe("codex");
      expect(model).toBe(expected.codexModel);
      expect(effort).toBe(expected.codexEffort);
    });

    it("builds Codex with the configured reasoning effort", () => {
      const { agent } = resolveAgent(["agent:codex"], capability);

      expect(
        agent.buildPrintCommand({
          prompt: "Inspect the issue",
          dangerouslySkipPermissions: true,
        }).command,
      ).toContain(`model_reasoning_effort="${expected.codexEffort}"`);
    });
  });

  it("resolves the Claude model at medium effort", () => {
    const { model, effort } = resolveAgent([], "implement");
    expect(model).toBe(BUILD_CLAUDE_MODEL);
    expect(model).toBe("claude-opus-4-8");
    expect(effort).toBe("medium");
  });

  it("keeps every capability on the one Codex model", () => {
    for (const capability of CAPABILITIES) {
      expect(resolveAgent(["agent:codex"], capability).model).toBe(CODEX_MODEL);
    }
  });

  it("treats an empty label set as the Claude default (absence is Claude)", () => {
    const { agent } = resolveAgent([], "implement");
    expect(agent.name).toBe("claude-code");
  });

  it("finds agent:codex regardless of its position in the set", () => {
    const { agent } = resolveAgent(
      ["agent:implement", "ready-for-agent", "agent:codex"],
      "implement",
    );
    expect(agent.name).toBe("codex");
  });

  it("does not treat a lookalike label as the Codex switch", () => {
    const { agent } = resolveAgent(
      ["agent:codex-experimental", "codex"],
      "implement",
    );
    expect(agent.name).toBe("claude-code");
  });
});

describe("resolveAgent — Codex session storage under CODEX_HOME", () => {
  it("finds Codex resumable sessions under CODEX_HOME", async () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codex-home-"));
    const sessionId = "session-from-configured-home";
    const sessionPath = path.join(
      codexHome,
      "sessions",
      "2026",
      "07",
      `rollout-test-${sessionId}.jsonl`,
    );
    const originalCodexHome = process.env.CODEX_HOME;

    try {
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, "{}");
      process.env.CODEX_HOME = codexHome;

      const { agent } = resolveAgent(["agent:codex"], "implement");
      const found = await agent.sessionStorage?.findByIdOnHost(sessionId);

      expect(found?.path).toBe(sessionPath);
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodexHome;
      }
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("falls back to HOME/.codex for Codex resumable sessions", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
    const sessionId = "session-from-default-home";
    const sessionPath = path.join(
      home,
      ".codex",
      "sessions",
      "2026",
      "07",
      `rollout-test-${sessionId}.jsonl`,
    );
    const originalCodexHome = process.env.CODEX_HOME;
    const originalHome = process.env.HOME;

    try {
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, "{}");
      delete process.env.CODEX_HOME;
      process.env.HOME = home;

      const { agent } = resolveAgent(["agent:codex"], "implement");
      const found = await agent.sessionStorage?.findByIdOnHost(sessionId);

      expect(found?.path).toBe(sessionPath);
    } finally {
      if (originalCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = originalCodexHome;
      }
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
