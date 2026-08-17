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

  it("prefers a primary Schema.org entity for title and Type", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <title>Document title</title>
              <meta property="og:title" content="Open Graph title">
              <script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Article","headline":"Schema headline"}
              </script>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/schema-article",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Schema headline",
      titleEvidence: "schema_org",
      type: "article",
      typeEvidence: "schema_org",
    });
  });

  it("uses the first Open Graph title and narrow Type evidence before document title", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <meta CONTENT=" First &amp; calm title " PROPERTY="OG:TITLE">
              <meta property="og:title" content="Ignored title">
              <meta property="og:type" content="video.other">
              <title>Document title</title>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/open-graph-video",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "First & calm title",
      titleEvidence: "open_graph",
      type: "video",
      typeEvidence: "open_graph",
    });
  });

  it("finds one primary entity in JSON-LD arrays and graphs while skipping page furniture", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script TYPE="Application/LD+JSON; charset=utf-8">
              [{"@type":"WebSite","name":"Publisher chrome"},{"@graph":[
                {"@type":"BreadcrumbList","name":"Breadcrumbs"},
                {"@type":["LearningResource","Course"],"name":" Practical TypeScript ","mainEntityOfPage":{"@id":"page"}}
              ]}]
            </script></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/course",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Practical TypeScript",
      titleEvidence: "schema_org",
      type: "course",
      typeEvidence: "schema_org",
    });
  });

  it("leaves Type unresolved when strong Schema.org and Open Graph evidence conflict", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <script type="application/ld+json">
                {"@type":"Article","headline":"Reliable title"}
              </script>
              <meta property="og:type" content="book">
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/conflicting-types",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Reliable title",
      titleEvidence: "schema_org",
    });
  });

  it("skips ambiguous primary entities for title and leaves their conflicting Types unresolved", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <script type="application/ld+json">{"@graph":[
                {"@type":"NewsArticle","headline":"Article candidate","mainEntityOfPage":{"@id":"#page"}},
                {"@type":"Book","name":"Book candidate","mainEntityOfPage":{"@id":"#page"}}
              ]}</script>
              <meta property="og:title" content="Publisher fallback">
              <meta property="og:type" content="article">
              <title>Document fallback</title>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/ambiguous-primary",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Publisher fallback",
      titleEvidence: "open_graph",
    });
  });

  it("falls back to document title independently of strong Type evidence", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <script type="application/ld+json">{"@type":"Book"}</script>
              <title>Document book title</title>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/book",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Document book title",
      titleEvidence: "document_title",
      type: "book",
      typeEvidence: "schema_org",
    });
  });

  it("uses an explicitly designated Schema.org main entity but ignores embedded media", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script type="application/ld+json">{
              "@type":"WebPage",
              "video":{"@type":"VideoObject","name":"Decorative trailer"},
              "mainEntity":{"@type":"TechArticle","headline":"Primary article"}
            }</script></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/main-entity",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Primary article",
      titleEvidence: "schema_org",
      type: "article",
      typeEvidence: "schema_org",
    });
  });

  it("resolves a local mainEntity reference without promoting other graph nodes", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script type="application/ld+json">{"@graph":[
              {"@id":"#page","@type":"WebPage","mainEntity":{"@id":"#article"}},
              {"@id":"#article","@type":"Report","headline":"Primary report","mainEntityOfPage":{"@id":"#page"}},
              {"@id":"#trailer","@type":"VideoObject","name":"Embedded trailer"}
            ]}</script></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/local-reference",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Primary report",
      titleEvidence: "schema_org",
      type: "article",
      typeEvidence: "schema_org",
    });
  });

  it("does not promote an arbitrary recognized graph node to primary evidence", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script type="application/ld+json">{"@graph":[
              {"@type":"WebPage"},
              {"@type":"VideoObject","name":"Unrelated trailer"}
            ]}</script><title>Page title</title></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/arbitrary-graph-node",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Page title",
      titleEvidence: "document_title",
    });
  });

  it("does not promote mainEntity metadata owned by nested page furniture", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script type="application/ld+json">{
              "@type":"WebPage",
              "publisher":{"@type":"Organization","mainEntity":{"@type":"Book","name":"Publisher catalog"}}
            }</script><title>Page title</title></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/nested-furniture",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Page title",
      titleEvidence: "document_title",
    });
  });

  it("does not treat a non-Schema type URI as Schema.org evidence", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script type="application/ld+json">{
              "@type":"https://evil.example/Book","name":"Misleading metadata"
            }</script><title>Safe title</title></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/non-schema-type",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Safe title",
      titleEvidence: "document_title",
    });
  });

  it("keeps Type when equivalent Schema.org and Open Graph signals agree", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <script type="application/ld+json">{"@type":"VideoObject","name":"Lesson"}</script>
              <meta property="og:type" content="video.movie">
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/agreement",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Lesson",
      titleEvidence: "schema_org",
      type: "video",
      typeEvidence: "schema_org",
    });
  });

  it("uses the first meaningful title candidate within each evidence tier", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <script type="application/ld+json">{
                "@type":"Course","headline":"   ","name":"Course name"
              }</script>
              <meta property="og:title" content="   ">
              <meta property="og:title" content="Open Graph fallback">
              <title>Document fallback</title>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/meaningful-title",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      title: "Course name",
      titleEvidence: "schema_org",
    });
  });

  it("leaves Type unresolved for conflicting types on one primary entity", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head><script type="application/ld+json">{
              "@type":["Course","Book"],"name":"Ambiguous material"
            }</script></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/conflicting-entity",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Ambiguous material",
      titleEvidence: "schema_org",
    });
  });

  it("never infers Type from generic containers, embedded media, or title wording", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <script type="application/ld+json">{
                "@type":["WebPage","LearningResource"],
                "name":"Generic container",
                "video":{"@type":"VideoObject","name":"Embedded clip"}
              }</script>
              <meta property="og:type" content="website">
              <title>Complete course video</title>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://courses.example.com/video/course",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Complete course video",
      titleEvidence: "document_title",
    });
  });

  it("does not treat an unknown Open Graph video-like value as strong Type evidence", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            '<head><meta property="og:type" content="video.guess"><title>Title only</title></head>',
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/narrow-open-graph",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Title only",
      titleEvidence: "document_title",
    });
  });

  it("uses the first Open Graph Type in document order", async () => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>
              <meta property="og:type" content="article">
              <meta property="og:type" content="book">
              <title>First type wins</title>
            </head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/open-graph-order",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "First type wins",
      titleEvidence: "document_title",
      type: "article",
      typeEvidence: "open_graph",
    });
  });

  it.each([
    {
      caseName: "malformed JSON-LD",
      structuredMetadata:
        '<script type="application/ld+json">{"@type":"Book",</script>',
    },
    {
      caseName: "more than 16 JSON-LD blocks",
      structuredMetadata: `${Array.from(
        { length: 16 },
        () => '<script type="application/ld+json">{"@type":"WebPage"}</script>',
      ).join("")}<script type="application/ld+json">{"@type":"Book","name":"Too late"}</script>`,
    },
    {
      caseName: "more than 64 KiB of JSON-LD",
      structuredMetadata: `<script type="application/ld+json">{"@type":"WebPage","ignored":"${"x".repeat(64 * 1024)}"}</script><script type="application/ld+json">{"@type":"Book","name":"After the limit"}</script>`,
    },
    {
      caseName: "a document deeper than 16 JSON-LD levels",
      structuredMetadata: `<script type="application/ld+json">{"@type":"Course","name":"Too deep","ignored":${`${"[".repeat(17)}null${"]".repeat(17)}`}}</script>`,
    },
    {
      caseName: "a document larger than 2,000 visited JSON-LD nodes",
      structuredMetadata: `<script type="application/ld+json">{"@type":"Article","headline":"Too large","ignored":[${Array.from(
        { length: 2_000 },
        () => "null",
      ).join(",")}]}</script>`,
    },
  ])("ignores $caseName", async ({ structuredMetadata }) => {
    const get = vi.fn<GuardedPublicTransport["get"]>(() =>
      Promise.resolve({
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "text/html" },
          body: chunks([
            `<head>${structuredMetadata}<title>Safe fallback</title></head>`,
          ]),
          cancel: vi.fn(),
        },
      }),
    );

    await expect(
      createGenericSourceInspector({ transport: { get } })({
        source: "https://example.com/bounded-metadata",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: "suggested",
      title: "Safe fallback",
      titleEvidence: "document_title",
    });
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
