const VIDEO_IDENTIFIER = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

export interface YouTubeVideoIdentity {
  provider: "youtube";
  externalId: string;
}

/** Parse only the YouTube video Source shapes that establish exact identity. */
export function parseYouTubeVideoIdentity(
  source: string,
): YouTubeVideoIdentity | null {
  const workingSource = source.trim();
  if (workingSource.includes("\\") || hasExplicitPort(workingSource))
    return null;

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

  const videoIds = url.searchParams.getAll("v");
  const playlistIds = url.searchParams.getAll("list");
  if (videoIds.length > 1 || playlistIds.length > 0) return null;

  const path = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;
  let externalId: string | null = null;
  if (url.hostname === "youtu.be") {
    const pathId = path.slice(1);
    if (
      path.split("/").length === 2 &&
      VIDEO_IDENTIFIER.test(pathId) &&
      videoIds.length === 0
    ) {
      externalId = pathId;
    }
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (
      path === "/watch" &&
      videoIds.length === 1 &&
      VIDEO_IDENTIFIER.test(videoIds[0] ?? "")
    ) {
      externalId = videoIds[0] ?? null;
    } else if (
      path.startsWith("/shorts/") &&
      path.split("/").length === 3 &&
      VIDEO_IDENTIFIER.test(path.slice("/shorts/".length)) &&
      videoIds.length === 0
    ) {
      externalId = path.slice("/shorts/".length);
    }
  }

  return externalId === null ? null : { provider: "youtube", externalId };
}

function hasExplicitPort(source: string): boolean {
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(source)?.[1];
  if (!authority) return false;
  return authority.slice(authority.lastIndexOf("@") + 1).includes(":");
}
