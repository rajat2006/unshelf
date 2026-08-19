import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalYouTubeSource } from "../classifier";
import type { GuardedPublicTransport } from "../transport/guarded-transport";
import { createYouTubeTitleInspector } from "./youtube-title-inspector";

const canonicalVideoSource =
  "https://www.youtube.com/watch?v=M7lc1UVf-VE" as CanonicalYouTubeSource;

describe("YouTube title inspector", () => {
  it("requests the fixed oEmbed endpoint with only the canonical resource URL", async () => {
    const cancel = vi.fn();
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: encodedBody(
            JSON.stringify({
              title: "  A canonical   video title  ",
              type: "video",
            }),
          ),
          cancel,
        },
      }),
    );
    const signal = new AbortController().signal;

    await expect(
      createYouTubeTitleInspector({ transport: { get } })({
        canonicalSource: canonicalVideoSource,
        signal,
      }),
    ).resolves.toBe("A canonical video title");

    expect(get).toHaveBeenCalledOnce();
    const request = get.mock.calls[0]?.[0];
    if (request === undefined) throw new Error("Expected an oEmbed request");
    const endpoint = new URL(request.source);
    expect(endpoint.origin).toBe("https://www.youtube.com");
    expect(endpoint.pathname).toBe("/oembed");
    expect(endpoint.searchParams.get("url")).toBe(canonicalVideoSource);
    expect(endpoint.searchParams.get("format")).toBe("json");
    expect(request).toMatchObject({
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip, deflate, br",
      },
      redirectPolicy: "refuse",
      signal,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts bounded compressed JSON and caps the title at 512 code points", async () => {
    const title = `${"a".repeat(511)}😀extra`;
    const body = gzipSync(JSON.stringify({ title }));
    const get: GuardedPublicTransport["get"] = () =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
          },
          body: byteBody(body),
          cancel: vi.fn(),
        },
      });

    await expect(
      createYouTubeTitleInspector({ transport: { get } })({
        canonicalSource: canonicalVideoSource,
        signal: new AbortController().signal,
      }),
    ).resolves.toBe(`${"a".repeat(511)}😀`);
  });

  it.each([
    { caseName: "malformed JSON", body: "{", terminalCode: "origin" },
    {
      caseName: "missing title",
      body: JSON.stringify({ type: "video" }),
      terminalCode: "no_metadata",
    },
    {
      caseName: "non-string title",
      body: JSON.stringify({ title: 42 }),
      terminalCode: "no_metadata",
    },
    {
      caseName: "blank title",
      body: JSON.stringify({ title: "  \n  " }),
      terminalCode: "no_metadata",
    },
    {
      caseName: "oversized JSON",
      body: JSON.stringify({ title: "a".repeat(64 * 1024) }),
      terminalCode: "limit",
    },
  ])("returns no title for $caseName", async ({ body, terminalCode }) => {
    const cancel = vi.fn();
    const diagnostics: unknown[] = [];
    const get: GuardedPublicTransport["get"] = () =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: encodedBody(body),
          cancel,
        },
      });

    await expect(
      createYouTubeTitleInspector({ transport: { get } })({
        canonicalSource: canonicalVideoSource,
        signal: new AbortController().signal,
        reportDiagnostics: (update) => diagnostics.push(update),
      }),
    ).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(diagnostics).toContainEqual({ terminalCode });
  });

  it("returns no title when the guarded request times out", async () => {
    const get: GuardedPublicTransport["get"] = () =>
      Promise.resolve({ ok: false });

    await expect(
      createYouTubeTitleInspector({ transport: { get } })({
        canonicalSource: canonicalVideoSource,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeNull();
  });

  it("returns no title and cancels the response when the caller aborts", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const get: GuardedPublicTransport["get"] = () =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: bodyUntilAbort(controller.signal),
          cancel,
        },
      });
    const pending = createYouTubeTitleInspector({ transport: { get } })({
      canonicalSource: canonicalVideoSource,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

function encodedBody(value: string): AsyncIterable<Uint8Array> {
  return byteBody(new TextEncoder().encode(value));
}

async function* byteBody(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

async function* bodyUntilAbort(signal: AbortSignal): AsyncIterable<Uint8Array> {
  if (signal.aborted) throw abortError(signal);
  await new Promise<void>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError(signal)), {
      once: true,
    });
  });
  yield new Uint8Array();
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("Source inspection aborted");
}
