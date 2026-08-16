import { z } from "zod";
import pRetry from "p-retry";
import {
  Type,
  type FollowPreviewVideo,
  type PrepareFollowFailure,
} from "@unshelf/shared";

const youtubeApiOrigin = "https://www.googleapis.com/youtube/v3";
const lookbackMilliseconds = 30 * 24 * 60 * 60 * 1_000;
const maxPreviewVideos = 10;

export type ProviderFetch = (
  input: URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ProviderPreview {
  ok: true;
  outcome: "preview" | "partial" | "empty";
  channelId: string;
  uploadsPlaylistId: string;
  publisher: string;
  videos: FollowPreviewVideo[];
  rejectedCount: number;
  coverageStartedAt: string;
  retryCount?: number;
}

export type ProviderPreviewResult =
  | ProviderPreview
  | {
      ok: false;
      error: PrepareFollowFailure;
      nextEligibleAt?: string;
      retryCount?: number;
    };

interface RetryPolicy {
  budgetMilliseconds: number;
  minDelayMilliseconds: number;
  maxDelayMilliseconds: number;
  randomize: boolean;
}

const defaultRetryPolicy: RetryPolicy = {
  budgetMilliseconds: 30_000,
  minDelayMilliseconds: 250,
  maxDelayMilliseconds: 2_000,
  randomize: true,
};

export interface YouTubeAdapter {
  previewChannel(input: { url: string }): Promise<ProviderPreviewResult>;
  acquireChannel(input: { channelId: string }): Promise<ProviderPreviewResult>;
}

export function createYouTubeAdapter({
  apiKey,
  fetch,
  now,
  retry = defaultRetryPolicy,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  now: () => Date;
  retry?: RetryPolicy;
}): YouTubeAdapter {
  const acquire = (
    input: Parameters<typeof acquireChannelResults>[0],
  ): Promise<ProviderPreviewResult> =>
    acquireWithRetry({ input, now, retry });
  return {
    previewChannel: async ({ url }) => {
      const target = parseChannelUrl(url);
      if (target === null) return { ok: false, error: "unsupported_target" };
      return acquire({
        apiKey,
        fetch,
        now,
        target,
        resultLimit: maxPreviewVideos,
      });
    },
    acquireChannel: ({ channelId }) =>
      acquire({
        apiKey,
        fetch,
        now,
        target: { id: channelId },
      }),
  };
}

async function acquireWithRetry({
  input,
  now,
  retry,
}: {
  input: Parameters<typeof acquireChannelResults>[0];
  now: () => Date;
  retry: RetryPolicy;
}): Promise<ProviderPreviewResult> {
  const signal = AbortSignal.timeout(retry.budgetMilliseconds);
  const fetchWithinBudget: ProviderFetch = (url, init) =>
    input.fetch(url, { ...init, signal });
  let retryCount = 0;
  try {
    const result = await pRetry(
      (attemptNumber) => {
        retryCount = attemptNumber - 1;
        return acquireChannelResults({ ...input, fetch: fetchWithinBudget });
      },
      {
        retries: 2,
        minTimeout: 0,
        maxRetryTime: retry.budgetMilliseconds,
        signal,
        onFailedAttempt: async ({ error, attemptNumber, retriesLeft }) => {
          if (!(error instanceof RetryableProviderError) || retriesLeft === 0) {
            return;
          }
          const fallback = Math.min(
            retry.maxDelayMilliseconds,
            retry.minDelayMilliseconds * 2 ** (attemptNumber - 1),
          );
          const jittered = retry.randomize
            ? fallback * (1 + Math.random())
            : fallback;
          const providerDelay =
            error.retryAt === null
              ? 0
              : Math.max(0, error.retryAt.getTime() - now().getTime());
          await delay(Math.max(jittered, providerDelay), signal);
        },
        shouldRetry: ({ error }) => error instanceof RetryableProviderError,
      },
    );
    return retryCount === 0 ? result : { ...result, retryCount };
  } catch (error) {
    return {
      ok: false,
      error: "provider_unavailable",
      ...(error instanceof RetryableProviderError && error.retryAt !== null
        ? { nextEligibleAt: error.retryAt.toISOString() }
        : {}),
      ...(retryCount === 0 ? {} : { retryCount }),
    };
  }
}

class RetryableProviderError extends Error {
  readonly retryAt: Date | null;

  constructor({ retryAt }: { retryAt: Date | null }) {
    super("retryable_provider_failure");
    this.name = "RetryableProviderError";
    this.retryAt = retryAt;
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Provider attempt budget expired"),
      );
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function acquireChannelResults({
  apiKey,
  fetch,
  now,
  target,
  resultLimit,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  now: () => Date;
  target: Partial<Record<"id" | "forHandle" | "forUsername", string>>;
  resultLimit?: number;
}): Promise<ProviderPreviewResult> {
  try {
    const channelResult = await requestJson({
      apiKey,
      fetch,
      now,
      resource: "channels",
      query: { part: "id,snippet,contentDetails", ...target },
    });
    if (!channelResult.ok) return channelResult;
    const parsedChannel = channelResponseSchema.safeParse(channelResult.body);
    if (!parsedChannel.success) return { ok: false, error: "unverifiable" };
    if (parsedChannel.data.items.length === 0) {
      return { ok: false, error: "invalid_target" };
    }
    if (parsedChannel.data.items.length !== 1) {
      return { ok: false, error: "unverifiable" };
    }
    const channel = parsedChannel.data.items[0];
    const coverageStartedAt = new Date(
      now().getTime() - lookbackMilliseconds,
    ).toISOString();
    const playlist = await readUploadsPlaylist({
      apiKey,
      fetch,
      uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
      coverageStartedAt,
      now,
    });
    if (!playlist.ok) return playlist;

    const videos = await readVideos({
      apiKey,
      fetch,
      videoIds: playlist.videoIds,
      expectedChannelId: channel.id,
      coverageStartedAt,
      now,
    });
    if (!videos.ok) return videos;
    const orderedVideos = videos.videos.sort((left, right) =>
      right.publishedAt.localeCompare(left.publishedAt),
    );
    const retainedVideos =
      resultLimit === undefined
        ? orderedVideos
        : orderedVideos.slice(0, resultLimit);
    const rejectedCount = videos.rejectedCount;

    return {
      ok: true,
      outcome:
        rejectedCount > 0
          ? "partial"
          : retainedVideos.length === 0
            ? "empty"
            : "preview",
      channelId: channel.id,
      uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
      publisher: channel.snippet.title,
      videos: retainedVideos,
      rejectedCount,
      coverageStartedAt,
    };
  } catch (error) {
    if (error instanceof RetryableProviderError) throw error;
    return { ok: false, error: "provider_unavailable" };
  }
}

function parseChannelUrl(
  value: string,
):
  | Record<"id" | "forHandle" | "forUsername", string>
  | Partial<Record<"id" | "forHandle" | "forUsername", string>>
  | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    url.protocol !== "https:" ||
    (host !== "youtube.com" && host !== "m.youtube.com")
  ) {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1 && parts.length !== 2) return null;
  if (parts.length === 1 && parts[0].startsWith("@") && parts[0].length > 1) {
    return { forHandle: parts[0] };
  }
  if (parts.length === 2 && parts[0] === "channel" && parts[1].length > 0) {
    return { id: parts[1] };
  }
  if (parts.length === 2 && parts[0] === "user" && parts[1].length > 0) {
    return { forUsername: parts[1] };
  }
  return null;
}

