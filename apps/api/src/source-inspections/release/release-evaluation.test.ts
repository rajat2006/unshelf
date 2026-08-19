import { describe, expect, it } from "vitest";
import { Type, type SourceInspectionResponse } from "@unshelf/shared";
import {
  collectSourceInspectionReleaseObservations,
  evaluateSourceInspectionRelease,
  parseSourceInspectionReleaseManifest,
  type SourceInspectionReleaseCase,
  type SourceInspectionReleaseObservation,
} from "./release-evaluation";
import type { SourceInspectionCompletion } from "../service";
import { runSourceInspectionReleaseCommand } from "./release-command";

describe("Source inspection release manifest", () => {
  it("accepts the minimum private corpus distribution", () => {
    const result = parseSourceInspectionReleaseManifest(minimumManifest());

    expect(result.ok).toBe(true);
  });

  it.each([
    {
      caseName: "embedded credentials",
      source: "https://user:secret@publisher.com/article",
    },
    {
      caseName: "private Source",
      source: "https://learning.internal/article",
    },
    {
      caseName: "IP-literal Source",
      source: "https://127.0.0.1/article",
    },
    {
      caseName: "signed bearer-like Source",
      source: "https://publisher.com/article?access_token=secret",
    },
    {
      caseName: "short signed Source",
      source: "https://publisher.com/article?sig=secret",
    },
    {
      caseName: "path bearer Source",
      source:
        "https://publisher.com/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature/article",
    },
    {
      caseName: "fragment bearer Source",
      source:
        "https://publisher.com/article#eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    },
  ])("refuses a $caseName", ({ source }) => {
    const document = minimumManifest();
    document.cases[0] = { ...document.cases[0], source };

    expect(parseSourceInspectionReleaseManifest(document)).toMatchObject({
      ok: false,
      error: "invalid_manifest",
    });
  });

  it("requires an explicit expected class and stable unique case identity", () => {
    const document = minimumManifest();
    const first = document.cases[0];
    if (first === undefined) throw new Error("Expected a corpus case");
    document.cases[1] = {
      id: first.id,
      source: "https://publisher.com/duplicate",
      expected: first.expected,
    } as unknown as typeof first;

    expect(parseSourceInspectionReleaseManifest(document)).toMatchObject({
      ok: false,
      error: "invalid_manifest",
    });
  });

  it("refuses a Source whose local route does not match its declared class", () => {
    const document = minimumManifest();
    const youtubeCase = document.cases.find(
      (item) => item.sourceClass === "youtube_video",
    );
    if (youtubeCase === undefined) throw new Error("Expected a YouTube case");
    youtubeCase.source = "https://publisher.com/not-youtube";

    expect(parseSourceInspectionReleaseManifest(document)).toMatchObject({
      ok: false,
      error: "invalid_manifest",
    });
  });

  it("requires strong Type evidence across article, video, course, and book", () => {
    const document = minimumManifest();
    for (const [index, item] of document.cases.entries()) {
      if (item.sourceClass === "generic_title_type") {
        document.cases[index] = {
          ...item,
          expected: { ...item.expected, type: "article" },
        };
      }
    }

    expect(parseSourceInspectionReleaseManifest(document)).toMatchObject({
      ok: false,
      error: "invalid_manifest",
    });
  });

  it("requires every manual-fallback category", () => {
    const document = minimumManifest();
    for (const item of document.cases) {
      if (item.sourceClass === "generic_manual_fallback") {
        item.fallbackReason = "blocked_origin";
      }
    }

    expect(parseSourceInspectionReleaseManifest(document)).toMatchObject({
      ok: false,
      error: "invalid_manifest",
    });
  });
});

describe("Source inspection release gates", () => {
  it("recommends release from aggregate redacted evidence when every gate passes", () => {
    const parsed = parseSourceInspectionReleaseManifest(minimumManifest());
    if (!parsed.ok) throw new Error("Expected a valid manifest");
    const observations = passingObservations(parsed.manifest.cases);

    const report = evaluateSourceInspectionRelease({
      manifest: parsed.manifest,
      observations,
      region: "production-primary",
      qualification: passingQualification,
    });

    expect(report.recommendation).toBe("release");
    expect(report.gates.every((gate) => gate.status === "passed")).toBe(true);
    expect(report.classes.generic_title_type).toMatchObject({
      cases: 10,
      observations: 30,
      correctTitles: 30,
      correctTypes: 30,
      terminalCodes: { suggested: 30 },
      timingMs: { p50: 500, p95: 500, p99: 500 },
    });
    const retained = JSON.stringify(report);
    expect(retained).not.toContain("publisher.com");
    expect(retained).not.toContain("Expected title");
    expect(retained).not.toContain("material/");
    expect(retained).not.toContain("case-001");
  });

  it("recommends release with oEmbed disabled when only its title gate fails", () => {
    const parsed = parseSourceInspectionReleaseManifest(minimumManifest());
    if (!parsed.ok) throw new Error("Expected a valid manifest");
    const observations = passingObservations(parsed.manifest.cases).map(
      (observation) =>
        observation.sourceClass === "youtube_video" ||
        observation.sourceClass === "youtube_playlist"
          ? {
              ...observation,
              response: {
                status: "suggested" as const,
                type:
                  observation.sourceClass === "youtube_video"
                    ? Type.Video
                    : Type.Playlist,
                typeEvidence: "youtube_route" as const,
              } satisfies SourceInspectionResponse,
              completion: {
                ...observation.completion,
                terminalCode: "origin" as const,
                suggestedTitle: false,
              },
            }
          : observation,
    );

    const report = evaluateSourceInspectionRelease({
      manifest: parsed.manifest,
      observations,
      region: "production-primary",
      qualification: passingQualification,
    });

    expect(report.recommendation).toBe("release_without_oembed_titles");
    expect(report.gates).toContainEqual(
      expect.objectContaining({
        id: "youtube_oembed_title_extraction",
        status: "disable_oembed",
      }),
    );
    expect(report.gates.filter((gate) => gate.status === "failed")).toEqual([]);
  });

  it("blocks release on an incorrect Type or failed invariant evidence", () => {
    const parsed = parseSourceInspectionReleaseManifest(minimumManifest());
    if (!parsed.ok) throw new Error("Expected a valid manifest");
    const observations = passingObservations(parsed.manifest.cases);
    const first = observations[0];
    if (first === undefined) throw new Error("Expected an observation");
    observations[0] = {
      ...first,
      response: {
        status: "suggested",
        title: "Expected title",
        titleEvidence: "document_title",
        type: Type.Book,
        typeEvidence: "schema_org",
      },
    };

    const report = evaluateSourceInspectionRelease({
      manifest: parsed.manifest,
      observations,
      region: "production-primary",
      qualification: {
        ...passingQualification,
        safetyPrivacyCancellationLimitsNoWritePassed: false,
      },
    });

    expect(report.recommendation).toBe("blocked");
    expect(report.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "type_correctness",
          status: "failed",
        }),
        expect.objectContaining({
          id: "safety_privacy_cancellation_limits_no_write",
          status: "failed",
        }),
      ]),
    );
  });
});

