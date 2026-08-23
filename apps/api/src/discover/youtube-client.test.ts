import { afterEach, describe, expect, it, vi } from "vitest";
import { createYouTubeClient, type YouTubeFetch } from "./youtube-client";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
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

  it("distinguishes an empty channel response from a malformed duplicate identity", async () => {
    const emptyFetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValue(jsonResponse({ items: [] }));
    const empty = await createYouTubeClient({
      apiKey: "server-secret",
      fetch: emptyFetch,
    }).resolveChannel({ url: "https://youtube.com/@missing" });
    expect(empty).toEqual({ ok: false, error: "not_found" });

    const malformedFetch = vi.fn<YouTubeFetch>().mockResolvedValue(
      jsonResponse({
        items: [channelResource("UC_first"), channelResource("UC_second")],
      }),
    );
    const malformed = await createYouTubeClient({
      apiKey: "server-secret",
      fetch: malformedFetch,
    }).resolveChannel({ url: "https://youtube.com/@ambiguous" });
    expect(malformed).toEqual({ ok: false, error: "temporary_failure" });
    expect(malformedFetch).toHaveBeenCalledOnce();
  });

  it.each([
    "not a URL",
    "https://example.com/@quietlearning",
    "https://youtu.be/video-id",
    "https://youtube.com/channel/not-an-id",
    "https://youtube.com/channel//UC1234567890123456789012",
    "https://youtube.com//@quietlearning",
    "https://youtube.com/@quietlearning//videos",
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

  it("returns enough eligible uploads for a quiet channel preview without making ten authoritative", async () => {
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
            status: {
              privacyStatus: "public",
              uploadStatus: "processed",
              embeddable: true,
            },
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
      videos: publishedDates.map((publishedAt, index) => ({
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

  it("paginates through the inclusive 30-day boundary without capping scheduled intake at ten", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const recentDates = Array.from({ length: 11 }, (_, index) =>
      new Date(now.getTime() - (index + 1) * 86_400_000).toISOString(),
    );
    const boundary = "2026-07-24T12:00:00.000Z";
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: recentDates.map((publishedAt, index) => ({
            contentDetails: { videoId: `recent-${index}` },
            snippet: { publishedAt },
          })),
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: recentDates.map((publishedAt, index) =>
            videoResource({ id: `recent-${index}`, publishedAt }),
          ),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              contentDetails: { videoId: "recent-0" },
              snippet: { publishedAt: recentDates[0] },
            },
            {
              contentDetails: { videoId: "boundary" },
              snippet: { publishedAt: boundary },
            },
            {
              contentDetails: { videoId: "old" },
              snippet: { publishedAt: "2026-07-24T11:59:59.999Z" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            videoResource({ id: "recent-0", publishedAt: recentDates[0] }),
            videoResource({ id: "boundary", publishedAt: boundary }),
            videoResource({
              id: "old",
              publishedAt: "2026-07-24T11:59:59.999Z",
            }),
          ],
        }),
      );

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).fetchChannelVideos({
      channel: {
        externalId: "UC_immutable",
        title: "Quiet Learning",
        thumbnailUrl: null,
        canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
        uploadsPlaylistId: "UU_uploads",
      },
    });

    expect(
      result.ok && result.videos.map(({ externalId }) => externalId),
    ).toEqual([
      ...recentDates.map((_date, index) => `recent-${index}`),
      "boundary",
      "old",
    ]);
    expect(
      fetch.mock.calls.filter(([url]) =>
        url.pathname.endsWith("/playlistItems"),
      ),
    ).toHaveLength(2);
    expect(fetch.mock.calls[2][0].searchParams.get("pageToken")).toBe("page-2");
  });

  it("enforces playability, livestream, and conservative Shorts eligibility", async () => {
    const publishedAt = "2026-08-22T12:00:00.000Z";
    const ids = [
      "ordinary",
      "landscape-short",
      "vertical-short",
      "square-short",
      "unknown-short",
      "live",
      "completed-live",
      "upcoming",
      "private",
      "non-embeddable",
      "unavailable",
      "no-thumbnail",
    ];
    const overrides: Record<string, Record<string, unknown>> = {
      "landscape-short": {
        contentDetails: { duration: "PT3M" },
        player: { embedWidth: "1280", embedHeight: "720" },
      },
      "vertical-short": {
        contentDetails: { duration: "PT3M" },
        player: { embedWidth: 720, embedHeight: 1280 },
      },
      "square-short": {
        contentDetails: { duration: "PT3M" },
        player: { embedWidth: 720, embedHeight: 720 },
      },
      "unknown-short": { contentDetails: { duration: "PT3M" } },
      live: {
        snippet: {
          ...videoResource({ id: "live", publishedAt }).snippet,
          liveBroadcastContent: "live",
        },
        liveStreamingDetails: { actualStartTime: publishedAt },
      },
      "completed-live": {
        liveStreamingDetails: {
          actualStartTime: "2026-08-22T10:00:00.000Z",
          actualEndTime: "2026-08-22T11:00:00.000Z",
        },
      },
      upcoming: {
        snippet: {
          ...videoResource({ id: "upcoming", publishedAt }).snippet,
          liveBroadcastContent: "upcoming",
        },
        liveStreamingDetails: {
          scheduledStartTime: "2026-08-24T12:00:00.000Z",
        },
      },
      private: {
        status: {
          privacyStatus: "private",
          uploadStatus: "processed",
          embeddable: true,
        },
      },
      "non-embeddable": {
        status: {
          privacyStatus: "public",
          uploadStatus: "processed",
          embeddable: false,
        },
      },
      unavailable: {
        status: {
          privacyStatus: "public",
          uploadStatus: "failed",
          embeddable: true,
        },
      },
      "no-thumbnail": {
        snippet: {
          ...videoResource({ id: "no-thumbnail", publishedAt }).snippet,
          thumbnails: undefined,
        },
      },
    };
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: ids.map((id) => ({
            contentDetails: { videoId: id },
            snippet: { publishedAt },
          })),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: ids.map((id) => ({
            ...videoResource({ id, publishedAt }),
            ...overrides[id],
          })),
        }),
      );

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    }).fetchChannelVideos({ channel: testChannel });

    expect(
      result.ok && result.videos.map(({ externalId }) => externalId),
    ).toEqual([
      "ordinary",
      "landscape-short",
      "live",
      "completed-live",
      "no-thumbnail",
    ]);
    expect(result.ok && result.videos.at(-1)?.thumbnailUrl).toBeNull();
    expect(result.ok && result.skippedCount).toBe(7);
  });

  it("deduplicates identities and publishes valid metadata as a partial outcome", async () => {
    const publishedAt = "2026-08-22T12:00:00.000Z";
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: ["valid", "invalid", "valid"].map((id) => ({
            contentDetails: { videoId: id },
            snippet: { publishedAt },
          })),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            videoResource({ id: "valid", publishedAt }),
            { id: "invalid", snippet: { title: "Broken record" } },
            videoResource({ id: "valid", publishedAt }),
          ],
        }),
      );

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    }).fetchChannelVideos({ channel: testChannel });

    expect(result).toMatchObject({
      ok: true,
      outcome: "partial",
      skippedCount: 1,
      videos: [{ externalId: "valid" }],
    });
    expect(fetch.mock.calls[1][0].searchParams.get("id")).toBe("valid,invalid");
  });

  it("retries missing video metadata within the channel budget before publishing", async () => {
    vi.useFakeTimers();
    const publishedAt = "2026-08-22T12:00:00.000Z";
    const playlist = jsonResponse({
      items: ["valid", "missing"].map((id) => ({
        contentDetails: { videoId: id },
        snippet: { publishedAt },
      })),
    });
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValueOnce(playlist)
      .mockResolvedValueOnce(
        jsonResponse({ items: [videoResource({ id: "valid", publishedAt })] }),
      )
      .mockResolvedValueOnce(jsonResponse(await playlist.clone().json()))
      .mockResolvedValueOnce(
        jsonResponse({ items: [videoResource({ id: "valid", publishedAt })] }),
      )
      .mockResolvedValueOnce(jsonResponse(await playlist.clone().json()))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            videoResource({ id: "valid", publishedAt }),
            videoResource({ id: "missing", publishedAt }),
          ],
        }),
      );
    const resultPromise = createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      retry: testRetryPolicy,
    }).fetchChannelVideos({ channel: testChannel });

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(resultPromise).resolves.toMatchObject({
      ok: true,
      retryCount: 2,
      videos: [{ externalId: "valid" }, { externalId: "missing" }],
    });
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("does not retry a deterministic malformed response envelope", async () => {
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValue(jsonResponse({ nope: [] }));

    const result = await createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      now: () => new Date("2026-08-23T12:00:00.000Z"),
    }).fetchChannelVideos({ channel: testChannel });

    expect(result).toEqual({ ok: false, error: "temporary_failure" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("retries network and retryable HTTP failures with bounded exponential backoff", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockRejectedValueOnce(new TypeError("network failed: server-secret"))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const resultPromise = createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      now: () => new Date("2026-08-23T12:00:00.000Z"),
      retry: testRetryPolicy,
    }).fetchChannelVideos({ channel: testChannel });

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      videos: [],
      retryCount: 2,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("preserves throttling after exhaustion and honors Retry-After within the total budget", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<YouTubeFetch>().mockResolvedValue(
      jsonResponse({ error: "slow down: server-secret" }, 429, {
        "retry-after": "2",
      }),
    );
    const resultPromise = createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      now: () => new Date("2026-08-23T12:00:00.000Z"),
      retry: { ...testRetryPolicy, budgetMilliseconds: 10_000 },
    }).fetchChannelVideos({ channel: testChannel });

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);

    const result = await resultPromise;
    expect(result).toEqual({ ok: false, error: "throttled", retryCount: 2 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("keeps a throttled outcome when Retry-After extends beyond the total budget", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<YouTubeFetch>()
      .mockResolvedValue(
        jsonResponse({ error: "slow down" }, 429, { "retry-after": "60" }),
      );
    const resultPromise = createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      retry: { ...testRetryPolicy, budgetMilliseconds: 30 },
    }).fetchChannelVideos({ channel: testChannel });

    await vi.advanceTimersByTimeAsync(30);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      error: "throttled",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 403, 404])(
    "does not retry stable HTTP %s failures",
    async (status) => {
      const fetch = vi
        .fn<YouTubeFetch>()
        .mockResolvedValue(jsonResponse({ error: "server-secret" }, status));

      const result = await createYouTubeClient({
        apiKey: "server-secret",
        fetch,
        retry: testRetryPolicy,
      }).fetchChannelVideos({ channel: testChannel });

      expect(result.ok).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
      expect(JSON.stringify(result)).not.toContain("server-secret");
    },
  );

  it("aborts an unsettled request when the channel budget expires", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<YouTubeFetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("server-secret", "TimeoutError"));
          });
        }),
    );
    const resultPromise = createYouTubeClient({
      apiKey: "server-secret",
      fetch,
      retry: { ...testRetryPolicy, budgetMilliseconds: 30 },
    }).fetchChannelVideos({ channel: testChannel });

    await vi.advanceTimersByTimeAsync(30);

    const result = await resultPromise;
    expect(result).toEqual({ ok: false, error: "temporary_failure" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const testRetryPolicy = {
  budgetMilliseconds: 1_000,
  minDelayMilliseconds: 10,
  maxDelayMilliseconds: 20,
  randomize: false,
};

const testChannel = {
  externalId: "UC_immutable",
  title: "Quiet Learning",
  thumbnailUrl: null,
  canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
  uploadsPlaylistId: "UU_uploads",
};

function videoResource({
  id,
  publishedAt,
}: {
  id: string;
  publishedAt: string;
}) {
  return {
    id,
    snippet: {
      title: `Lesson ${id}`,
      channelId: "UC_immutable",
      publishedAt,
      liveBroadcastContent: "none",
      thumbnails: {},
    },
    contentDetails: { duration: "PT4M1S" },
    status: {
      privacyStatus: "public",
      uploadStatus: "processed",
      embeddable: true,
    },
  };
}

function channelResource(id: string) {
  return {
    id,
    snippet: { title: `Channel ${id}`, thumbnails: {} },
    contentDetails: { relatedPlaylists: { uploads: `UU_${id}` } },
  };
}
