import type { SuccessfulDiscoverFetchOutcome } from "./fetch-schedule";

const YOUTUBE_API_ORIGIN = "https://www.googleapis.com/youtube/v3";

export type YouTubeFetch = (url: URL, init?: RequestInit) => Promise<Response>;

export interface YouTubeChannel {
  externalId: string;
  title: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;
  uploadsPlaylistId: string;
}

export interface YouTubeVideo {
  externalId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number;
  source: string;
}

export type YouTubeFailure =
  "invalid_url" | "not_found" | "throttled" | "temporary_failure";

export type ResolveChannelResult =
  { ok: true; channel: YouTubeChannel } | { ok: false; error: YouTubeFailure };

export type FetchChannelVideosResult =
  | {
      ok: true;
      videos: YouTubeVideo[];
      outcome?: SuccessfulDiscoverFetchOutcome;
      skippedCount?: number;
      retryCount?: number;
    }
  | { ok: false; error: YouTubeFailure; retryCount?: number };

type FetchChannelVideosAttempt = Extract<
  FetchChannelVideosResult,
  { ok: true }
> & { missingMetadataCount: number };

interface RetryPolicy {
  budgetMilliseconds: number;
  minDelayMilliseconds: number;
  maxDelayMilliseconds: number;
  randomize: boolean;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  budgetMilliseconds: 30_000,
  minDelayMilliseconds: 250,
  maxDelayMilliseconds: 2_000,
  randomize: true,
};

export interface YouTubeClient {
  resolveChannel(input: { url: string }): Promise<ResolveChannelResult>;
  fetchChannelVideos(input: {
    channel: YouTubeChannel;
  }): Promise<FetchChannelVideosResult>;
}

/** Fail closed when a caller has not supplied the production Provider boundary. */
export const unavailableYouTubeClient: YouTubeClient = {
  resolveChannel: async () => ({ ok: false, error: "temporary_failure" }),
  fetchChannelVideos: async () => ({
    ok: false,
    error: "temporary_failure",
  }),
};

export function createYouTubeClient({
  apiKey,
  fetch,
  now = () => new Date(),
  retry = DEFAULT_RETRY_POLICY,
}: {
  apiKey: string;
  fetch: YouTubeFetch;
  now?: () => Date;
  retry?: RetryPolicy;
}): YouTubeClient {
  return {
    resolveChannel: async ({ url }) => {
      const target = parseChannelUrl(url);
      if (!target) return { ok: false, error: "invalid_url" };

      const acquired = await runWithRetry({
        retry,
        operation: async (signal) => {
          const body = await requestYouTube({
            apiKey,
            fetch,
            resource: "channels",
            query: { part: "id,snippet,contentDetails", ...target },
            signal,
            currentTime: now(),
          });
          const items = objectArrayProperty(body, "items");
          if (items === null || items.length > 1) {
            throw new StableProviderFailure("temporary_failure");
          }
          if (items.length === 0) {
            throw new StableProviderFailure("not_found");
          }
          const channel = readChannel(body);
          if (!channel) throw new StableProviderFailure("temporary_failure");
          return channel;
        },
      });
      return acquired.ok
        ? { ok: true, channel: acquired.value }
        : { ok: false, error: acquired.error };
    },
    fetchChannelVideos: async ({ channel }) => {
      let retainedPartial: FetchChannelVideosAttempt | null = null;
      const acquired = await runWithRetry({
        retry,
        operation: async (signal, attempt) => {
          const attemptResult = await fetchChannelVideosOnce({
            apiKey,
            fetch,
            channel,
            now,
            signal,
          });
          if (attemptResult.outcome === "partial") {
            retainedPartial = mergePartialAttempts(
              retainedPartial,
              attemptResult,
            );
          }
          if (attemptResult.missingMetadataCount > 0 && attempt < 2) {
            throw new RetryableProviderFailure({
              error: "temporary_failure",
              retryAfterMilliseconds: null,
            });
          }
          return attemptResult;
        },
      });
      if (!acquired.ok) {
        if (retainedPartial !== null) {
          return withRetryCount(
            publicFetchResult(retainedPartial),
            acquired.retryCount,
          );
        }
        return {
          ok: false,
          error: acquired.error,
          ...(acquired.retryCount === 0
            ? {}
            : { retryCount: acquired.retryCount }),
        };
      }
      return withRetryCount(
        publicFetchResult(acquired.value),
        acquired.retryCount,
      );
    },
  };
}

