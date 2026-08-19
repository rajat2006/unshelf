export type UnresolvedThreadSetVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export function verifyUnresolvedThreadSet({
  expected,
  current,
}: {
  expected: readonly string[];
  current: readonly string[];
}): UnresolvedThreadSetVerdict {
  const expectedIds = [...new Set(expected)].sort();
  const currentIds = [...new Set(current)].sort();
  if (
    expectedIds.length !== expected.length ||
    currentIds.length !== current.length
  ) {
    return { ok: false, error: "The unresolved review-thread set is malformed." };
  }
  if (
    expectedIds.length !== currentIds.length ||
    expectedIds.some((id, index) => id !== currentIds[index])
  ) {
    return {
      ok: false,
      error:
        "The unresolved review-thread set changed after agent inspection; refusing stale publication.",
    };
  }
  return { ok: true };
}
