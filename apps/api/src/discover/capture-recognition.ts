import { and, eq, isNull } from "drizzle-orm";
import type { ItemId, UserId } from "@unshelf/shared";
import type { Database } from "../db";
import { discoverCandidates, discoverProviderResults } from "../schema";

type CaptureRecognitionDatabase = Pick<Database, "select" | "update">;

/**
 * Link a manual Capture only when its canonical watch Source proves an exact,
 * currently retained YouTube identity. Recognition is local and best-effort:
 * it never fetches, deduplicates Items, or guesses from title/Source equality.
 */
export async function linkCapturedItemToRetainedCandidate({
  db,
  userId,
  itemId,
  source,
}: {
  db: CaptureRecognitionDatabase;
  userId: UserId;
  itemId: ItemId;
  source: string | null;
}): Promise<void> {
  const externalReference = canonicalYouTubeVideoId(source);
  if (externalReference === null) return;

  const [candidate] = await db
    .select({ id: discoverCandidates.id })
    .from(discoverCandidates)
    .innerJoin(
      discoverProviderResults,
      eq(discoverProviderResults.id, discoverCandidates.providerResultId),
    )
    .where(
      and(
        eq(discoverCandidates.userId, userId),
        isNull(discoverCandidates.itemId),
        eq(discoverProviderResults.provider, "youtube"),
        eq(discoverProviderResults.externalReference, externalReference),
      ),
    )
    .limit(1);
  if (candidate === undefined) return;

  await db
    .update(discoverCandidates)
    .set({ itemId })
    .where(
      and(
        eq(discoverCandidates.id, candidate.id),
        eq(discoverCandidates.userId, userId),
        isNull(discoverCandidates.itemId),
      ),
    );
}

function canonicalYouTubeVideoId(source: string | null): string | null {
  if (source === null) return null;
  const match =
    /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{1,64})$/.exec(
      source,
    );
  return match?.[1] ?? null;
}