describe("Source inspection release observation runner", () => {
  it("paces three observations per case at the production admission rate", async () => {
    const parsed = parseSourceInspectionReleaseManifest(minimumManifest());
    if (!parsed.ok) throw new Error("Expected a valid manifest");
    const cases = parsed.manifest.cases.slice(0, 2);
    let now = 0;
    const waits: number[] = [];
    const inspectedSources: string[] = [];

    const observations = await collectSourceInspectionReleaseObservations({
      cases,
      inspect: async ({ source, observeCompletion }) => {
        inspectedSources.push(source);
        observeCompletion(completionFor("generic"));
        return {
          ok: true,
          response: {
            status: "suggested",
            title: "Expected title",
            titleEvidence: "document_title",
            type: Type.Article,
            typeEvidence: "schema_org",
          },
        };
      },
      runtime: {
        nowMilliseconds: () => now,
        wait: (delayMs) => {
          waits.push(delayMs);
          now += delayMs;
          return Promise.resolve();
        },
        schedule: () => () => undefined,
      },
    });

    expect(observations).toHaveLength(6);
    expect(inspectedSources).toEqual([
      cases[0]?.source,
      cases[0]?.source,
      cases[0]?.source,
      cases[1]?.source,
      cases[1]?.source,
      cases[1]?.source,
    ]);
    expect(waits).toEqual(Array.from({ length: 5 }, () => 3_000));
  });

  it("settles a lost cancellation race at three seconds without retaining Source", async () => {
    const parsed = parseSourceInspectionReleaseManifest(minimumManifest());
    if (!parsed.ok) throw new Error("Expected a valid manifest");
    const releaseCase = parsed.manifest.cases[0];
    if (releaseCase === undefined) throw new Error("Expected a corpus case");
    let now = 0;
    let signal: AbortSignal | undefined;

    const observations = await collectSourceInspectionReleaseObservations({
      cases: [releaseCase],
      inspect: ({ signal: currentSignal }) => {
        signal = currentSignal;
        return new Promise(() => undefined);
      },
      runtime: {
        nowMilliseconds: () => now,
        wait: () => Promise.resolve(),
        schedule: ({ delayMs, callback }) => {
          queueMicrotask(() => {
            now += delayMs;
            callback();
          });
          return () => undefined;
        },
      },
    });

    expect(signal?.aborted).toBe(true);
    expect(observations).toHaveLength(3);
    expect(observations[0]).toMatchObject({
      response: { status: "unavailable" },
      completion: { terminalCode: "timeout", durationMs: 3_000 },
      callerDurationMs: 3_000,
    });
    expect(JSON.stringify(observations)).not.toContain("publisher.com");
  });
});

