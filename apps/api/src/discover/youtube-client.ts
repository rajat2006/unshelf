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
  { ok: true; videos: YouTubeVideo[] } | { ok: false; error: YouTubeFailure };

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
}: {
  apiKey: string;
  fetch: YouTubeFetch;
}): YouTubeClient {
  return {
    resolveChannel: async ({ url }) => {
      const target = parseChannelUrl(url);
      if (!target) return { ok: false, error: "invalid_url" };

      const response = await requestYouTube({
        apiKey,
        fetch,
        resource: "channels",
        query: { part: "id,snippet,contentDetails", ...target },
      });
      if (!response.ok) return response;
      const channel = readChannel(response.body);
      return channel
        ? { ok: true, channel }
        : { ok: false, error: "not_found" };
    },
    fetchChannelVideos: async ({ channel }) => {
      const playlistResponse = await requestYouTube({
        apiKey,
        fetch,
        resource: "playlistItems",
        query: {
          part: "snippet,contentDetails",
          playlistId: channel.uploadsPlaylistId,
          maxResults: "50",
        },
      });
      if (!playlistResponse.ok) return playlistResponse;
      const videoIds = readPlaylistVideoIds(playlistResponse.body);
      if (!videoIds) return { ok: false, error: "temporary_failure" };
      if (videoIds.length === 0) return { ok: true, videos: [] };

      const videosResponse = await requestYouTube({
        apiKey,
        fetch,
        resource: "videos",
        query: {
          part: "snippet,contentDetails",
          id: videoIds.join(","),
        },
      });
      if (!videosResponse.ok) return videosResponse;
      const videos = readVideos(videosResponse.body, channel.externalId);
      return videos
        ? {
            ok: true,
            videos: videos
              .sort((left, right) =>
                right.publishedAt.localeCompare(left.publishedAt),
              )
              .slice(0, 10),
          }
        : { ok: false, error: "temporary_failure" };
    },
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
  const parts = url.pathname.split("/").filter(Boolean);
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
}: {
  apiKey: string;
  fetch: YouTubeFetch;
  resource: string;
  query: Record<string, string>;
}): Promise<
  { ok: true; body: unknown } | { ok: false; error: YouTubeFailure }
> {
  const url = new URL(`${YOUTUBE_API_ORIGIN}/${resource}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  try {
    const response = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: response.status === 429 ? "throttled" : "temporary_failure",
      };
    }
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, error: "temporary_failure" };
  }
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

function readPlaylistVideoIds(body: unknown): string[] | null {
  const items = objectArrayProperty(body, "items");
  if (!items) return null;
  const videoIds: string[] = [];
  for (const item of items) {
    const videoId = stringProperty(
      recordProperty(item, "contentDetails"),
      "videoId",
    );
    if (!videoId) return null;
    videoIds.push(videoId);
  }
  return videoIds;
}

function readVideos(
  body: unknown,
  expectedChannelId: string,
): YouTubeVideo[] | null {
  const items = objectArrayProperty(body, "items");
  if (!items) return null;
  const videos: YouTubeVideo[] = [];
  for (const item of items) {
    const video = readVideo(item, expectedChannelId);
    if (video) videos.push(video);
  }
  return videos;
}

function readVideo(
  item: unknown,
  expectedChannelId: string,
): YouTubeVideo | null {
  const snippet = recordProperty(item, "snippet");
  const contentDetails = recordProperty(item, "contentDetails");
  const externalId = stringProperty(item, "id");
  const title = stringProperty(snippet, "title");
  const publishedAt = stringProperty(snippet, "publishedAt");
  const channelId = stringProperty(snippet, "channelId");
  const duration = parseDuration(stringProperty(contentDetails, "duration"));
  if (
    !externalId ||
    !title ||
    !publishedAt ||
    channelId !== expectedChannelId ||
    duration === null
  ) {
    return null;
  }
  const thumbnails = recordProperty(snippet, "thumbnails");
  const thumbnail =
    recordProperty(thumbnails, "maxres") ??
    recordProperty(thumbnails, "standard") ??
    recordProperty(thumbnails, "high") ??
    recordProperty(thumbnails, "medium") ??
    recordProperty(thumbnails, "default");
  return {
    externalId,
    title,
    thumbnailUrl: stringProperty(thumbnail, "url"),
    publishedAt: new Date(publishedAt).toISOString(),
    durationSeconds: duration,
    source: `https://www.youtube.com/watch?v=${externalId}`,
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
