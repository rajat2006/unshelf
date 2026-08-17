import { describe, expect, it, vi } from "vitest";
import { Type, type UserId } from "@unshelf/shared";
import type { CanonicalYouTubeSource } from "./classifier";
import { createSourceInspectionService } from "./service";

const userId = "a156d86a-09d3-4935-9bf0-1820fa357f90" as UserId;
const canonicalVideoSource =
  "https://www.youtube.com/watch?v=M7lc1UVf-VE" as CanonicalYouTubeSource;

describe("Source inspection service", () => {
  it.each([
    {
      source: "https://youtu.be/M7lc1UVf-VE?si=original-share-parameter",
      canonicalSource: canonicalVideoSource,
      type: Type.Video,
      title: "A video title",
    },
    {
      source:
        "https://youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs&si=original-share-parameter",
      canonicalSource:
        "https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
      type: Type.Playlist,
      title: "A playlist title",
    },
  ])(
    "adds an oEmbed title to a locally classified $type Source",
    async ({ source, canonicalSource, type, title }) => {
      const inspectYouTubeTitle = vi.fn(() => Promise.resolve(title));
      const service = createSourceInspectionService({ inspectYouTubeTitle });
      const signal = new AbortController().signal;

      await expect(
        service.inspect({ source, userId, signal }),
      ).resolves.toEqual({
        ok: true,
        response: {
          status: "suggested",
          title,
          titleEvidence: "youtube_oembed",
          type,
          typeEvidence: "youtube_route",
        },
      });
      expect(inspectYouTubeTitle).toHaveBeenCalledWith({
        canonicalSource,
        signal,
      });
    },
  );

  it("keeps local YouTube Type when oEmbed title acquisition is disabled", async () => {
    const inspectYouTubeTitle = vi.fn(() => Promise.resolve("Ignored title"));
    const service = createSourceInspectionService({
      youtubeTitlesDisabled: true,
      inspectYouTubeTitle,
    });

    await expect(
      service.inspect({
        source: "https://youtu.be/M7lc1UVf-VE",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type: Type.Video,
        typeEvidence: "youtube_route",
      },
    });
    expect(inspectYouTubeTitle).not.toHaveBeenCalled();
  });

  it.each(["origin failure", "cancellation"])(
    "keeps local YouTube Type after oEmbed $caseName",
    async (caseName) => {
      const controller = new AbortController();
      const inspectYouTubeTitle = vi.fn(
        ({ signal }: { readonly signal: AbortSignal }) => {
          if (caseName === "cancellation") controller.abort();
          return Promise.reject(
            signal.reason instanceof Error
              ? signal.reason
              : new Error("oEmbed failed"),
          );
        },
      );
      const service = createSourceInspectionService({ inspectYouTubeTitle });

      await expect(
        service.inspect({
          source: "https://youtu.be/M7lc1UVf-VE",
          userId,
          signal: controller.signal,
        }),
      ).resolves.toEqual({
        ok: true,
        response: {
          status: "suggested",
          type: Type.Video,
          typeEvidence: "youtube_route",
        },
      });
    },
  );

  it("keeps Community Posts network-free and Type-only", async () => {
    const inspectYouTubeTitle = vi.fn();
    const service = createSourceInspectionService({ inspectYouTubeTitle });

    await expect(
      service.inspect({
        source: "https://youtube.com/post/UgkxQ_xDEe4m2V7vYB6i3e0qfZ8pT5uJ",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type: Type.Other,
        typeEvidence: "youtube_route",
      },
    });
    expect(inspectYouTubeTitle).not.toHaveBeenCalled();
  });

  it.each([
    ["https://youtu.be/M7lc1UVf-VE", Type.Video],
    [
      "https://youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
      Type.Playlist,
    ],
    ["https://youtube.com/post/UgkxQ_xDEe4m2V7vYB6i3e0qfZ8pT5uJ", Type.Other],
  ])("suggests a locally classified YouTube Type", async (source, type) => {
    const service = createSourceInspectionService();

    await expect(
      service.inspect({ source, userId, signal: new AbortController().signal }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type,
        typeEvidence: "youtube_route",
      },
    });
  });

  it.each([
    "https://youtube.com/watch?v=M7lc1UVf-VE&list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    "https://example.com/article",
    "not a URL",
  ])("returns manual fallback for an unresolved Source", async (source) => {
    const service = createSourceInspectionService();

    await expect(
      service.inspect({ source, userId, signal: new AbortController().signal }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
  });

  it("returns a generic document title suggestion", async () => {
    const inspectGeneric = vi.fn(() =>
      Promise.resolve({
        status: "suggested" as const,
        title: "A useful public document",
        titleEvidence: "document_title" as const,
      }),
    );
    const service = createSourceInspectionService({ inspectGeneric });
    const signal = new AbortController().signal;

    await expect(
      service.inspect({
        source: "https://example.com/article?edition=current",
        userId,
        signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        title: "A useful public document",
        titleEvidence: "document_title",
      },
    });
    expect(inspectGeneric).toHaveBeenCalledWith({
      source: "https://example.com/article?edition=current",
      signal,
    });
  });

  it("never sends a supported YouTube Source to generic inspection", async () => {
    const inspectGeneric = vi.fn();
    const service = createSourceInspectionService({ inspectGeneric });

    await service.inspect({
      source: "https://youtu.be/M7lc1UVf-VE",
      userId,
      signal: new AbortController().signal,
    });

    expect(inspectGeneric).not.toHaveBeenCalled();
  });

  it("keeps the production-default kill switch off", async () => {
    const classify = vi.fn(() => ({
      classification: "youtube" as const,
      type: Type.Video as const,
      canonicalSource: canonicalVideoSource,
    }));
    const service = createSourceInspectionService({ classify });

    await expect(
      service.inspect({
        source: "https://youtu.be/M7lc1UVf-VE",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type: Type.Video,
        typeEvidence: "youtube_route",
      },
    });
    expect(classify).toHaveBeenCalledOnce();
  });

  it("returns manual fallback when the global kill switch is on", async () => {
    const classify = vi.fn(() => ({
      classification: "youtube" as const,
      type: Type.Video as const,
      canonicalSource: canonicalVideoSource,
    }));
    const service = createSourceInspectionService({
      disabled: true,
      classify,
    });

    await expect(
      service.inspect({
        source: "https://youtu.be/M7lc1UVf-VE",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it("refuses an over-limit working Source before classification", async () => {
    const classify = vi.fn();
    const service = createSourceInspectionService({
      classify,
    });

    await expect(
      service.inspect({
        source: `https://example.com/${"a".repeat(8 * 1024)}`,
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
    expect(classify).not.toHaveBeenCalled();
  });
});