async function fetchChannelVideosOnce({
  apiKey,
  fetch,
  channel,
  now,
  signal,
}: {
  apiKey: string;
  fetch: YouTubeFetch;
  channel: YouTubeChannel;
  now: () => Date;
  signal: AbortSignal;
}): Promise<FetchChannelVideosAttempt> {
  const videos: YouTubeVideo[] = [];
  const seenVideoIds = new Set<string>();
  let incompleteMetadataCount = 0;
  let missingMetadataCount = 0;
  let skippedCount = 0;
  const relevanceStart = new Date(
    now().getTime() - 30 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  let pageToken: string | null = null;
  const seenPageTokens = new Set<string>();
  while (true) {
    const playlistBody = await requestYouTube({
      apiKey,
      fetch,
      resource: "playlistItems",
      query: {
        part: "snippet,contentDetails",
        playlistId: channel.uploadsPlaylistId,
        maxResults: "50",
        ...(pageToken === null ? {} : { pageToken }),
      },
      signal,
      currentTime: now(),
    });
    const playlistPage = readPlaylistPage(playlistBody);
    if (!playlistPage) {
      throw new StableProviderFailure("temporary_failure");
    }
    incompleteMetadataCount += playlistPage.invalidItemCount;
    skippedCount += playlistPage.invalidItemCount;
    const newVideoIds = playlistPage.videoIds.filter((videoId) => {
      if (seenVideoIds.has(videoId)) return false;
      seenVideoIds.add(videoId);
      return true;
    });
    if (newVideoIds.length > 0) {
      const videosBody = await requestYouTube({
        apiKey,
        fetch,
        resource: "videos",
        query: {
          part: "snippet,contentDetails,status,liveStreamingDetails,player",
          id: newVideoIds.join(","),
          maxWidth: "1920",
        },
        signal,
        currentTime: now(),
      });
      const pageVideos = readVideos(
        videosBody,
        channel.externalId,
        newVideoIds,
      );
      if (!pageVideos) {
        throw new StableProviderFailure("temporary_failure");
      }
      videos.push(...pageVideos.videos);
      incompleteMetadataCount += pageVideos.incompleteMetadataCount;
      missingMetadataCount += pageVideos.missingMetadataCount;
      skippedCount += pageVideos.skippedCount;
    }
    const coversCandidateWindow = playlistPage.oldestPublishedAt
      ? playlistPage.oldestPublishedAt < relevanceStart
      : false;
    if (
      playlistPage.nextPageToken === null ||
      (coversCandidateWindow && videos.length >= 10)
    ) {
      return {
        ok: true,
        missingMetadataCount,
        videos: videos.sort((left, right) =>
          right.publishedAt.localeCompare(left.publishedAt),
        ),
        ...(incompleteMetadataCount === 0
          ? {}
          : {
              outcome: "partial" as const,
            }),
        ...(skippedCount === 0 ? {} : { skippedCount }),
      };
    }
    if (seenPageTokens.has(playlistPage.nextPageToken)) {
      throw new StableProviderFailure("temporary_failure");
    }
    seenPageTokens.add(playlistPage.nextPageToken);
    pageToken = playlistPage.nextPageToken;
  }
}

function publicFetchResult({
  missingMetadataCount: _missingMetadataCount,
  ...result
}: FetchChannelVideosAttempt): Extract<FetchChannelVideosResult, { ok: true }> {
  return result;
}

function withRetryCount(
  result: Extract<FetchChannelVideosResult, { ok: true }>,
  retryCount: number,
): Extract<FetchChannelVideosResult, { ok: true }> {
  return retryCount === 0 ? result : { ...result, retryCount };
}

function mergePartialAttempts(
  previous: FetchChannelVideosAttempt | null,
  current: FetchChannelVideosAttempt,
): FetchChannelVideosAttempt {
  if (previous === null) return current;
  const videos = new Map(
    previous.videos.map((video) => [video.externalId, video]),
  );
  for (const video of current.videos) videos.set(video.externalId, video);
  return {
    ok: true,
    outcome: "partial",
    videos: [...videos.values()].sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt),
    ),
    missingMetadataCount: Math.min(
      previous.missingMetadataCount,
      current.missingMetadataCount,
    ),
    skippedCount: Math.max(
      previous.skippedCount ?? 0,
      current.skippedCount ?? 0,
    ),
  };
}

