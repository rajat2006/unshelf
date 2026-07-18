/**
 * Total attempts before a terminal failure surfaces: one initial run plus up to
 * two resume-with-feedback retries. This is the spec's "retry up to 3×".
 */
export const MAX_ATTEMPTS = 3;

/** Instruction for resuming a failed run: which session to continue, and the
 *  feedback prompt to send it. */
export interface Resume {
  readonly sessionId: string;
  readonly prompt: string;
}

export interface RetryControl<R> {
  /**
   * Perform one attempt. `resume` is `undefined` on the first attempt; on a
   * retry it carries the session to resume and the feedback prompt to send.
   */
  readonly attempt: (resume: Resume | undefined) => Promise<R>;
  /**
   * Inspect a thrown error. Return a {@link Resume} to retry by resuming that
   * session, or `undefined` to treat the error as terminal and rethrow it.
   */
  readonly recover: (error: unknown) => Resume | undefined;
  /** Attempt cap (default {@link MAX_ATTEMPTS}). */
  readonly maxAttempts?: number;
}

/**
 * Resume-on-error retry loop — the pure control flow at the `sandcastle.run()`
 * boundary. Runs `attempt`; when it rejects with an error `recover` deems
 * recoverable, resumes that session with feedback and tries again, up to
 * `maxAttempts` total. A non-recoverable error, or exhausting the attempts,
 * surfaces the last error unchanged.
 *
 * All I/O is injected via `attempt`/`recover`, so the whole policy is exercised
 * by a fake in tests — no real agent, no network.
 */
export async function runWithRetry<R>({
  attempt,
  recover,
  maxAttempts = MAX_ATTEMPTS,
}: RetryControl<R>): Promise<R> {
  let resume: Resume | undefined;
  for (let remaining = maxAttempts; ; remaining--) {
    try {
      return await attempt(resume);
    } catch (error) {
      // On the final allowed attempt, don't even try to recover — surface it.
      const next = remaining > 1 ? recover(error) : undefined;
      if (next === undefined) throw error;
      resume = next;
    }
  }
}
