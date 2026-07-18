import { StructuredOutputError } from "@ai-hero/sandcastle";
import type { RunResult } from "@ai-hero/sandcastle";
import { describe, expect, it, vi } from "vitest";
import { MAX_ATTEMPTS } from "./run-with-retry";
import { runWithExtraction, type ExtractingRun, type ExtractionOptions } from "./run-with-extraction";

// Minimal run options — the fake run() ignores everything but the fields we
// assert on (resumeSession / prompt / promptFile), so a structural cast keeps
// the unit hermetic: no real agent, no real sandbox.
const baseOptions = {
  agent: { name: "claude-code" },
  sandbox: {},
  promptFile: "/abs/.sandcastle/review/prompt.md",
  output: { _tag: "string", tag: "output" },
} as unknown as ExtractionOptions;

/** A successful RunResult carrying an extracted `output`. */
const success = (output: string): RunResult & { output: string } =>
  ({
    iterations: [],
    stdout: "",
    commits: [{ sha: "abc123" }],
    branch: "agent/issue-1-x",
    output,
  }) as unknown as RunResult & { output: string };

/** A StructuredOutputError the way run() throws it; `sessionId` may be absent. */
const outputError = (sessionId: string | undefined): StructuredOutputError =>
  new StructuredOutputError("no <output> block", {
    tag: "output",
    rawMatched: undefined,
    commits: [{ sha: "abc123" }],
    branch: "agent/issue-1-x",
    sessionId,
  });

describe("runWithExtraction — structured output with same-session retry", () => {
  it("returns the extracted output on a first-attempt success", async () => {
    const run = vi.fn<ExtractingRun<string>>(async () => success("clean"));

    const result = await runWithExtraction({ run, options: baseOptions });

    expect(result.output).toBe("clean");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("resumes the session with feedback on a StructuredOutputError, then succeeds", async () => {
    const run = vi
      .fn<ExtractingRun<string>>()
      .mockRejectedValueOnce(outputError("sess-42"))
      .mockResolvedValueOnce(success("corrected"));

    const result = await runWithExtraction({ run, options: baseOptions });

    expect(result.output).toBe("corrected");
    expect(run).toHaveBeenCalledTimes(2);

    // The first attempt runs the original options unchanged...
    expect(run.mock.calls[0][0]).toBe(baseOptions);

    // ...the retry resumes that same session with an inline feedback prompt,
    // and drops promptFile (mutually exclusive with prompt on run()).
    const retryOptions = run.mock.calls[1][0];
    expect(retryOptions.resumeSession).toBe("sess-42");
    expect(retryOptions.prompt).toContain("<output>");
    expect(retryOptions.prompt).toContain("Re-emit exactly one");
    expect(retryOptions.promptFile).toBeUndefined();
    // The output definition is carried through so the retry re-extracts.
    expect(retryOptions.output).toBe(baseOptions.output);
  });

  it("retries up to 3× and surfaces the terminal StructuredOutputError", async () => {
    const terminal = outputError("sess-42");
    const run = vi
      .fn<ExtractingRun<string>>()
      .mockRejectedValueOnce(outputError("sess-42"))
      .mockRejectedValueOnce(outputError("sess-42"))
      .mockRejectedValueOnce(terminal);

    await expect(runWithExtraction({ run, options: baseOptions })).rejects.toBe(terminal);
    expect(run).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("does not retry when the error carries no resumable sessionId", async () => {
    const noSession = outputError(undefined);
    const run = vi.fn<ExtractingRun<string>>().mockRejectedValue(noSession);

    await expect(runWithExtraction({ run, options: baseOptions })).rejects.toBe(noSession);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-StructuredOutputError", async () => {
    const crash = new Error("agent crashed");
    const run = vi.fn<ExtractingRun<string>>().mockRejectedValue(crash);

    await expect(runWithExtraction({ run, options: baseOptions })).rejects.toBe(crash);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("honours a custom maxAttempts cap", async () => {
    const run = vi.fn<ExtractingRun<string>>().mockRejectedValue(outputError("sess-42"));

    await expect(
      runWithExtraction({ run, options: baseOptions, maxAttempts: 2 }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
