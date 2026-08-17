import { Type } from "@unshelf/shared";

declare const canonicalYouTubeSourceBrand: unique symbol;
export type CanonicalYouTubeSource = string & {
  readonly [canonicalYouTubeSourceBrand]: true;
};

export type SourceClassification =
  | {
      classification: "youtube";
      type: Type.Video | Type.Playlist;
      canonicalSource: CanonicalYouTubeSource;
    }
  | { classification: "youtube"; type: Type.Other }
  | { classification: "unsupported_youtube" }
  | { classification: "generic" };

const SUPPORTED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;
const COMMUNITY_POST_ID = /^[A-Za-z0-9_-]{10,128}$/;

/** Classify only conservative YouTube resource shapes from a temporary URL copy. */
export function classifySource(source: string): SourceClassification {
  const url = parseEligibleUrl(source);
  if (url === null || !isYoutubeProperty(url.hostname)) {
    return { classification: "generic" };
  }
  if (
    !SUPPORTED_YOUTUBE_HOSTS.has(url.hostname) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0
  ) {
    return { classification: "unsupported_youtube" };
  }

  const youtube =
    url.hostname === "youtu.be"
      ? classifyShortUrl(url)
      : classifyYoutubeUrl(url);
  return youtube === null
    ? { classification: "unsupported_youtube" }
    : { classification: "youtube", ...youtube };
}

function parseEligibleUrl(source: string): URL | null {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isYoutubeProperty(hostname: string): boolean {
  return (
    hostname === "youtu.be" ||
    hostname.endsWith(".youtu.be") ||
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com") ||
    hostname === "youtube-nocookie.com" ||
    hostname.endsWith(".youtube-nocookie.com")
  );
}

type YouTubeResource =
  | {
      readonly type: Type.Video | Type.Playlist;
      readonly canonicalSource: CanonicalYouTubeSource;
    }
  | { readonly type: Type.Other };

function classifyShortUrl(url: URL): YouTubeResource | null {
  const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
  if (
    match === null ||
    hasQueryParameter(url, "list") ||
    hasQueryParameter(url, "v")
  ) {
    return null;
  }
  return youtubeVideoResource(match[1] ?? "");
}

function classifyYoutubeUrl(url: URL): YouTubeResource | null {
  if (url.pathname === "/watch") {
    const videoId = singleValidParameter(url, "v", VIDEO_ID);
    return videoId !== null && !hasQueryParameter(url, "list")
      ? youtubeVideoResource(videoId)
      : null;
  }

  if (url.pathname === "/playlist") {
    const playlistId = singleValidParameter(url, "list", PLAYLIST_ID);
    return playlistId !== null && !hasQueryParameter(url, "v")
      ? youtubePlaylistResource(playlistId)
      : null;
  }

  const videoPath = /^\/(?:shorts|embed)\/([^/]+)\/?$/.exec(url.pathname);
  if (videoPath !== null) {
    const videoId = videoPath[1] ?? "";
    return VIDEO_ID.test(videoId) && !hasQueryParameter(url, "list")
      ? youtubeVideoResource(videoId)
      : null;
  }

  if (url.pathname === "/embed" || url.pathname === "/embed/") {
    const playlistId = singleValidParameter(url, "list", PLAYLIST_ID);
    return isSingleExactParameter({
      url,
      name: "listType",
      expected: "playlist",
    }) &&
      playlistId !== null &&
      !hasQueryParameter(url, "v")
      ? youtubePlaylistResource(playlistId)
      : null;
  }

  const postPath = /^\/post\/([^/]+)\/?$/.exec(url.pathname);
  if (postPath !== null) {
    return COMMUNITY_POST_ID.test(postPath[1] ?? "") &&
      !hasQueryParameter(url, "list") &&
      !hasQueryParameter(url, "v")
      ? { type: Type.Other }
      : null;
  }

  return null;
}

function hasQueryParameter(url: URL, name: string): boolean {
  return url.searchParams.has(name);
}

function isSingleExactParameter({
  url,
  name,
  expected,
}: {
  url: URL;
  name: string;
  expected: string;
}): boolean {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0] === expected;
}

function singleValidParameter(
  url: URL,
  name: string,
  pattern: RegExp,
): string | null {
  const values = url.searchParams.getAll(name);
  const value = values[0];
  return values.length === 1 && value !== undefined && pattern.test(value)
    ? value
    : null;
}

function youtubeVideoResource(videoId: string): YouTubeResource {
  return {
    type: Type.Video,
    canonicalSource: canonicalSource({
      pathname: "/watch",
      parameter: "v",
      identifier: videoId,
    }),
  };
}

function youtubePlaylistResource(playlistId: string): YouTubeResource {
  return {
    type: Type.Playlist,
    canonicalSource: canonicalSource({
      pathname: "/playlist",
      parameter: "list",
      identifier: playlistId,
    }),
  };
}

function canonicalSource({
  pathname,
  parameter,
  identifier,
}: {
  readonly pathname: string;
  readonly parameter: string;
  readonly identifier: string;
}): CanonicalYouTubeSource {
  const canonical = new URL(pathname, "https://www.youtube.com");
  canonical.searchParams.set(parameter, identifier);
  return canonical.href as CanonicalYouTubeSource;
}