describe("Source inspection release command", () => {
  it("writes only an aggregate report and succeeds for a qualified corpus", async () => {
    const document = minimumManifest();
    const parsed = parseSourceInspectionReleaseManifest(document);
    if (!parsed.ok) throw new Error("Expected a valid manifest");
    const caseBySource = new Map(
      parsed.manifest.cases.map((item) => [item.source, item]),
    );
    let report = "";
    let now = 0;

    const exitCode = await runSourceInspectionReleaseCommand({
      args: [
        "--manifest",
        "/private/source-inspection-corpus.json",
        "--report",
        "/reports/source-inspection-release.json",
        "--region",
        "production-primary",
        "--commit",
        passingQualification.commit,
        "--deterministic-corpus-passed",
        "--client-lifecycle-passed",
        "--invariants-passed",
      ],
      repositoryRoot: "/workspace/unshelf",
      resolvePath: ({ path }) => path,
      readTextFile: () => JSON.stringify(document),
      writeTextFile: ({ value }) => {
        report = value;
      },
      writeLine: () => undefined,
      inspect: async ({ source, observeCompletion }) => {
        const releaseCase = caseBySource.get(source);
        if (releaseCase === undefined) throw new Error("Unknown case");
        const response = expectedResponse(releaseCase);
        observeCompletion({
          ...completionFor(
            releaseCase.sourceClass.startsWith("generic_")
              ? "generic"
              : "youtube",
          ),
          suggestedTitle:
            response.status === "suggested" && "title" in response,
          suggestedType: response.status === "suggested" && "type" in response,
          phaseTimingsMs:
            releaseCase.sourceClass === "youtube_community_post"
              ? {}
              : { body: 10 },
          byteCountBucket:
            releaseCase.sourceClass === "youtube_community_post"
              ? "0"
              : "1-65536",
        });
        return { ok: true, response };
      },
      runtime: {
        nowMilliseconds: () => now,
        wait: (delayMs) => {
          now += delayMs;
          return Promise.resolve();
        },
        schedule: () => () => undefined,
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(report)).toMatchObject({
      corpusVersion: "2026.08.1",
      recommendation: "release",
    });
    expect(report).not.toContain("publisher.com");
    expect(report).not.toContain("Expected title");
  });

  it("refuses to read a private manifest from the repository", async () => {
    let read = false;

    const exitCode = await runSourceInspectionReleaseCommand({
      args: [
        "--manifest",
        "/workspace/unshelf/private-corpus.json",
        "--report",
        "/reports/source-inspection-release.json",
        "--region",
        "production-primary",
        "--commit",
        passingQualification.commit,
        "--deterministic-corpus-passed",
        "--client-lifecycle-passed",
        "--invariants-passed",
      ],
      repositoryRoot: "/workspace/unshelf",
      resolvePath: ({ path }) => path,
      readTextFile: () => {
        read = true;
        return "{}";
      },
      writeTextFile: () => undefined,
      writeLine: () => undefined,
      inspect: () =>
        Promise.resolve({ ok: true, response: { status: "unavailable" } }),
      runtime: {
        nowMilliseconds: () => 0,
        wait: () => Promise.resolve(),
        schedule: () => () => undefined,
      },
    });

    expect(exitCode).toBe(1);
    expect(read).toBe(false);
  });

  it("refuses an outside manifest symlink that resolves into the repository", async () => {
    let read = false;

    const exitCode = await runSourceInspectionReleaseCommand({
      args: [
        "--manifest",
        "/private/source-inspection-corpus.json",
        "--report",
        "/reports/source-inspection-release.json",
        "--region",
        "production-primary",
        "--commit",
        passingQualification.commit,
        "--deterministic-corpus-passed",
        "--client-lifecycle-passed",
        "--invariants-passed",
      ],
      repositoryRoot: "/workspace/unshelf",
      resolvePath: () => "/workspace/unshelf/private-corpus.json",
      readTextFile: () => {
        read = true;
        return "{}";
      },
      writeTextFile: () => undefined,
      writeLine: () => undefined,
      inspect: () =>
        Promise.resolve({ ok: true, response: { status: "unavailable" } }),
      runtime: {
        nowMilliseconds: () => 0,
        wait: () => Promise.resolve(),
        schedule: () => () => undefined,
      },
    });

    expect(exitCode).toBe(1);
    expect(read).toBe(false);
  });
});

const passingQualification = {
  commit: "1234567890abcdef1234567890abcdef12345678",
  deterministicCorpusPassed: true,
  clientLifecyclePassed: true,
  safetyPrivacyCancellationLimitsNoWritePassed: true,
} as const;

function passingObservations(
  cases: readonly SourceInspectionReleaseCase[],
): SourceInspectionReleaseObservation[] {
  return cases.flatMap((releaseCase) =>
    Array.from({ length: 3 }, () => {
      const response = expectedResponse(releaseCase);
      const completion: SourceInspectionCompletion = {
        strategy: releaseCase.sourceClass.startsWith("generic_")
          ? "generic"
          : "youtube",
        terminalCode:
          response.status === "suggested" ? "suggested" : "unsupported",
        suggestedTitle: response.status === "suggested" && "title" in response,
        suggestedType: response.status === "suggested" && "type" in response,
        durationMs: 450,
        phaseTimingsMs:
          releaseCase.sourceClass === "youtube_community_post"
            ? {}
            : { body: 10 },
        redirectCountBucket: "0",
        byteCountBucket:
          releaseCase.sourceClass === "youtube_community_post"
            ? "0"
            : "1-65536",
      };
      return {
        caseId: releaseCase.id,
        sourceClass: releaseCase.sourceClass,
        response,
        completion,
        callerDurationMs: 500,
      };
    }),
  );
}

function expectedResponse(
  releaseCase: SourceInspectionReleaseCase,
): SourceInspectionResponse {
  if (releaseCase.expected.outcome === "unavailable") {
    return { status: "unavailable" };
  }
  const title = releaseCase.expected.acceptedTitles?.[0];
  const type = releaseCase.expected.type;
  return {
    status: "suggested",
    ...(title === undefined
      ? {}
      : { title, titleEvidence: "document_title" as const }),
    ...(type === undefined
      ? {}
      : { type, typeEvidence: "schema_org" as const }),
  } as SourceInspectionResponse;
}

function completionFor(
  strategy: SourceInspectionCompletion["strategy"],
): SourceInspectionCompletion {
  return {
    strategy,
    terminalCode: "suggested",
    suggestedTitle: true,
    suggestedType: true,
    durationMs: 450,
    phaseTimingsMs: { body: 10 },
    redirectCountBucket: "0",
    byteCountBucket: "1-65536",
  };
}

function minimumManifest() {
  let nextId = 0;
  const createCase = ({
    sourceClass,
    expected,
    fallbackReason,
  }: {
    sourceClass: string;
    expected: Readonly<Record<string, unknown>>;
    fallbackReason?: string;
  }) => {
    nextId += 1;
    const suffix = String(nextId).padStart(10, "0");
    const source =
      sourceClass === "youtube_video"
        ? `https://www.youtube.com/watch?v=v${suffix}`
        : sourceClass === "youtube_playlist"
          ? `https://www.youtube.com/playlist?list=PL${suffix}`
          : sourceClass === "youtube_community_post"
            ? `https://www.youtube.com/post/Ug${suffix}`
            : sourceClass === "youtube_unresolved"
              ? `https://www.youtube.com/@channel${suffix}`
              : `https://publisher.com/material/${nextId}`;
    return {
      id: `case-${String(nextId).padStart(3, "0")}`,
      sourceClass,
      source,
      expected,
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
    };
  };

  return {
    schemaVersion: 1,
    corpusVersion: "2026.08.1",
    cases: [
      ...Array.from({ length: 10 }, (_, index) =>
        createCase({
          sourceClass: "generic_title_type",
          expected: {
            outcome: "suggested",
            acceptedTitles: ["Expected title"],
            type: ["article", "video", "course", "book"][index % 4],
          },
        }),
      ),
      ...Array.from({ length: 10 }, () =>
        createCase({
          sourceClass: "generic_title_only",
          expected: {
            outcome: "suggested",
            acceptedTitles: ["Expected title"],
          },
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        createCase({
          sourceClass: "generic_manual_fallback",
          expected: { outcome: "unavailable" },
          fallbackReason: [
            "blocked_origin",
            "no_metadata",
            "redirect",
            "timeout",
            "unsupported_content",
          ][index % 5],
        }),
      ),
      ...Array.from({ length: 10 }, () =>
        createCase({
          sourceClass: "youtube_video",
          expected: {
            outcome: "suggested",
            acceptedTitles: ["Expected video"],
            type: "video",
          },
        }),
      ),
      ...Array.from({ length: 10 }, () =>
        createCase({
          sourceClass: "youtube_playlist",
          expected: {
            outcome: "suggested",
            acceptedTitles: ["Expected playlist"],
            type: "playlist",
          },
        }),
      ),
      ...Array.from({ length: 5 }, () =>
        createCase({
          sourceClass: "youtube_community_post",
          expected: { outcome: "suggested", type: "other" },
        }),
      ),
      ...Array.from({ length: 5 }, () =>
        createCase({
          sourceClass: "youtube_unresolved",
          expected: { outcome: "unavailable" },
        }),
      ),
    ],
  };
}
