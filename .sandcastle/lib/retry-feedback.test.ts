import { StructuredOutputError } from "@ai-hero/sandcastle";
import { describe, expect, it } from "vitest";
import { retryFeedback } from "./retry-feedback";

/** Build a StructuredOutputError the way `run()` throws one. */
const outputError = (overrides: {
  tag?: string;
  rawMatched?: string | undefined;
  cause?: unknown;
}): StructuredOutputError =>
  new StructuredOutputError("structured output extraction failed", {
    tag: overrides.tag ?? "output",
    rawMatched: "rawMatched" in overrides ? overrides.rawMatched : undefined,
    cause: overrides.cause,
    commits: [],
    branch: "agent/issue-1-x",
    sessionId: "sess-1",
  });

describe("retryFeedback — the resume prompt built from a StructuredOutputError", () => {
  it("names the expected tag and asks for exactly one corrected block", () => {
    const feedback = retryFeedback(outputError({ tag: "review" }));

    expect(feedback).toContain("<review>");
    expect(feedback).toContain("Re-emit exactly one <review>...</review> block");
    expect(feedback).toContain("Change nothing else.");
  });

  it("reports a missing block when nothing was matched", () => {
    const feedback = retryFeedback(outputError({ tag: "output", rawMatched: undefined }));

    expect(feedback).toContain("No <output> block was found");
  });

  it("echoes the offending block back when one was matched", () => {
    const feedback = retryFeedback(
      outputError({ tag: "output", rawMatched: "<output>{ not json }</output>" }),
    );

    expect(feedback).toContain("could not be used");
    expect(feedback).toContain("<output>{ not json }</output>");
  });

  it("surfaces an Error cause's message", () => {
    const feedback = retryFeedback(
      outputError({ cause: new SyntaxError("Unexpected token } in JSON") }),
    );

    expect(feedback).toContain("Problem: Unexpected token } in JSON");
  });

  it("omits the Problem line when there is no cause", () => {
    const feedback = retryFeedback(outputError({ cause: undefined }));

    expect(feedback).not.toContain("Problem:");
  });
});