function parseChannelUrl(
  value: string,
): { id: string } | { forHandle: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["youtube.com", "m.youtube.com"].includes(hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return null;
  }
  const parts = url.pathname.slice(1).split("/");
  if (parts.at(-1) === "") parts.pop();
  if (parts.some((part) => part.length === 0)) return null;
  if (
    parts.length === 2 &&
    parts[0] === "channel" &&
    /^UC[A-Za-z0-9_-]{22}$/.test(parts[1])
  ) {
    return { id: parts[1] };
  }
  if (
    (parts.length === 1 || (parts.length === 2 && parts[1] === "videos")) &&
    parts[0]?.startsWith("@") &&
    parts[0].length > 1
  ) {
    return { forHandle: parts[0] };
  }
  return null;
}

async function requestYouTube({
  apiKey,
  fetch,
  resource,
  query,
  signal,
  currentTime,
}: {
  apiKey: string;
  fetch: YouTubeFetch;
  resource: string;
  query: Record<string, string>;
  signal: AbortSignal;
  currentTime: Date;
}): Promise<unknown> {
  const url = new URL(`${YOUTUBE_API_ORIGIN}/${resource}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  try {
    const response = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
      signal,
    });
    if (!response.ok) {
      if (
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        throw new RetryableProviderFailure({
          error: response.status === 429 ? "throttled" : "temporary_failure",
          retryAfterMilliseconds: retryAfterMilliseconds(
            response.headers,
            currentTime,
          ),
        });
      }
      throw new StableProviderFailure(
        response.status === 404 ? "not_found" : "temporary_failure",
      );
    }
    try {
      return await response.json();
    } catch {
      throw new StableProviderFailure("temporary_failure");
    }
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    throw new RetryableProviderFailure({
      error: "temporary_failure",
      retryAfterMilliseconds: null,
    });
  }
}

class ProviderFailure extends Error {
  readonly error: Exclude<YouTubeFailure, "invalid_url">;

  constructor(error: Exclude<YouTubeFailure, "invalid_url">) {
    super(error);
    this.name = "ProviderFailure";
    this.error = error;
  }
}

class StableProviderFailure extends ProviderFailure {}

class RetryableProviderFailure extends ProviderFailure {
  readonly retryAfterMilliseconds: number | null;

  constructor({
    error,
    retryAfterMilliseconds,
  }: {
    error: "throttled" | "temporary_failure";
    retryAfterMilliseconds: number | null;
  }) {
    super(error);
    this.retryAfterMilliseconds = retryAfterMilliseconds;
  }
}

async function runWithRetry<T>({
  retry,
  operation,
}: {
  retry: RetryPolicy;
  operation: (signal: AbortSignal, attempt: number) => Promise<T>;
}): Promise<
  | { ok: true; value: T; retryCount: number }
  | {
      ok: false;
      error: Exclude<YouTubeFailure, "invalid_url">;
      retryCount: number;
    }
> {
  const controller = new AbortController();
  const budgetTimer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Provider budget expired", "TimeoutError"),
      ),
    retry.budgetMilliseconds,
  );
  let retryCount = 0;
  let lastRetryableFailure: RetryableProviderFailure | null = null;
  try {
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      try {
        return {
          ok: true,
          value: await operation(controller.signal, attempt),
          retryCount: attempt,
        };
      } catch (error) {
        if (error instanceof StableProviderFailure) {
          return { ok: false, error: error.error, retryCount: attempt };
        }
        const retryable =
          error instanceof RetryableProviderFailure
            ? error
            : new RetryableProviderFailure({
                error: "temporary_failure",
                retryAfterMilliseconds: null,
              });
        retryCount = attempt;
        lastRetryableFailure = retryable;
        if (attempt === 2 || controller.signal.aborted) {
          return {
            ok: false,
            error: retryable.error,
            retryCount: attempt,
          };
        }
        const exponentialDelay = Math.min(
          retry.maxDelayMilliseconds,
          retry.minDelayMilliseconds * 2 ** attempt,
        );
        const fallbackDelay = retry.randomize
          ? exponentialDelay * (0.5 + Math.random() / 2)
          : exponentialDelay;
        // Waiting until YouTube's Retry-After avoids spending the next attempt
        // while the same throttle is known to remain active; the shared budget
        // still aborts an excessive Provider delay.
        await delay(
          Math.max(fallbackDelay, retryable.retryAfterMilliseconds ?? 0),
          controller.signal,
        );
      }
    }
    throw new Error("unreachable retry state");
  } catch (error) {
    return {
      ok: false,
      error:
        lastRetryableFailure?.error ??
        (error instanceof RetryableProviderFailure
          ? error.error
          : "temporary_failure"),
      retryCount,
    };
  } finally {
    clearTimeout(budgetTimer);
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Provider budget expired"),
      );
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function retryAfterMilliseconds(
  headers: Headers,
  currentTime: Date,
): number | null {
  const value = headers.get("retry-after");
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - currentTime.getTime());
}

function readChannel(body: unknown): YouTubeChannel | null {
  const item = objectArrayProperty(body, "items")?.[0];
  if (!isRecord(item)) return null;
  const snippet = recordProperty(item, "snippet");
  const contentDetails = recordProperty(item, "contentDetails");
  const relatedPlaylists = recordProperty(contentDetails, "relatedPlaylists");
  const thumbnails = recordProperty(snippet, "thumbnails");
  const thumbnail = recordProperty(thumbnails, "default");
  const externalId = stringProperty(item, "id");
  const title = stringProperty(snippet, "title");
  const uploadsPlaylistId = stringProperty(relatedPlaylists, "uploads");
  if (!externalId || !title || !uploadsPlaylistId) return null;
  return {
    externalId,
    title,
    thumbnailUrl: stringProperty(thumbnail, "url"),
    canonicalUrl: `https://www.youtube.com/channel/${externalId}`,
    uploadsPlaylistId,
  };
}

