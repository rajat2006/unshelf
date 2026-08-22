import { Type } from "@unshelf/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareYouTubeSourceInspection } from "./youtubeSourceInspection";

const MANUAL_ONLY_SOURCES = [
  "",
  "youtube.com/watch?v=abcdefghijk",
  "ftp://youtube.com/watch?v=abcdefghijk",
  "https://music.youtube.com/watch?v=abcdefghijk",
  "https://youtube.com/",
  "https://youtube.com/channel/abcdefghijk",
  "https://youtube.com/@unshelf",
  "https://youtube.com/search?q=unshelf",
  "https://youtube.com/live/abcdefghijk",
  "https://youtube.com/embed/abcdefghijk",
  "https://youtube.com/post/abcdefghijk",
  "https://youtube.com/watch/extra?v=abcdefghijk",
  "https://youtu.be/abcdefghijk/extra",
  "https://youtube.com/watch?v=abcdefghij",
  "https://youtube.com/watch?v=abcdefghijkl",
  "https://youtube.com/watch?v=abcdefghij!",
  "https://youtube.com/playlist?list=123456789",
  `https://youtube.com/playlist?list=${"a".repeat(81)}`,
  "https://youtube.com/watch?v=abcdefghijk&v=abcdefghijk",
  "https://youtube.com/playlist?list=0123456789&list=0123456789",
  "https://youtube.com/watch?v=abcdefghijk&list=0123456789",
  "https://youtube.com/shorts/abcdefghijk?list=0123456789",
  "https://youtu.be/abcdefghijk?v=abcdefghijk",
  "https://youtu.be/abcdefghijk?list=0123456789",
  "https://youtu.be/abcdefghijk?v=abcdefghijk&v=abcdefghijk",
  "https://user@youtube.com/watch?v=abcdefghijk",
  "https://user:pass@youtube.com/watch?v=abcdefghijk",
  "https://youtube.com:443/watch?v=abcdefghijk",
  "http://youtube.com:80/watch?v=abcdefghijk",
  "https://youtube.com:8443/watch?v=abcdefghijk",
  "https://youtube.com:/watch?v=abcdefghijk",
  "https://youtube.com\\watch?v=abcdefghijk",
  "https:\\\\youtube.com\\watch?v=abcdefghijk",
  "https://youtube.com.evil/watch?v=abcdefghijk",
  "https://youtu.be.evil/abcdefghijk",
];

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function preparedVideo() {
  const prepared = prepareYouTubeSourceInspection(
    "https://youtube.com/watch?v=abcdefghijk",
  );
  if (!prepared) throw new Error("expected an eligible video");
  return prepared;
}

