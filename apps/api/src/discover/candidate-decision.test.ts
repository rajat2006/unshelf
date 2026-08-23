import { describe, expect, it } from "vitest";
import { CandidateState } from "@unshelf/shared";
import { candidateDecisionTransition } from "./candidate-decision";

describe("candidateDecisionTransition", () => {
  it.each([
    {
      current: CandidateState.Pending,
      requested: CandidateState.Kept,
      expected: "apply",
    },
    {
      current: CandidateState.Pending,
      requested: CandidateState.Rejected,
      expected: "apply",
    },
    {
      current: CandidateState.Kept,
      requested: CandidateState.Kept,
      expected: "replay",
    },
    {
      current: CandidateState.Rejected,
      requested: CandidateState.Rejected,
      expected: "replay",
    },
    {
      current: CandidateState.Kept,
      requested: CandidateState.Rejected,
      expected: "conflict",
    },
    {
      current: CandidateState.Rejected,
      requested: CandidateState.Kept,
      expected: "conflict",
    },
  ] as const)(
    "$current + $requested -> $expected",
    ({ current, requested, expected }) => {
      expect(candidateDecisionTransition({ current, requested })).toBe(
        expected,
      );
    },
  );
});