async function readUploadsPlaylist({
  apiKey,
  fetch,
  uploadsPlaylistId,
  coverageStartedAt,
  now,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  uploadsPlaylistId: string;
  coverageStartedAt: string;
  now: () => Date;
}): Promise<
  { ok: true; videoIds: string[] } | { ok: false; error: PrepareFollowFailure }
> {
  const videoIds: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let previousPublishedAt: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await requestJson({
      apiKey,
      fetch,
      now,
      resource: "playlistItems",
      query: {
        part: "snippet,contentDetails,status",
        playlistId: uploadsPlaylistId,
        maxResults: "50",
        ...(pageToken === undefined ? {} : { pageToken }),
      },
    });
    if (!response.ok) return response;
    const parsed = playlistResponseSchema.safeParse(response.body);
    if (!parsed.success) return { ok: false, error: "unverifiable" };

    let reachedBoundary = false;
    for (const item of parsed.data.items) {
      const publishedAt =
        item.contentDetails.videoPublishedAt ?? item.snippet.publishedAt;
      if (
        previousPublishedAt !== undefined &&
        publishedAt > previousPublishedAt
      ) {
        return { ok: false, error: "unverifiable" };
      }
      previousPublishedAt = publishedAt;
      if (publishedAt < coverageStartedAt) {
        reachedBoundary = true;
        continue;
      }
      const videoId =
        item.contentDetails.videoId ?? item.snippet.resourceId.videoId;
      if (item.snippet.resourceId.videoId !== videoId || seen.has(videoId)) {
        return { ok: false, error: "unverifiable" };
      }
      seen.add(videoId);
      videoIds.push(videoId);
    }
    if (reachedBoundary || parsed.data.nextPageToken === undefined) {
      return { ok: true, videoIds };
    }
    pageToken = parsed.data.nextPageToken;
  }
  return { ok: false, error: "unverifiable" };
}

