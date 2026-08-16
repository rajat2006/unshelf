import { describe, expect, it, vi } from "vitest";
import { createYouTubeAdapter, type ProviderFetch } from "./youtube-adapter";

const now = new Date("2026-08-16T12:00:00.000Z");

function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function channel(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: "UC_immutable",
        snippet: { title: "Quiet Learning" },
        contentDetails: { relatedPlaylists: { uploads: "UU_uploads" } },
      },
    ],
    ...overrides,
  };
}

function playlistItem({
  videoId,
  publishedAt,
}: {
  videoId: string;
  publishedAt: string;
}) {
  return {
    snippet: {
      title: `Playlist ${videoId}`,
      publishedAt,
      resourceId: { kind: "youtube#video", videoId },
    },
    contentDetails: { videoId, videoPublishedAt: publishedAt },
    status: { privacyStatus: "public" },
  };
}

function video({
  id,
  publishedAt,
  overrides = {},
}: {
  id: string;
  publishedAt: string;
  overrides?: Record<string, unknown>;
}) {
  return {
    id,
    snippet: {
      title: `Video ${id}`,
      channelId: "UC_immutable",
      channelTitle: "Quiet Learning",
      publishedAt,
      liveBroadcastContent: "none",
      thumbnails: {
        medium: {
          url: `https://img.youtube.com/${id}.jpg`,
          width: 320,
          height: 180,
        },
      },
    },
    contentDetails: { duration: "PT4M1S" },
    status: {
      privacyStatus: "public",
      uploadStatus: "processed",
      embeddable: true,
    },
    player: { embedWidth: 1280, embedHeight: 720 },
    ...overrides,
  };
}