function readPlaylistPage(body: unknown): {
  videoIds: string[];
  oldestPublishedAt: string | null;
  nextPageToken: string | null;
  invalidItemCount: number;
} | null {
  const items = objectArrayProperty(body, "items");
  if (!items) return null;
  const videoIds: string[] = [];
  const seenVideoIds = new Set<string>();
  let oldestPublishedAt: string | null = null;
  let invalidItemCount = 0;
  for (const item of items) {
    const videoId = stringProperty(
      recordProperty(item, "contentDetails"),
      "videoId",
    );
    const publishedAt = stringProperty(
      recordProperty(item, "snippet"),
      "publishedAt",
    );
    if (!videoId) {
      invalidItemCount += 1;
      continue;
    }
    if (!seenVideoIds.has(videoId)) {
      seenVideoIds.add(videoId);
      videoIds.push(videoId);
    }
    if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
      invalidItemCount += 1;
    } else if (oldestPublishedAt === null || publishedAt < oldestPublishedAt) {
      oldestPublishedAt = new Date(publishedAt).toISOString();
    }
  }
  return {
    videoIds,
    oldestPublishedAt,
    nextPageToken: stringProperty(body, "nextPageToken"),
    invalidItemCount,
  };
}

function readVideos(
  body: unknown,
  expectedChannelId: string,
  requestedVideoIds: readonly string[],
): {
  videos: YouTubeVideo[];
  incompleteMetadataCount: number;
  missingMetadataCount: number;
  skippedCount: number;
} | null {
  const items = objectArrayProperty(body, "items");
  if (!items) return null;
  const videos: YouTubeVideo[] = [];
  const returnedVideoIds = new Set<string>();
  let incompleteMetadataCount = 0;
  let skippedCount = 0;
  for (const item of items) {
    const externalId = stringProperty(item, "id");
    if (
      externalId === null ||
      !requestedVideoIds.includes(externalId) ||
      returnedVideoIds.has(externalId)
    ) {
      continue;
    }
    returnedVideoIds.add(externalId);
    const classifiedVideo = readVideo(item, expectedChannelId);
    if (classifiedVideo.kind === "accepted") {
      videos.push(classifiedVideo.video);
    }
    if (classifiedVideo.kind !== "accepted") skippedCount += 1;
    if (classifiedVideo.kind === "invalid") incompleteMetadataCount += 1;
  }
  const missingCount = requestedVideoIds.filter(
    (videoId) => !returnedVideoIds.has(videoId),
  ).length;
  incompleteMetadataCount += missingCount;
  skippedCount += missingCount;
  return {
    videos,
    incompleteMetadataCount,
    missingMetadataCount: missingCount,
    skippedCount,
  };
}

