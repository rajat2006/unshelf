import type { StructuredOutputError } from "@ai-hero/sandcastle";

/**
 * Build the token-efficient feedback prompt that asks the agent to re-emit a
 * corrected structured-output block, given the extraction/validation failure
 * `run()` threw.
 *
 * Pure: it derives only from the error's own fields, so the message a resume
 * attempt sends is exactly what a unit test can assert on. It names the expected
 * tag, echoes back what (if anything) was matched, surfaces the underlying
 * parse/validation cause, and asks for exactly one corrected block with nothing
 * else changed.
 */
export function retryFeedback(error: StructuredOutputError): string {
  const matched =
    error.rawMatched === undefined
      ? `No <${error.tag}> block was found in your output.`
      : `The <${error.tag}> block you emitted could not be used:\n${error.rawMatched}`;
  const cause = describeCause(error.cause);
  return [
    `Your previous response did not produce a valid <${error.tag}> output block.`,
    matched,
    cause ? `Problem: ${cause}` : undefined,
    `Re-emit exactly one <${error.tag}>...</${error.tag}> block that fixes this. Change nothing else.`,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n\n");
}

/** Reduce an unknown `cause` to a short human-readable line, or nothing. */
function describeCause(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) return undefined;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
