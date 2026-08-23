import { describe, expect, it, vi } from "vitest";
import { createYouTubeClient, type YouTubeFetch } from "./youtube-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("YouTube client", () => {
  it.each([
    [
      "https://www.youtube.com/channel/UC1234567890123456789012",
      "id",
      "UC1234567890123456789012",
    ],
    ["http://youtube.com/@quietlearning/", "forHandle", "@quietlearning"],
    [
      "https://m.youtube.com/@quietlearning/videos",
      "forHandle",
      "@quietlearning",
    ],
  ])("resolves %s to the immutable channel", async (url, key, value) => {
    const fetch = vi.fn<YouTubeFetch>().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: "UC_immutable",
            snippet: {
              title: "Quiet Learning",
              thumbnails: {
                default: { url: "https://img.youtube.com/channel.jpg" },
              },
            },
            contentDetails: { relatedPlaylists: { uploads: "UU_uploads" } },
          },
        ],
      }),
    );

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
    }).resolveChannel({ url });

    expect(result).toEqual({
      ok: true,
      channel: {
        externalId: "UC_immutable",
        title: "Quiet Learning",
        thumbnailUrl: "https://img.youtube.com/channel.jpg",
        canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
        uploadsPlaylistId: "UU_uploads",
      },
    });
    const requestUrl = fetch.mock.calls[0][0];
    expect(requestUrl.searchParams.get(key)).toBe(value);
    expect(requestUrl.toString()).not.toContain("server-secret");
    expect(
      new Headers(fetch.mock.calls[0][1]?.headers).get("x-goog-api-key"),
    ).toBe("server-secret");
  });

  it.each([
    "not a URL",
    "https://example.com/@quietlearning",
    "https://youtu.be/video-id",
    "https://youtube.com/channel/not-an-id",
    "https://youtube.com/user/quietlearning",
    "https://youtube.com/c/quietlearning",
    "https://youtube.com/playlist?list=PL123",
    "https://youtube.com/results?search_query=learning",
    "https://youtube.com/watch?v=video-id",
  ])("rejects unsupported channel input %s without a request", async (url) => {
    const fetch = vi.fn<YouTubeFetch>();

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
    }).resolveChannel({ url });

    expect(result).toEqual({ ok: false, error: "invalid_url" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the latest ten eligible uploads even when a quiet channel's videos are old", async () => {
    const publishedDates = Array.from({ length: 12 }, (_, index) =>
      new Date(Date.UTC(2026, 6 - index, 15)).toISOString(),
    );
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: publishedDates.map((publishedAt, index) => ({
            contentDetails: { videoId: `video-${index}` },
            snippet: { publishedAt },
          })),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: publishedDates.map((publishedAt, index) => ({
            id: `video-${index}`,
            snippet: {
              title: `Lesson ${index}`,
              channelId: "UC_immutable",
              publishedAt,
              liveBroadcastContent: "none",
              thumbnails: {
                medium: { url: `https://img.youtube.com/video-${index}.jpg` },
              },
            },
            contentDetails: { duration: "PT4M1S" },
            status: { privacyStatus: "public", embeddable: true },
          })),
        }),
      );
    const channel = {
      externalId: "UC_immutable",
      title: "Quiet Learning",
      thumbnailUrl: null,
      canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
      uploadsPlaylistId: "UU_uploads",
    };

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
    }).fetchChannelVideos({ channel });

    expect(result).toEqual({
      ok: true,
      videos: publishedDates.slice(0, 10).map((publishedAt, index) => ({
        externalId: `video-${index}`,
        title: `Lesson ${index}`,
        thumbnailUrl: `https://img.youtube.com/video-${index}.jpg`,
        publishedAt,
        durationSeconds: 241,
        source: `https://www.youtube.com/watch?v=video-${index}`,
      })),
    });
    expect(fetch.mock.calls[0][0].pathname).toBe("/youtube/v3/playlistItems");
    expect(fetch.mock.calls[1][0].pathname).toBe("/youtube/v3/videos");
  });
});
