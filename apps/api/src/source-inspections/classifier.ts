import { Type } from "@unshelf/shared";

export type SourceClassification =
  | { classification: "youtube"; type: Type }
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

  const type =
    url.hostname === "youtu.be"
      ? classifyShortUrl(url)
      : classifyYoutubeUrl(url);
  return type === null
    ? { classification: "unsupported_youtube" }
    : { classification: "youtube", type };
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

function classifyShortUrl(url: URL): Type | null {
  const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
  if (
    match === null ||
    hasQueryParameter(url, "list") ||
    hasQueryParameter(url, "v")
  ) {
    return null;
  }
  return Type.Video;
}

function classifyYoutubeUrl(url: URL): Type | null {
  if (url.pathname === "/watch") {
    return isSingleValidParameter(url, "v", VIDEO_ID) &&
      !hasQueryParameter(url, "list")
      ? Type.Video
      : null;
  }

  if (url.pathname === "/playlist") {
    return isSingleValidParameter(url, "list", PLAYLIST_ID) &&
      !hasQueryParameter(url, "v")
      ? Type.Playlist
      : null;
  }

  const videoPath = /^\/(?:shorts|embed)\/([^/]+)\/?$/.exec(url.pathname);
  if (videoPath !== null) {
    return VIDEO_ID.test(videoPath[1] ?? "") && !hasQueryParameter(url, "list")
      ? Type.Video
      : null;
  }

  if (url.pathname === "/embed" || url.pathname === "/embed/") {
    return isSingleExactParameter(url, "listType", "playlist") &&
      isSingleValidParameter(url, "list", PLAYLIST_ID) &&
      !hasQueryParameter(url, "v")
      ? Type.Playlist
      : null;
  }

  const postPath = /^\/post\/([^/]+)\/?$/.exec(url.pathname);
  if (postPath !== null) {
    return COMMUNITY_POST_ID.test(postPath[1] ?? "") &&
      !hasQueryParameter(url, "list") &&
      !hasQueryParameter(url, "v")
      ? Type.Other
      : null;
  }

  return null;
}

function hasQueryParameter(url: URL, name: string): boolean {
  return url.searchParams.has(name);
}

function isSingleExactParameter(
  url: URL,
  name: string,
  expected: string,
): boolean {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0] === expected;
}

function isSingleValidParameter(
  url: URL,
  name: string,
  pattern: RegExp,
): boolean {
  const values = url.searchParams.getAll(name);
  const value = values[0];
  return values.length === 1 && value !== undefined && pattern.test(value);
}
