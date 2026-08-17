import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { createGenericSourceInspector } from "./generic-inspector";
import type { GuardedPublicTransport } from "./guarded-transport";

describe("Generic Source inspector", () => {
  it("returns a normalized document title from inert streamed HTML", async () => {
    const cancel = vi.fn();
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-encoding": "identity",
          },
          body: chunks([
            '<!doctype html><html><head><script>"<title>Fake</title>"</script>',
            "<TiTlE>  A useful &amp;\n public ",
            "document  </TiTlE></head><body>ignored</body></html>",
          ]),
          cancel,
        },
      }),
    );
    const inspect = createGenericSourceInspector({ transport: { get } });
    const signal = new AbortController().signal;

    await expect(
      inspect({
        source: "https://example.com/article?edition=current#section",
        signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "A useful & public document",
      titleEvidence: "document_title",
    });
    expect(get).toHaveBeenCalledWith({
      source: "https://example.com/article?edition=current#section",
      headers: {
        accept: "text/html, application/xhtml+xml;q=0.9",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en",
        "user-agent":
          "Unshelf Source Inspection (+https://github.com/rajat2006/unshelf)",
      },
      signal,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("decompresses a bounded gzip HTML representation", async () => {
    const html = gzipSync(
      "<html><head><title>Compressed title</title></head></html>",
    );
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: {
            "content-type": "application/xhtml+xml",
            "content-encoding": "gzip",
          },
          body: byteChunks([html]),
          cancel: vi.fn(),
        },
      }),
    );
    const inspect = createGenericSourceInspector({ transport: { get } });

    await expect(
      inspect({
        source: "https://example.com/compressed",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      status: "suggested",
      title: "Compressed title",
    });
  });

  it("honors a declared bounded HTML character encoding", async () => {
    const prefix = new TextEncoder().encode("<head><title>Calm ");
    const suffix = new TextEncoder().encode(" capture</title></head>");
    const html = new Uint8Array(prefix.length + 1 + suffix.length);
    html.set(prefix);
    html[prefix.length] = 0x96;
    html.set(suffix, prefix.length + 1);
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html; charset=windows-1252" },
          body: byteChunks([html]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/encoded",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ title: "Calm – capture" });
  });

  it("honors an HTML byte-order mark before a conflicting declaration", async () => {
    const encoded = Buffer.from(
      "<head><title>Snowman ☃</title></head>",
      "utf16le",
    );
    const html = new Uint8Array(encoded.byteLength + 2);
    html.set([0xff, 0xfe]);
    html.set(encoded, 2);
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: byteChunks([html]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/bom",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ title: "Snowman ☃" });
  });

  it("honors an HTML meta encoding declaration within the bounded prescan", async () => {
    const prefix = new TextEncoder().encode(
      '<head><meta charset="windows-1252"><title>Calm ',
    );
    const suffix = new TextEncoder().encode(" capture</title></head>");
    const html = new Uint8Array(prefix.length + 1 + suffix.length);
    html.set(prefix);
    html[prefix.length] = 0x96;
    html.set(suffix, prefix.length + 1);
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: byteChunks([html]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/meta-encoded",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ title: "Calm – capture" });
  });

  it("uses only the first document title element", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            "<head><title>Publisher title</title><title>Ignored title</title></head>",
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/two-titles",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ title: "Publisher title" });
  });

  it.each([
    {
      caseName: "non-200 response",
      status: 401,
      headers: { "content-type": "text/html" },
    },
    {
      caseName: "non-HTML representation",
      status: 200,
      headers: { "content-type": "application/json" },
    },
    {
      caseName: "unsupported content encoding",
      status: 200,
      headers: {
        "content-type": "text/html",
        "content-encoding": "zstd",
      },
    },
  ])("quietly declines a $caseName", async ({ status, headers }) => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status,
          headers,
          body: chunks(["<title>Must not escape</title>"]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/unavailable",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("declines decompressed HTML beyond 256 KiB", async () => {
    const oversized = `<head><!--${"x".repeat(256 * 1024)}--><title>Too late</title></head>`;
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([oversized]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/oversized",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("caps a suggestion at 512 Unicode code points", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([`<head><title>${"😀".repeat(513)}</title></head>`]),
          cancel: vi.fn(),
        },
      }),
    );
    const result = await createGenericSourceInspector({ transport: { get } })({
      source: "https://example.com/long-title",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      status: "suggested",
      title: "😀".repeat(512),
    });
  });
});

async function* chunks(values: readonly string[]): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  yield* byteChunks(values.map((value) => encoder.encode(value)));
}

async function* byteChunks(
  values: readonly Uint8Array[],
): AsyncIterable<Uint8Array> {
  for (const value of values) yield value;
}
