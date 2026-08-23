export const DISCOVER_FETCH_OUTCOMES = [
  "complete",
  "partial",
  "failed",
  "throttled",
] as const;

export type DiscoverFetchOutcome = (typeof DISCOVER_FETCH_OUTCOMES)[number];
export type SuccessfulDiscoverFetchOutcome = Extract<
  DiscoverFetchOutcome,
  "complete" | "partial"
>;

const CHANNEL_REFRESH_MILLISECONDS = 60 * 60 * 1_000;

/** Return when a freshly fetched channel becomes due again. */
export function nextDiscoverFetchAt(fetchedAt: Date): Date {
  return new Date(fetchedAt.getTime() + CHANNEL_REFRESH_MILLISECONDS);
}
