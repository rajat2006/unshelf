import { describe, expect, it } from "vitest";
import { updateBranchOutputSchema } from "./update-branch-output";

/** A minimal well-formed conflict resolution, spread-overridable per test. */
function conflict(overrides: Record<string, unknown> = {}) {
  return {
    file: "apps/web/src/trail/geometry.ts",
    resolution: "Kept the branch's new signature and re-applied main's rename.",
    ...overrides,
  };
}

describe("updateBranchOutputSchema — the update-branch <output> contract", () => {
  it("accepts a merge that resolved conflicts", () => {
    const parsed = updateBranchOutputSchema.parse({
      summary: "Merged main into the branch, resolving 2 conflicts.",
      alreadyCurrent: false,
      conflicts: [conflict(), conflict({ file: "CONTEXT.md" })],
    });
    expect(parsed.conflicts).toHaveLength(2);
    expect(parsed.alreadyCurrent).toBe(false);
  });

  it("accepts a clean merge with zero conflicts", () => {
    const parsed = updateBranchOutputSchema.parse({
      summary: "Merged main cleanly; no conflicts.",
      alreadyCurrent: false,
      conflicts: [],
    });
    expect(parsed.conflicts).toEqual([]);
  });

  it("accepts an already-current branch (no-op merge)", () => {
    const parsed = updateBranchOutputSchema.parse({
      summary: "Branch is already current with main; nothing to do.",
      alreadyCurrent: true,
      conflicts: [],
    });
    expect(parsed.alreadyCurrent).toBe(true);
  });

  it("rejects an already-current run that also claims conflicts", () => {
    expect(() =>
      updateBranchOutputSchema.parse({
        summary: "contradictory",
        alreadyCurrent: true,
        conflicts: [conflict()],
      }),
    ).toThrow();
  });

  it("rejects a missing summary", () => {
    expect(() =>
      updateBranchOutputSchema.parse({ alreadyCurrent: false, conflicts: [] }),
    ).toThrow();
  });

  it("rejects an empty summary", () => {
    expect(() =>
      updateBranchOutputSchema.parse({
        summary: "",
        alreadyCurrent: false,
        conflicts: [],
      }),
    ).toThrow();
  });

  it("rejects a non-boolean alreadyCurrent", () => {
    expect(() =>
      updateBranchOutputSchema.parse({
        summary: "s",
        alreadyCurrent: "no",
        conflicts: [],
      }),
    ).toThrow();
  });

  it("rejects a missing alreadyCurrent", () => {
    expect(() =>
      updateBranchOutputSchema.parse({ summary: "s", conflicts: [] }),
    ).toThrow();
  });

  it("rejects a missing conflicts array", () => {
    expect(() =>
      updateBranchOutputSchema.parse({ summary: "s", alreadyCurrent: false }),
    ).toThrow();
  });

  it("rejects a conflict missing its file", () => {
    const { file: _file, ...noFile } = conflict();
    expect(() =>
      updateBranchOutputSchema.parse({
        summary: "s",
        alreadyCurrent: false,
        conflicts: [noFile],
      }),
    ).toThrow();
  });

  it("rejects an empty file or resolution", () => {
    for (const key of ["file", "resolution"]) {
      expect(() =>
        updateBranchOutputSchema.parse({
          summary: "s",
          alreadyCurrent: false,
          conflicts: [conflict({ [key]: "" })],
        }),
      ).toThrow();
    }
  });
});
