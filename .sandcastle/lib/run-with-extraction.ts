import { StructuredOutputError } from "@ai-hero/sandcastle";
import type { OutputDefinition, RunOptions, RunResult } from "@ai-hero/sandcastle";
import { retryFeedback } from "./retry-feedback";
import { MAX_ATTEMPTS, runWithRetry, type Resume } from "./run-with-retry";

/** Run options that carry a structured `output` definition to extract. */
export type ExtractionOptions = RunOptions & { output: OutputDefinition };

/**
 * The one seam this wrapper depends on: Sandcastle's `run()`, narrowed to a call
 * that carries a structured `output` and resolves to a result whose `output` is
 * the extracted value `T`. Injected so tests drive a fake in its place.
 */
export type ExtractingRun<T> = (
  options: ExtractionOptions,
) => Promise<RunResult & { output: T }>;

export interface RunWithExtractionParams<T> {
  /** The injected `run()` — real in production, a fake in tests. */
  readonly run: ExtractingRun<T>;
  /** Base run options, including the `output` definition to extract. */
  readonly options: ExtractionOptions;
  /** Attempt cap (default {@link MAX_ATTEMPTS}). */
  readonly maxAttempts?: number;
}

/**
 * Run a structured-output capability with same-session retry.
 *
 * Calls `run(options)`. On a {@link StructuredOutputError} that carries a
 * resumable `sessionId`, resumes that session with a feedback prompt (see
 * {@link retryFeedback}) and re-extracts, up to `maxAttempts` total. Any other
 * error, a {@link StructuredOutputError} without a `sessionId` (nothing to
 * resume), or exhausting the attempts surfaces the failure to the caller
 * unchanged.
 */
export function runWithExtraction<T>({
  run,
  options,
  maxAttempts = MAX_ATTEMPTS,
}: RunWithExtractionParams<T>): Promise<RunResult & { output: T }> {
  return runWithRetry<RunResult & { output: T }>({
    maxAttempts,
    attempt: (resume) => run(resume ? resumeOptions(options, resume) : options),
    recover: (error) =>
      error instanceof StructuredOutputError && error.sessionId
        ? { sessionId: error.sessionId, prompt: retryFeedback(error) }
        : undefined,
  });
}

/**
 * Rebuild the run options for a resume attempt: continue the failed session and
 * send the feedback as an inline `prompt`. `prompt` and `promptFile` are
 * mutually exclusive on `run()`, so any original `promptFile` is dropped in
 * favour of the feedback prompt.
 */
function resumeOptions(
  options: ExtractionOptions,
  resume: Resume,
): ExtractionOptions {
  const { promptFile: _promptFile, ...rest } = options;
  return { ...rest, resumeSession: resume.sessionId, prompt: resume.prompt };
}
