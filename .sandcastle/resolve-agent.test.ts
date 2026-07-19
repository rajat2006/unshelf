import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_MODEL, CODEX_MODEL, resolveAgent } from "./resolve-agent";

describe("resolveAgent — provider chosen from the issue's full label set", () => {
  it("routes to Codex on gpt-5.6-sol when agent:codex is present", () => {
    const { agent, model } = resolveAgent(["ready-for-agent", "agent:codex"]);

    expect(agent.name).toBe("codex");
    expect(model).toBe(CODEX_MODEL);
    expect(model).toBe("gpt-5.6-sol");
    expect(
      agent.buildPrintCommand({
        prompt: "Inspect the issue",
        dangerouslySkipPermissions: true,
      }).command,
    ).toContain('model_reasoning_effort="medium"');
  });

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

      const { agent } = resolveAgent(["agent:codex"]);
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

      const { agent } = resolveAgent(["agent:codex"]);
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

  it("defaults to Claude Code on claude-opus-4-8 when agent:codex is absent", () => {
    const { agent, model } = resolveAgent(["ready-for-agent", "agent:implement"]);

    expect(agent.name).toBe("claude-code");
    expect(model).toBe(CLAUDE_MODEL);
    expect(model).toBe("claude-opus-4-8");
    expect(
      agent.buildPrintCommand({
        prompt: "Inspect the issue",
        dangerouslySkipPermissions: true,
      }).command,
    ).toContain("--effort medium");
  });

  it("treats an empty label set as the Claude default (absence is Claude)", () => {
    const { agent, model } = resolveAgent([]);

    expect(agent.name).toBe("claude-code");
    expect(model).toBe(CLAUDE_MODEL);
  });

  it("finds agent:codex regardless of its position in the set", () => {
    const { agent } = resolveAgent(["agent:codex", "agent:implement", "ready-for-agent"]);

    expect(agent.name).toBe("codex");
  });

  it("does not treat a lookalike label as the Codex switch", () => {
    const { agent } = resolveAgent(["agent:codex-experimental", "codex"]);

    expect(agent.name).toBe("claude-code");
  });
});
