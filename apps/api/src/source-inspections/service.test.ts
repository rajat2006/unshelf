import { describe, expect, it, vi } from "vitest";
import { Type, type UserId } from "@unshelf/shared";
import type { CanonicalYouTubeSource } from "./classifier";
import {
  createSourceInspectionService,
  parseSourceInspectionDeniedHostnames,
  type SourceInspectionCompletion,
} from "./service";
import { createSourceInspectionAdmissionGate } from "./admission-gate";
import type { GenericSourceInspector } from "./generic-inspector";
import { anyValue } from "../../test/assertion-boundaries";

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
        admitDestination: anyValue(Function),
        reportDiagnostics: anyValue(Function),
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
      const completions: SourceInspectionCompletion[] = [];
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
          observeCompletion: (completion) => completions.push(completion),
        }),
      ).resolves.toEqual({
        ok: true,
        response: {
          status: "suggested",
          type: Type.Video,
          typeEvidence: "youtube_route",
        },
      });
      expect(completions[0]?.terminalCode).toBe(
        caseName === "cancellation" ? "cancelled" : "unexpected",
      );
    },
  );

  it("keeps local YouTube Type while recording an oEmbed terminal", async () => {
    const completions: SourceInspectionCompletion[] = [];
    const service = createSourceInspectionService({
      inspectYouTubeTitle: async (input) => {
        input.reportDiagnostics?.({ terminalCode: "timeout" });
        return null;
      },
    });

    await expect(
      service.inspect({
        source: "https://youtu.be/M7lc1UVf-VE",
        userId,
        signal: new AbortController().signal,
        observeCompletion: (completion) => completions.push(completion),
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type: Type.Video,
        typeEvidence: "youtube_route",
      },
    });
    expect(completions[0]?.terminalCode).toBe("timeout");
  });

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
      admitDestination: anyValue(Function),
      reportDiagnostics: anyValue(Function),
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

  it("reserves the tagged failure path for a classifier defect", async () => {
    const completions: SourceInspectionCompletion[] = [];
    const service = createSourceInspectionService({
      classify: () => {
        throw new Error("classifier defect");
      },
    });

    await expect(
      service.inspect({
        source: "https://example.com/article",
        userId,
        signal: new AbortController().signal,
        observeCompletion: (completion) => completions.push(completion),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "source_inspection_failed",
    });
    expect(completions[0]?.terminalCode).toBe("unexpected");
  });

  it("refuses User saturation immediately without starting or queueing work", async () => {
    const completions: Array<(value: { status: "unavailable" }) => void> = [];
    const inspectGeneric = vi.fn(
      () =>
        new Promise<{ status: "unavailable" }>((resolve) => {
          completions.push(resolve);
        }),
    );
    const service = createSourceInspectionService({
      admissionGate: createSourceInspectionAdmissionGate(),
      inspectGeneric,
    });

    const first = service.inspect({
      source: "https://first.example/article",
      userId,
      signal: new AbortController().signal,
    });
    const second = service.inspect({
      source: "https://second.example/article",
      userId,
      signal: new AbortController().signal,
    });

    await expect(
      service.inspect({
        source: "https://third.example/article",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
    expect(inspectGeneric).toHaveBeenCalledTimes(2);

    for (const complete of completions) complete({ status: "unavailable" });
    await Promise.all([first, second]);
  });

  it.each(["completion", "unexpected failure"])(
    "releases admission after generic $caseName",
    async (caseName) => {
      const admissionGate = createSourceInspectionAdmissionGate();
      const inspectGeneric = vi.fn(() =>
        caseName === "completion"
          ? Promise.resolve({ status: "unavailable" as const })
          : Promise.reject(new Error("unexpected")),
      );
      const service = createSourceInspectionService({
        admissionGate,
        inspectGeneric,
      });

      for (let index = 0; index < 3; index += 1) {
        await service.inspect({
          source: "https://shared.example/article",
          userId,
          signal: new AbortController().signal,
        });
      }

      expect(inspectGeneric).toHaveBeenCalledTimes(3);
    },
  );

  it.each([
    "refusal",
    "timeout",
    "cancellation",
    "unexpected failure",
    "YouTube completion",
  ])("releases an admitted permit after $caseName", async (caseName) => {
    const release = vi.fn();
    const controller = new AbortController();
    const inspectGeneric = vi.fn<GenericSourceInspector>(async (input) => {
      if (caseName === "refusal") {
        input.admitDestination?.({ hostname: "busy.example" });
        return { status: "unavailable" };
      }
      if (caseName === "timeout") {
        input.reportDiagnostics?.({ terminalCode: "timeout" });
        return { status: "unavailable" };
      }
      if (caseName === "cancellation") {
        controller.abort();
        throw new Error("cancelled");
      }
      throw new Error("unexpected");
    });
    const service = createSourceInspectionService({
      admissionGate: {
        tryAcquire: () => ({
          ok: true,
          permit: {
            tryMoveToHostname: () => caseName !== "refusal",
            release,
          },
        }),
      },
      inspectGeneric,
    });

    await service.inspect({
      source:
        caseName === "YouTube completion"
          ? "https://youtu.be/M7lc1UVf-VE"
          : "https://example.com/article",
      userId,
      signal: controller.signal,
    });

    expect(release).toHaveBeenCalledOnce();
  });

  it("denies an exact normalized hostname before every inspection adapter", async () => {
    const inspectGeneric = vi.fn();
    const inspectYouTubeTitle = vi.fn();
    const service = createSourceInspectionService({
      deniedHostnames: new Set(["blocked.example", "youtu.be"]),
      inspectGeneric,
      inspectYouTubeTitle,
    });

    await expect(
      service.inspect({
        source: "https://BLOCKED.example/article?secret=value",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
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
    expect(inspectGeneric).not.toHaveBeenCalled();
    expect(inspectYouTubeTitle).not.toHaveBeenCalled();
  });

  it("denies the fixed oEmbed destination even when the submitted host differs", async () => {
    const inspectYouTubeTitle = vi.fn();
    const service = createSourceInspectionService({
      deniedHostnames: new Set(["www.youtube.com"]),
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
      response: { status: "unavailable" },
    });
    expect(inspectYouTubeTitle).not.toHaveBeenCalled();
  });

  it("admits YouTube title acquisition against its fixed destination hostname", async () => {
    const tryAcquire = vi.fn(() => ({
      ok: true as const,
      permit: {
        tryMoveToHostname: () => true,
        release: vi.fn(),
      },
    }));
    const service = createSourceInspectionService({
      admissionGate: { tryAcquire },
    });

    await service.inspect({
      source: "https://youtu.be/M7lc1UVf-VE",
      userId,
      signal: new AbortController().signal,
    });

    expect(tryAcquire).toHaveBeenCalledWith({
      userId,
      hostname: "www.youtube.com",
    });
  });

  it("retains generic terminal and count buckets without inspected values", async () => {
    const completions: SourceInspectionCompletion[] = [];
    const inspectGeneric = vi.fn<GenericSourceInspector>(async (input) => {
      input.reportDiagnostics?.({
        terminalCode: "timeout",
        redirectCountBucket: "2-5",
        byteCountBucket: "65537-262144",
      });
      return { status: "unavailable" as const };
    });
    const service = createSourceInspectionService({ inspectGeneric });

    await service.inspect({
      source: "https://private-value.example/article?secret=value",
      userId,
      signal: new AbortController().signal,
      observeCompletion: (completion) => completions.push(completion),
    });

    expect(completions[0]).toMatchObject({
      strategy: "generic",
      terminalCode: "timeout",
      redirectCountBucket: "2-5",
      byteCountBucket: "65537-262144",
    });
    expect(JSON.stringify(completions)).not.toContain("private-value");
    expect(JSON.stringify(completions)).not.toContain("secret");
  });

  it("accumulates phase timings across sequential requests and redirects", async () => {
    const completions: SourceInspectionCompletion[] = [];
    const inspectGeneric = vi.fn<GenericSourceInspector>(async (input) => {
      input.reportDiagnostics?.({ phaseTimingsMs: { dns: 2 } });
      input.reportDiagnostics?.({ phaseTimingsMs: { connection: 3 } });
      input.reportDiagnostics?.({ phaseTimingsMs: { responseHeaders: 5 } });
      input.reportDiagnostics?.({ phaseTimingsMs: { dns: 7 } });
      input.reportDiagnostics?.({ phaseTimingsMs: { body: 11 } });
      input.reportDiagnostics?.({ terminalCode: "no_metadata" });
      return { status: "unavailable" };
    });

    await createSourceInspectionService({ inspectGeneric }).inspect({
      source: "https://example.com/article",
      userId,
      signal: new AbortController().signal,
      observeCompletion: (completion) => completions.push(completion),
    });

    expect(completions[0]?.phaseTimingsMs).toEqual({
      dns: 9,
      connection: 3,
      responseHeaders: 5,
      body: 11,
    });
  });

  it("normalizes the runtime exact-host deny list without widening it", () => {
    const deniedHostnames = parseSourceInspectionDeniedHostnames(
      " BLOCKED.example.,youtu.be,,blocked.example ",
    );

    expect([...deniedHostnames]).toEqual(["blocked.example", "youtu.be"]);
    expect(deniedHostnames.has("sub.blocked.example")).toBe(false);
  });

  it.each([
    {
      name: "global refusal for generic inspection",
      source: "https://generic.example/article",
      options: { disabled: true },
      terminalCode: "refused" as const,
      strategy: "generic" as const,
    },
    {
      name: "global refusal for YouTube inspection",
      source: "https://youtu.be/M7lc1UVf-VE",
      options: { disabled: true },
      terminalCode: "refused" as const,
      strategy: "youtube" as const,
    },
    {
      name: "unsupported YouTube route",
      source: "https://youtube.com/@creator",
      options: {},
      terminalCode: "unsupported" as const,
      strategy: "youtube" as const,
    },
  ])("records bounded completion fields for $name", async (testCase) => {
    const completions: SourceInspectionCompletion[] = [];
    const service = createSourceInspectionService({
      ...testCase.options,
      monotonicNow: (() => {
        let now = 100;
        return () => (now += 5);
      })(),
    });

    await service.inspect({
      source: testCase.source,
      userId,
      signal: new AbortController().signal,
      observeCompletion: (completion) => completions.push(completion),
    });

    expect(completions).toEqual([
      {
        strategy: testCase.strategy,
        terminalCode: testCase.terminalCode,
        suggestedTitle: false,
        suggestedType: false,
        durationMs: 5,
        phaseTimingsMs: {},
        redirectCountBucket: testCase.strategy === "youtube" ? "0" : "unknown",
        byteCountBucket: testCase.strategy === "youtube" ? "0" : "unknown",
      },
    ]);
  });
});