function readVideo(
  item: unknown,
  expectedChannelId: string,
):
  | { kind: "accepted"; video: YouTubeVideo }
  | { kind: "ineligible" | "invalid" } {
  const snippet = recordProperty(item, "snippet");
  const contentDetails = recordProperty(item, "contentDetails");
  const status = recordProperty(item, "status");
  const player = recordProperty(item, "player");
  const liveStreamingDetails = recordProperty(item, "liveStreamingDetails");
  const externalId = stringProperty(item, "id");
  const title = stringProperty(snippet, "title");
  const publishedAt = stringProperty(snippet, "publishedAt");
  const channelId = stringProperty(snippet, "channelId");
  const liveBroadcastContent = stringProperty(snippet, "liveBroadcastContent");
  const duration = parseDuration(stringProperty(contentDetails, "duration"));
  const privacyStatus = stringProperty(status, "privacyStatus");
  const uploadStatus = stringProperty(status, "uploadStatus");
  const embeddable = booleanProperty(status, "embeddable");
  const publishedTime =
    publishedAt === null ? Number.NaN : Date.parse(publishedAt);
  const shortLandscape =
    duration !== null &&
    duration <= 180 &&
    positiveNumberProperty(player, "embedWidth") !== null &&
    positiveNumberProperty(player, "embedHeight") !== null &&
    positiveNumberProperty(player, "embedWidth")! >
      positiveNumberProperty(player, "embedHeight")!;
  const upcoming =
    liveBroadcastContent === "upcoming" ||
    (stringProperty(liveStreamingDetails, "scheduledStartTime") !== null &&
      stringProperty(liveStreamingDetails, "actualStartTime") === null);
  if (
    !externalId ||
    !title ||
    !Number.isFinite(publishedTime) ||
    channelId !== expectedChannelId ||
    duration === null ||
    liveBroadcastContent === null ||
    privacyStatus === null ||
    uploadStatus === null ||
    embeddable === null
  ) {
    return { kind: "invalid" };
  }
  if (
    privacyStatus !== "public" ||
    uploadStatus !== "processed" ||
    embeddable !== true ||
    upcoming ||
    (duration <= 180 && !shortLandscape)
  ) {
    return { kind: "ineligible" };
  }
  const thumbnails = recordProperty(snippet, "thumbnails");
  const thumbnail =
    recordProperty(thumbnails, "maxres") ??
    recordProperty(thumbnails, "standard") ??
    recordProperty(thumbnails, "high") ??
    recordProperty(thumbnails, "medium") ??
    recordProperty(thumbnails, "default");
  return {
    kind: "accepted",
    video: {
      externalId,
      title,
      thumbnailUrl: stringProperty(thumbnail, "url"),
      publishedAt: new Date(publishedTime).toISOString(),
      durationSeconds: duration,
      source: `https://www.youtube.com/watch?v=${externalId}`,
    },
  };
}

function parseDuration(value: string | null): number | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3_600 + minutes * 60 + seconds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordProperty(
  value: unknown,
  property: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const propertyValue = value[property];
  return isRecord(propertyValue) ? propertyValue : null;
}

function objectArrayProperty(
  value: unknown,
  property: string,
): unknown[] | null {
  if (!isRecord(value)) return null;
  const propertyValue = value[property];
  return Array.isArray(propertyValue) ? propertyValue : null;
}

function stringProperty(value: unknown, property: string): string | null {
  if (!isRecord(value)) return null;
  const propertyValue = value[property];
  return typeof propertyValue === "string" && propertyValue.length > 0
    ? propertyValue
    : null;
}

function booleanProperty(value: unknown, property: string): boolean | null {
  if (!isRecord(value)) return null;
  const propertyValue = value[property];
  return typeof propertyValue === "boolean" ? propertyValue : null;
}

function positiveNumberProperty(
  value: unknown,
  property: string,
): number | null {
  if (!isRecord(value)) return null;
  const propertyValue = value[property];
  const number =
    typeof propertyValue === "number"
      ? propertyValue
      : typeof propertyValue === "string" && /^[1-9]\d*$/.test(propertyValue)
        ? Number(propertyValue)
        : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}
