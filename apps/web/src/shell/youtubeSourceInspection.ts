import { Type } from "@unshelf/shared";

export interface PreparedYouTubeSourceInspection {
  type: Type.Video | Type.Playlist;
  acquireTitle: (signal: AbortSignal) => Promise<string | null>;
}

const VIDEO_IDENTIFIER = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_IDENTIFIER = /^[A-Za-z0-9_-]{10,80}$/;
const MAX_RESPONSE_BYTES = 16 * 1024;
const ACQUISITION_DEADLINE_MS = 2_500;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

export function prepareYouTubeSourceInspection(
  source: string,
): PreparedYouTubeSourceInspection | null {
  const workingSource = source.trim();
  // Check the original text first: URL parsing normalizes backslashes and
  // erases explicit default ports, which would make ineligible Sources pass.
  if (workingSource.includes("\\") || hasExplicitPort(workingSource)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(workingSource);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }

  const videoIdentities = url.searchParams.getAll("v");
  const playlistIdentities = url.searchParams.getAll("list");
  if (videoIdentities.length > 1 || playlistIdentities.length > 1) return null;

  const path = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;
  let type: Type.Video | Type.Playlist | null = null;
  let canonicalSource: string | null = null;

  if (url.hostname === "youtu.be") {
    const identifier = path.slice(1);
    if (
      path.split("/").length === 2 &&
      VIDEO_IDENTIFIER.test(identifier) &&
      playlistIdentities.length === 0 &&
      videoIdentities.length === 0
    ) {
      type = Type.Video;
      canonicalSource = canonicalVideoUrl(identifier);
    }
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (
      path === "/watch" &&
      videoIdentities.length === 1 &&
      VIDEO_IDENTIFIER.test(videoIdentities[0] ?? "") &&
      playlistIdentities.length === 0
    ) {
      type = Type.Video;
      canonicalSource = canonicalVideoUrl(videoIdentities[0] ?? "");
    } else if (
      path.startsWith("/shorts/") &&
      path.split("/").length === 3 &&
      VIDEO_IDENTIFIER.test(path.slice("/shorts/".length)) &&
      videoIdentities.length === 0 &&
      playlistIdentities.length === 0
    ) {
      type = Type.Video;
      canonicalSource = canonicalVideoUrl(path.slice("/shorts/".length));
    } else if (
      path === "/playlist" &&
      playlistIdentities.length === 1 &&
      PLAYLIST_IDENTIFIER.test(playlistIdentities[0] ?? "") &&
      videoIdentities.length === 0
    ) {
      type = Type.Playlist;
      canonicalSource = canonicalPlaylistUrl(playlistIdentities[0] ?? "");
    }
  }

  if (type === null || canonicalSource === null) return null;
  let acquisition: Promise<string | null> | undefined;
  return {
    type,
    acquireTitle: (signal) => {
      acquisition ??= acquireTitle({ canonicalSource, signal });
      return acquisition;
    },
  };
}

function canonicalVideoUrl(identifier: string): string {
  return canonicalYouTubeUrl({ path: "watch", parameter: "v", identifier });
}

function canonicalPlaylistUrl(identifier: string): string {
  return canonicalYouTubeUrl({
    path: "playlist",
    parameter: "list",
    identifier,
  });
}

function canonicalYouTubeUrl({
  path,
  parameter,
  identifier,
}: {
  path: "watch" | "playlist";
  parameter: "v" | "list";
  identifier: string;
}): string {
  const url = new URL(`https://www.youtube.com/${path}`);
  url.searchParams.set(parameter, identifier);
  return url.toString();
}

async function acquireTitle({
  canonicalSource,
  signal,
}: {
  canonicalSource: string;
  signal: AbortSignal;
}): Promise<string | null> {
  if (import.meta.env.VITE_YOUTUBE_OEMBED_ENABLED !== "true") return null;
  if (signal.aborted) return null;

  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", canonicalSource);
  endpoint.searchParams.set("format", "json");

  const requestController = new AbortController();
  const cancelFromCaller = () => requestController.abort(signal.reason);
  if (signal.aborted) cancelFromCaller();
  else signal.addEventListener("abort", cancelFromCaller, { once: true });
  const deadline = setTimeout(
    () => requestController.abort(new DOMException("Timed out", "TimeoutError")),
    ACQUISITION_DEADLINE_MS,
  );

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      signal: requestController.signal,
    });
    if (
      response.status !== 200 ||
      response.redirected ||
      response.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
        "application/json"
    ) {
      return null;
    }

    const body = await readBoundedUtf8(response.body);
    if (body === null) return null;
    const value: unknown = JSON.parse(body);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !("title" in value) ||
      typeof value.title !== "string"
    ) {
      return null;
    }
    const title = value.title.trim().replace(/\s+/gu, " ");
    return title.length > 0 && [...title].length <= 512 ? title : null;
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", cancelFromCaller);
  }
}

async function readBoundedUtf8(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string | null> {
  if (stream === null) return null;
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let decoded = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      decoded += decoder.decode(value, { stream: true });
    }
    decoded += decoder.decode();
    return decoded;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function hasExplicitPort(source: string): boolean {
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(source)?.[1];
  if (!authority) return false;
  const hostAndPort = authority.slice(authority.lastIndexOf("@") + 1);
  return hostAndPort.includes(":");
}
