export type UnresolvedThreadSetVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export interface ReviewThreadPage {
  readonly nodes: readonly {
    readonly id: string;
    readonly isResolved: boolean;
  }[];
  readonly pageInfo: {
    readonly hasNextPage: boolean;
    readonly endCursor: string | null;
  };
}

export async function collectUnresolvedThreadIds({
  loadPage,
}: {
  loadPage: (after: string | undefined) => Promise<ReviewThreadPage>;
}): Promise<readonly string[]> {
  const ids: string[] = [];
  const cursors = new Set<string>();
  let after: string | undefined;

  do {
    const page = await loadPage(after);
    ids.push(
      ...page.nodes
        .filter((thread) => !thread.isResolved)
        .map((thread) => thread.id),
    );
    if (!page.pageInfo.hasNextPage) return ids;

    const next = page.pageInfo.endCursor;
    if (!next || cursors.has(next)) {
      throw new Error(
        "GitHub returned an invalid review-thread pagination cursor.",
      );
    }
    cursors.add(next);
    after = next;
  } while (true);
}

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
