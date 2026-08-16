import { z } from "zod";
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
}

export type ProviderPreviewResult =
  ProviderPreview | { ok: false; error: PrepareFollowFailure };

export interface YouTubeAdapter {
  previewChannel(input: { url: string }): Promise<ProviderPreviewResult>;
}

export function createYouTubeAdapter({
  apiKey,
  fetch,
  now,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  now: () => Date;
}): YouTubeAdapter {
  return {
    previewChannel: async ({ url }) => {
      const target = parseChannelUrl(url);
      if (target === null) return { ok: false, error: "unsupported_target" };

      try {
        const channelResult = await requestJson({
          apiKey,
          fetch,
          resource: "channels",
          query: { part: "id,snippet,contentDetails", ...target },
        });
        if (!channelResult.ok) return channelResult;
        const parsedChannel = channelResponseSchema.safeParse(
          channelResult.body,
        );
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
        });
        if (!playlist.ok) return playlist;

        const videos = await readVideos({
          apiKey,
          fetch,
          videoIds: playlist.videoIds,
          expectedChannelId: channel.id,
          coverageStartedAt,
        });
        if (!videos.ok) return videos;
        const orderedVideos = videos.videos
          .sort((left, right) =>
            right.publishedAt.localeCompare(left.publishedAt),
          )
          .slice(0, maxPreviewVideos);
        const rejectedCount = videos.rejectedCount;

        return {
          ok: true,
          outcome:
            rejectedCount > 0
              ? "partial"
              : orderedVideos.length === 0
                ? "empty"
                : "preview",
          channelId: channel.id,
          uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
          publisher: channel.snippet.title,
          videos: orderedVideos,
          rejectedCount,
          coverageStartedAt,
        };
      } catch {
        return { ok: false, error: "provider_unavailable" };
      }
    },
  };
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
}: {
  apiKey: string;
  fetch: ProviderFetch;
  uploadsPlaylistId: string;
  coverageStartedAt: string;
}): Promise<
  { ok: true; videoIds: string[] } | { ok: false; error: PrepareFollowFailure }
> {
  const videoIds: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await requestJson({
      apiKey,
      fetch,
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
}: {
  apiKey: string;
  fetch: ProviderFetch;
  videoIds: string[];
  expectedChannelId: string;
  coverageStartedAt: string;
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
      resource: "videos",
      query: {
        part: "snippet,contentDetails,status,liveStreamingDetails",
        id: batchIds.join(","),
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
        invalidCount += 1;
        if (
          typeof candidate === "object" &&
          candidate !== null &&
          "id" in candidate &&
          typeof candidate.id === "string"
        ) {
          invalidIds.add(candidate.id);
        }
      }
    }
  }

  const videos: FollowPreviewVideo[] = [];
  let rejectedCount =
    invalidCount +
    videoIds.filter((id) => !returnedIds.has(id) && !invalidIds.has(id)).length;
  for (const item of validItems) {
    const durationSeconds = parseDuration(item.contentDetails.duration);
    const thumbnail = preferredThumbnail(item.snippet.thumbnails);
    const isLong = durationSeconds !== null && durationSeconds > 180;
    const isLandscapeShort =
      durationSeconds !== null &&
      durationSeconds <= 180 &&
      thumbnail?.width !== undefined &&
      thumbnail.height !== undefined &&
      thumbnail.width > thumbnail.height;
    const playable =
      item.snippet.channelId === expectedChannelId &&
      item.snippet.publishedAt >= coverageStartedAt &&
      item.snippet.liveBroadcastContent === "none" &&
      item.liveStreamingDetails === undefined &&
      item.status.privacyStatus === "public" &&
      item.status.uploadStatus === "processed" &&
      item.status.embeddable === true;
    if (!playable || (!isLong && !isLandscapeShort)) {
      rejectedCount += 1;
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
  resource,
  query,
}: {
  apiKey: string;
  fetch: ProviderFetch;
  resource: string;
  query: Record<string, string>;
}): Promise<
  { ok: true; body: unknown } | { ok: false; error: PrepareFollowFailure }
> {
  const url = new URL(`${youtubeApiOrigin}/${resource}`);
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
  const body: unknown = await response.json();
  if (response.ok) return { ok: true, body };
  if (response.status === 403 && quotaResponseSchema.safeParse(body).success) {
    return { ok: false, error: "quota_exceeded" };
  }
  if (response.status === 400 || response.status === 404) {
    return { ok: false, error: "invalid_target" };
  }
  return { ok: false, error: "provider_unavailable" };
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