describe("prepareYouTubeSourceInspection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ["https://youtube.com/watch?v=abcdefghijk", Type.Video],
    ["http://www.youtube.com/watch/?feature=share&v=abc_DEF-123#t=2", Type.Video],
    ["https://m.youtube.com/watch?v=abc_DEF-123", Type.Video],
    ["https://youtube.com/shorts/abc_DEF-123", Type.Video],
    ["https://www.youtube.com/shorts/abc_DEF-123/", Type.Video],
    ["https://m.youtube.com/shorts/abc_DEF-123/?si=tracking", Type.Video],
    [" https://youtu.be/abc_DEF-123/?t=90 ", Type.Video],
    ["https://youtube.com/playlist?list=0123456789", Type.Playlist],
    ["https://m.youtube.com/playlist?list=0123456789", Type.Playlist],
    [
      `https://www.youtube.com/playlist/?utm=x&list=${"a".repeat(80)}#saved`,
      Type.Playlist,
    ],
  ])("prepares the supported Source %s", (source, type) => {
    expect(prepareYouTubeSourceInspection(source)?.type).toBe(type);
  });

  it.each(MANUAL_ONLY_SOURCES)(
    "keeps the unsupported or ambiguous Source manual-only: %s",
    (source) => {
      expect(prepareYouTubeSourceInspection(source)).toBeNull();
    },
  );

  it("performs zero requests while preparing manual-only Sources", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const source of MANUAL_ONLY_SOURCES) {
      expect(prepareYouTubeSourceInspection(source)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      source: "https://youtu.be/abc_DEF-123?si=secret#t=20",
      canonicalSource: "https://www.youtube.com/watch?v=abc_DEF-123",
      title: "A useful video",
    },
    {
      source:
        "https://youtube.com/playlist?list=0123456789&utm_source=secret#saved",
      canonicalSource: "https://www.youtube.com/playlist?list=0123456789",
      title: "A useful playlist",
    },
  ])(
    "acquires the title for $source using only its canonical identity",
    async ({ source, canonicalSource, title }) => {
      vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ title, type: "rich", html: "ignored" }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const prepared = prepareYouTubeSourceInspection(source);
      expect(prepared).not.toBeNull();
      await expect(
        prepared!.acquireTitle(new AbortController().signal),
      ).resolves.toBe(title);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, options] = fetchMock.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const request = new URL(requestUrl);
      expect(`${request.origin}${request.pathname}`).toBe(
        "https://www.youtube.com/oembed",
      );
      expect(Object.fromEntries(request.searchParams)).toEqual({
        url: canonicalSource,
        format: "json",
      });
      expect(requestUrl).not.toContain("secret");
      expect(options).toMatchObject({
        method: "GET",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        redirect: "error",
      });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it.each([undefined, "", "false", "TRUE", "1"])(
    "performs no request when title acquisition is not exactly enabled (%s)",
    async (enabled) => {
      if (enabled !== undefined) {
        vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", enabled);
      }
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const prepared = prepareYouTubeSourceInspection(
        "https://youtube.com/watch?v=abcdefghijk",
      );
      await expect(
        prepared!.acquireTitle(new AbortController().signal),
      ).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("normalizes a valid title and ignores every other oEmbed field", async () => {
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          title: "  A\n useful\t\tvideo  ",
          version: "unexpected",
          type: "photo",
          html: "<script>ignored</script>",
          author_name: "ignored",
          provider_name: "ignored",
        }),
      ),
    );

    await expect(
      preparedVideo().acquireTitle(new AbortController().signal),
    ).resolves.toBe("A useful video");
  });

  it.each([
    ["non-200 status", new Response("no", { status: 404 })],
    [
      "redirect",
      {
        status: 200,
        redirected: true,
        headers: new Headers({ "content-type": "application/json" }),
        body: jsonResponse({ title: "wrong" }).body,
      } as Response,
    ],
    [
      "non-JSON media type",
      new Response(JSON.stringify({ title: "wrong" }), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ],
    [
      "malformed JSON",
      new Response('{"title":"wrong"} trailing', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ],
    ["non-object JSON root", jsonResponse(["wrong"])],
    ["missing title", jsonResponse({ type: "video" })],
    ["non-string title", jsonResponse({ title: 123 })],
    ["blank title", jsonResponse({ title: " \n\t " })],
    ["overlong title", jsonResponse({ title: "🙂".repeat(513) })],
  ])("fails softly for a %s", async (_case, response) => {
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      preparedVideo().acquireTitle(new AbortController().signal),
    ).resolves.toBeNull();
  });

  it("rejects malformed UTF-8 and response data above 16 KiB", async () => {
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    const invalidUtf8 = new Uint8Array([0x7b, 0xff, 0x7d]);
    const oversized = JSON.stringify({ title: "ok", padding: "x".repeat(16_384) });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(invalidUtf8, {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(oversized, {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      preparedVideo().acquireTitle(new AbortController().signal),
    ).resolves.toBeNull();
    await expect(
      preparedVideo().acquireTitle(new AbortController().signal),
    ).resolves.toBeNull();
  });

  it("fails softly when the browser request fails", async () => {
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS failed")));

    await expect(
      preparedVideo().acquireTitle(new AbortController().signal),
    ).resolves.toBeNull();
  });

  it("makes at most one request for a prepared acquisition operation", async () => {
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ title: "Once" }));
    vi.stubGlobal("fetch", fetchMock);
    const prepared = preparedVideo();

    await expect(
      Promise.all([
        prepared.acquireTitle(new AbortController().signal),
        prepared.acquireTitle(new AbortController().signal),
      ]),
    ).resolves.toEqual(["Once", "Once"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("composes caller cancellation with a 2.5-second deadline", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    const receivedSignals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options: RequestInit) => {
        const signal = options.signal as AbortSignal;
        receivedSignals.push(signal);
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      }),
    );

    const caller = new AbortController();
    const cancelled = preparedVideo().acquireTitle(caller.signal);
    caller.abort();
    await expect(cancelled).resolves.toBeNull();
    expect(receivedSignals[0]?.aborted).toBe(true);

    const timedOut = preparedVideo().acquireTitle(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(2_499);
    expect(receivedSignals[1]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(timedOut).resolves.toBeNull();
    expect(receivedSignals[1]?.aborted).toBe(true);
  });

  it("does not start a request when the caller has already cancelled", async () => {
    vi.stubEnv("VITE_YOUTUBE_OEMBED_ENABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const caller = new AbortController();
    caller.abort();

    await expect(preparedVideo().acquireTitle(caller.signal)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