async function readVideos({
  apiKey,
  fetch,
  videoIds,
  expectedChannelId,
  coverageStartedAt,
  now,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  videoIds: string[];
  expectedChannelId: string;
  coverageStartedAt: string;
  now: () => Date;
}): Promise<
  | { ok: true; videos: FollowPreviewVideo[]; rejectedCount: number }
  | { ok: false; error: PrepareFollowFailure }
> {
  if (videoIds.length === 0) return { ok: true, videos: [], rejectedCount: 0 };
  const validItems: VideoResource[] = [];
  const invalidIds = new Set<string>();
  let invalidCount = 0;
  const returnedIds = new Set<string>();
  for (let offset = 0; offset < videoIds.length; offset += 50) {
    const batchIds = videoIds.slice(offset, offset + 50);
    const response = await requestJson({
      apiKey,
      fetch,
      now,
      resource: "videos",
      query: {
        part: "snippet,contentDetails,status,liveStreamingDetails,player",
        id: batchIds.join(","),
        maxWidth: "1920",
      },
    });
    if (!response.ok) return response;
    const parsed = videoResponseSchema.safeParse(response.body);
    if (!parsed.success) return { ok: false, error: "unverifiable" };
    for (const candidate of parsed.data.items) {
      const item = videoResourceSchema.safeParse(candidate);
      if (item.success) {
        if (!batchIds.includes(item.data.id) || returnedIds.has(item.data.id)) {
          return { ok: false, error: "unverifiable" };
        }
        returnedIds.add(item.data.id);
        validItems.push(item.data);
      } else {
        if (
          typeof candidate === "object" &&
          candidate !== null &&
          "id" in candidate &&
          typeof candidate.id === "string" &&
          batchIds.includes(candidate.id) &&
          !invalidIds.has(candidate.id)
        ) {
          invalidIds.add(candidate.id);
          invalidCount += 1;
        } else {
          return { ok: false, error: "unverifiable" };
        }
      }
    }
  }

  const videos: FollowPreviewVideo[] = [];
  const rejectedCount = invalidCount;
  for (const item of validItems) {
    const durationSeconds = parseDuration(item.contentDetails.duration);
    const thumbnail = preferredThumbnail(item.snippet.thumbnails);
    const isLong = durationSeconds !== null && durationSeconds > 180;
    const isLandscapeShort =
      durationSeconds !== null &&
      durationSeconds <= 180 &&
      item.player?.embedWidth !== undefined &&
      item.player.embedHeight !== undefined &&
      item.player.embedWidth > item.player.embedHeight;
    const playable =
      item.snippet.channelId === expectedChannelId &&
      item.snippet.publishedAt >= coverageStartedAt &&
      item.snippet.liveBroadcastContent === "none" &&
      item.liveStreamingDetails === undefined &&
      item.status.privacyStatus === "public" &&
      item.status.uploadStatus === "processed" &&
      item.status.embeddable === true;
    if (!playable || (!isLong && !isLandscapeShort)) {
      continue;
    }
    videos.push({
      provider: "youtube",
      providerIdentity: item.id,
      title: item.snippet.title,
      source: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`,
      publisher: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      durationSeconds,
      type: Type.Video,
      thumbnailUrl: thumbnail?.url ?? null,
    });
  }
  return { ok: true, videos, rejectedCount };
}

async function requestJson({
  apiKey,
  fetch,
  now,
  resource,
  query,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  now: () => Date;
  resource: string;
  query: Record<string, string>;
}): Promise<
  { ok: true; body: unknown } | { ok: false; error: PrepareFollowFailure }
> {
  const url = new URL(`${youtubeApiOrigin}/${resource}`);
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
    });
  } catch {
    throw new RetryableProviderError({ retryAt: null });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (isRetryableStatus(response.status)) {
      throw new RetryableProviderError({
        retryAt: providerRetryAt(response.headers, now()),
      });
    }
    return { ok: false, error: "unverifiable" };
  }
  if (response.ok) return { ok: true, body };
  if (response.status === 403 && quotaResponseSchema.safeParse(body).success) {
    const retryAt = providerRetryAt(response.headers, now());
    return {
      ok: false,
      error: "quota_exceeded",
      ...(retryAt === null ? {} : { nextEligibleAt: retryAt.toISOString() }),
    };
  }
  if (response.status === 400 || response.status === 404) {
    return { ok: false, error: "invalid_target" };
  }
  if (isRetryableStatus(response.status)) {
    throw new RetryableProviderError({
      retryAt: providerRetryAt(response.headers, now()),
    });
  }
  return { ok: false, error: "provider_unavailable" };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function providerRetryAt(headers: Headers, currentTime: Date): Date | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(currentTime.getTime() + seconds * 1_000);
    }
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const reset = headers.get("x-ratelimit-reset");
  if (reset !== null) {
    const seconds = Number(reset);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(seconds * 1_000);
    }
  }
  return null;
}

function parseDuration(value: string): number | null {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (match === null) return null;
  return (
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3_600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0)
  );
}

const thumbnailSchema = z.object({
  url: z.url(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});
const thumbnailsSchema = z.record(z.string(), thumbnailSchema);
type Thumbnail = z.infer<typeof thumbnailSchema>;

function preferredThumbnail(
  thumbnails: z.infer<typeof thumbnailsSchema>,
): Thumbnail | undefined {
  return (
    thumbnails.maxres ??
    thumbnails.standard ??
    thumbnails.high ??
    thumbnails.medium ??
    thumbnails.default
  );
}

const channelResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      snippet: z.object({ title: z.string().min(1) }),
      contentDetails: z.object({
        relatedPlaylists: z.object({ uploads: z.string().min(1) }),
      }),
    }),
  ),
});

const playlistResponseSchema = z.object({
  items: z.array(
    z.object({
      snippet: z.object({
        publishedAt: z.iso.datetime(),
        resourceId: z.object({
          kind: z.literal("youtube#video"),
          videoId: z.string().min(1),
        }),
      }),
      contentDetails: z.object({
        videoId: z.string().min(1).optional(),
        videoPublishedAt: z.iso.datetime().optional(),
      }),
    }),
  ),
  nextPageToken: z.string().min(1).optional(),
});

const videoResourceSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    title: z.string().min(1),
    channelId: z.string().min(1),
    channelTitle: z.string().min(1),
    publishedAt: z.iso.datetime(),
    liveBroadcastContent: z.enum(["none", "upcoming", "live"]),
    thumbnails: thumbnailsSchema,
  }),
  contentDetails: z.object({ duration: z.string().min(1) }),
  status: z.object({
    privacyStatus: z.enum(["public", "private", "unlisted"]),
    uploadStatus: z.string(),
    embeddable: z.boolean(),
  }),
  player: z
    .object({
      embedWidth: z.number().positive().optional(),
      embedHeight: z.number().positive().optional(),
    })
    .optional(),
  liveStreamingDetails: z.object({}).passthrough().optional(),
});
type VideoResource = z.infer<typeof videoResourceSchema>;

const videoResponseSchema = z.object({
  items: z.array(z.unknown()),
});

const quotaResponseSchema = z.object({
  error: z.object({
    errors: z
      .array(
        z.object({ reason: z.enum(["quotaExceeded", "dailyLimitExceeded"]) }),
      )
      .min(1),
  }),
});