describe("YouTube Provider adapter", () => {
  it("retries transient responses at most twice but never retries a stable request failure", async () => {
    const transientFetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response({ error: "temporary" }, 503))
      .mockResolvedValueOnce(response({ error: "temporary" }, 503))
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(response({ items: [] }));
    const transient = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch: transientFetch,
      now: () => now,
      retry: {
        budgetMilliseconds: 1_000,
        minDelayMilliseconds: 1,
        maxDelayMilliseconds: 2,
        randomize: false,
      },
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(transient.ok).toBe(true);
    expect(
      transientFetch.mock.calls.filter(([url]) =>
        url.pathname.endsWith("/channels"),
      ),
    ).toHaveLength(3);

    const stableFetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValue(response({ error: "bad request" }, 400));
    const stable = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch: stableFetch,
      now: () => now,
      retry: {
        budgetMilliseconds: 1_000,
        minDelayMilliseconds: 1,
        maxDelayMilliseconds: 2,
        randomize: false,
      },
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(stable).toEqual({ ok: false, error: "invalid_target" });
    expect(stableFetch).toHaveBeenCalledTimes(1);
  });

  it("honors Provider retry timing ahead of fallback backoff", async () => {
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        response({ error: "slow down" }, 429, { "retry-after": "0.04" }),
      )
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(response({ items: [] }));
    const startedAt = performance.now();

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
      retry: {
        budgetMilliseconds: 1_000,
        minDelayMilliseconds: 1,
        maxDelayMilliseconds: 2,
        randomize: false,
      },
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(result).toMatchObject({ ok: true, retryCount: 1 });
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(30);
  });

  it("bounds the complete attempt even when a request never settles itself", async () => {
    const fetch = vi.fn<ProviderFetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        }),
    );
    const startedAt = performance.now();

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
      retry: {
        budgetMilliseconds: 20,
        minDelayMilliseconds: 1,
        maxDelayMilliseconds: 2,
        randomize: false,
      },
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(result).toMatchObject({ ok: false, error: "provider_unavailable" });
    expect(performance.now() - startedAt).toBeLessThan(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not let Provider retry timing extend the total attempt budget", async () => {
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValue(
        response({ error: "slow down" }, 429, { "retry-after": "60" }),
      );
    const startedAt = performance.now();

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
      retry: {
        budgetMilliseconds: 20,
        minDelayMilliseconds: 1,
        maxDelayMilliseconds: 2,
        randomize: false,
      },
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(result).toEqual({
      ok: false,
      error: "provider_unavailable",
      nextEligibleAt: "2026-08-16T12:01:00.000Z",
    });
    expect(performance.now() - startedAt).toBeLessThan(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("carries Provider quota timing without retrying or exposing credentials", async () => {
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValue(
        response({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403, {
          "retry-after": "60",
        }),
      );

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(result).toEqual({
      ok: false,
      error: "quota_exceeded",
      nextEligibleAt: "2026-08-16T12:01:00.000Z",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it.each([
    ["https://www.youtube.com/channel/UC_immutable", "id=UC_immutable"],
    ["https://youtube.com/@quietlearning", "forHandle=%40quietlearning"],
    ["https://www.youtube.com/user/quietlearning", "forUsername=quietlearning"],
  ])("resolves %s through channels.list", async (url, expectedQuery) => {
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(response({ items: [] }));
    const adapter = createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    });

    const result = await adapter.previewChannel({ url });

    expect(result.ok).toBe(true);
    expect(fetch.mock.calls[0]?.[0].toString()).toContain(expectedQuery);
    expect(fetch.mock.calls[0]?.[0].toString()).not.toContain("server-secret");
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get("x-goog-api-key"),
    ).toBe("server-secret");
  });

  it("returns the newest ten eligible videos within complete 30-day coverage", async () => {
    const dates = Array.from({ length: 12 }, (_, index) =>
      new Date(now.getTime() - (index + 1) * 86_400_000).toISOString(),
    );
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: dates.map((date, index) =>
            playlistItem({ videoId: `v${index}`, publishedAt: date }),
          ),
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: dates.map((date, index) =>
            video({ id: `v${index}`, publishedAt: date }),
          ),
        }),
      );
    const adapter = createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    });

    const result = await adapter.previewChannel({
      url: "https://youtube.com/@quietlearning",
    });

    expect(result).toMatchObject({
      ok: true,
      channelId: "UC_immutable",
      uploadsPlaylistId: "UU_uploads",
      publisher: "Quiet Learning",
      rejectedCount: 0,
    });
    if (!result.ok) throw new Error("expected preview");
    expect(result.videos).toHaveLength(10);
    expect(result.videos.map((entry) => entry.providerIdentity)).toEqual(
      dates.slice(0, 10).map((_date, index) => `v${index}`),
    );
    expect(result.videos[0]).toEqual({
      provider: "youtube",
      providerIdentity: "v0",
      title: "Video v0",
      source: "https://www.youtube.com/watch?v=v0",
      publisher: "Quiet Learning",
      publishedAt: dates[0],
      durationSeconds: 241,
      type: "video",
      thumbnailUrl: "https://img.youtube.com/v0.jpg",
    });
  });

  it("acquires the immutable channel identity without applying the setup preview cap", async () => {
    const dates = Array.from({ length: 12 }, (_, index) =>
      new Date(now.getTime() - (index + 1) * 86_400_000).toISOString(),
    );
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: dates.map((publishedAt, index) =>
            playlistItem({ videoId: `acquired-${index}`, publishedAt }),
          ),
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: dates.map((publishedAt, index) =>
            video({ id: `acquired-${index}`, publishedAt }),
          ),
        }),
      );
    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).acquireChannel({ channelId: "UC_immutable" });

    expect(result.ok && result.videos).toHaveLength(12);
    expect(fetch.mock.calls[0]?.[0].searchParams.get("id")).toBe(
      "UC_immutable",
    );
    expect(fetch.mock.calls[0]?.[0].searchParams.has("forHandle")).toBe(false);
  });

  it("re-resolves a purged channel URL without applying the setup preview cap", async () => {
    const dates = Array.from({ length: 12 }, (_, index) =>
      new Date(now.getTime() - (index + 1) * 86_400_000).toISOString(),
    );
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: dates.map((publishedAt, index) =>
            playlistItem({ videoId: `restored-${index}`, publishedAt }),
          ),
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: dates.map((publishedAt, index) =>
            video({ id: `restored-${index}`, publishedAt }),
          ),
        }),
      );
    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).acquireChannelByUrl({ url: "https://youtube.com/@quietlearning" });

    expect(result.ok && result.videos).toHaveLength(12);
    expect(fetch.mock.calls[0]?.[0].searchParams.get("forHandle")).toBe(
      "@quietlearning",
    );
  });

  it("accepts short landscape videos and excludes short vertical, square, unknown-ratio, livestream, and unplayable records", async () => {
    const publishedAt = "2026-08-15T12:00:00.000Z";
    const ids = [
      "landscape",
      "vertical",
      "square",
      "unknown",
      "live",
      "private",
    ];
    const short = { contentDetails: { duration: "PT3M" } };
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: ids.map((id) => playlistItem({ videoId: id, publishedAt })),
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            video({ id: "landscape", publishedAt, overrides: { ...short } }),
            video({
              id: "vertical",
              publishedAt,
              overrides: {
                ...short,
                player: { embedWidth: 720, embedHeight: 1280 },
                snippet: {
                  ...video({ id: "vertical", publishedAt }).snippet,
                  thumbnails: {
                    medium: {
                      url: "https://img/vertical",
                      width: 180,
                      height: 320,
                    },
                  },
                },
              },
            }),
            video({
              id: "square",
              publishedAt,
              overrides: {
                ...short,
                player: { embedWidth: 1000, embedHeight: 1000 },
                snippet: {
                  ...video({ id: "square", publishedAt }).snippet,
                  thumbnails: {
                    medium: {
                      url: "https://img/square",
                      width: 200,
                      height: 200,
                    },
                  },
                },
              },
            }),
            video({
              id: "unknown",
              publishedAt,
              overrides: {
                ...short,
                player: undefined,
                snippet: {
                  ...video({ id: "unknown", publishedAt }).snippet,
                  thumbnails: {},
                },
              },
            }),
            video({
              id: "live",
              publishedAt,
              overrides: {
                liveStreamingDetails: { actualStartTime: publishedAt },
              },
            }),
            video({
              id: "private",
              publishedAt,
              overrides: {
                status: {
                  privacyStatus: "private",
                  uploadStatus: "processed",
                  embeddable: true,
                },
              },
            }),
          ],
        }),
      );
    const adapter = createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    });

    const result = await adapter.previewChannel({
      url: "https://youtube.com/@quietlearning",
    });

    expect(result).toMatchObject({
      ok: true,
      outcome: "preview",
      rejectedCount: 0,
    });
    if (!result.ok) throw new Error("expected partial preview");
    expect(result.videos.map((entry) => entry.providerIdentity)).toEqual([
      "landscape",
    ]);
  });

  it("fails tagged instead of publishing an empty preview for malformed coverage or quota errors", async () => {
    const malformedFetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(response({ surprising: true }));
    const malformed = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch: malformedFetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });
    expect(malformed).toEqual({ ok: false, error: "unverifiable" });

    const quotaFetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValue(
        response({ error: { errors: [{ reason: "quotaExceeded" }] } }, 403),
      );
    const quota = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch: quotaFetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });
    expect(quota).toEqual({ ok: false, error: "quota_exceeded" });
  });

  it("paginates until the inclusive 30-day boundary without using search.list", async () => {
    const boundary = "2026-07-17T12:00:00.000Z";
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: [playlistItem({ videoId: "boundary", publishedAt: boundary })],
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            playlistItem({
              videoId: "old",
              publishedAt: "2026-07-17T11:59:59.999Z",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [video({ id: "boundary", publishedAt: boundary })],
        }),
      );

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });

    expect(
      result.ok && result.videos.map((entry) => entry.providerIdentity),
    ).toEqual(["boundary"]);
    const urls = fetch.mock.calls.map(([url]) => url.toString());
    expect(urls.filter((url) => url.includes("playlistItems"))).toHaveLength(2);
    expect(urls.some((url) => url.includes("search"))).toBe(false);
  });

  it("publishes valid records as partial when one video record is individually malformed", async () => {
    const publishedAt = "2026-08-15T12:00:00.000Z";
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: [
            playlistItem({ videoId: "valid", publishedAt }),
            playlistItem({ videoId: "invalid", publishedAt }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            video({ id: "valid", publishedAt }),
            { id: "invalid", surprising: true },
          ],
        }),
      );

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });

    expect(result).toMatchObject({
      ok: true,
      outcome: "partial",
      rejectedCount: 1,
    });
    if (!result.ok) throw new Error("expected partial preview");
    expect(result.videos.map((entry) => entry.providerIdentity)).toEqual([
      "valid",
    ]);
  });

  it("fails unverifiable when a malformed video cannot be tied to one requested identity", async () => {
    const publishedAt = "2026-08-15T12:00:00.000Z";
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: [playlistItem({ videoId: "unknown", publishedAt })],
        }),
      )
      .mockResolvedValueOnce(response({ items: [{ surprising: true }] }));

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });

    expect(result).toEqual({ ok: false, error: "unverifiable" });
  });

  it("fails unverifiable when upload pagination drifts out of newest-first order", async () => {
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: [
            playlistItem({
              videoId: "older",
              publishedAt: "2026-08-14T12:00:00.000Z",
            }),
          ],
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            playlistItem({
              videoId: "newer",
              publishedAt: "2026-08-15T12:00:00.000Z",
            }),
          ],
        }),
      );

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });

    expect(result).toEqual({ ok: false, error: "unverifiable" });
  });

  it("maps network timeouts to Provider unavailable", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });
    expect(result).toEqual({
      ok: false,
      error: "provider_unavailable",
      retryCount: 2,
    });
  });

  it("reads video resources in official 50-id batches", async () => {
    const publishedAt = "2026-08-15T12:00:00.000Z";
    const ids = Array.from({ length: 51 }, (_, index) => `batched-${index}`);
    const fetch = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(response(channel()))
      .mockResolvedValueOnce(
        response({
          items: ids.map((id) => playlistItem({ videoId: id, publishedAt })),
        }),
      )
      .mockResolvedValueOnce(
        response({
          items: ids.slice(0, 50).map((id) => video({ id, publishedAt })),
        }),
      )
      .mockResolvedValueOnce(
        response({ items: [video({ id: ids[50], publishedAt })] }),
      );

    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/@quietlearning" });

    expect(result.ok).toBe(true);
    expect(
      fetch.mock.calls.filter(([url]) => url.pathname.endsWith("/videos")),
    ).toHaveLength(2);
  });

  it("rejects unsupported URL forms before making a request", async () => {
    const fetch = vi.fn<ProviderFetch>();
    const result = await createYouTubeAdapter({
      apiKey: "server-secret",
      fetch,
      now: () => now,
    }).previewChannel({ url: "https://youtube.com/playlist?list=PL123" });
    expect(result).toEqual({ ok: false, error: "unsupported_target" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
