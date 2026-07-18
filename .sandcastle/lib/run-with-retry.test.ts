import { describe, expect, it, vi } from "vitest";
import { MAX_ATTEMPTS, runWithRetry, type Resume } from "./run-with-retry";

/** A recover() that always asks to resume the same fixed session. */
const alwaysResume = (): Resume => ({ sessionId: "sess-1", prompt: "fix it" });

describe("runWithRetry — the pure resume-on-error loop", () => {
  it("returns the first attempt's value without retrying on success", async () => {
    const attempt = vi.fn(async () => "ok");
    const recover = vi.fn(alwaysResume);

    const result = await runWithRetry({ attempt, recover });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenNthCalledWith(1, undefined);
    expect(recover).not.toHaveBeenCalled();
  });

  it("resumes with recover()'s instruction after a recoverable failure", async () => {
    const attempt = vi
      .fn<(resume: Resume | undefined) => Promise<string>>()
      .mockRejectedValueOnce(new Error("bad output"))
      .mockResolvedValueOnce("ok");

    const result = await runWithRetry({ attempt, recover: alwaysResume });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
    // First attempt has no resume; the retry carries recover()'s Resume.
    expect(attempt).toHaveBeenNthCalledWith(1, undefined);
    expect(attempt).toHaveBeenNthCalledWith(2, { sessionId: "sess-1", prompt: "fix it" });
  });

  it("stops at maxAttempts and surfaces the last error", async () => {
    const terminal = new Error("still bad");
    const attempt = vi
      .fn<(resume: Resume | undefined) => Promise<string>>()
      .mockRejectedValueOnce(new Error("bad 1"))
      .mockRejectedValueOnce(new Error("bad 2"))
      .mockRejectedValueOnce(terminal);

    await expect(runWithRetry({ attempt, recover: alwaysResume })).rejects.toBe(terminal);
    expect(attempt).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("rethrows immediately when recover() declines (returns undefined)", async () => {
    const nonRecoverable = new Error("fatal");
    const attempt = vi.fn(async () => {
      throw nonRecoverable;
    });
    const recover = vi.fn(() => undefined);

    await expect(runWithRetry({ attempt, recover })).rejects.toBe(nonRecoverable);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("honours a custom maxAttempts cap", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(runWithRetry({ attempt, recover: alwaysResume, maxAttempts: 2 })).rejects.toThrow(
      "always",
    );
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
