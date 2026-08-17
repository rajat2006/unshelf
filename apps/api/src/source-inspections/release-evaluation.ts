import { Type, type SourceInspectionResponse } from "@unshelf/shared";
import { isIP } from "node:net";
import type {
  SourceInspectionCompletion,
  SourceInspectionServiceResult,
  SourceInspectionTerminalCode,
} from "./service";

const sourceClasses = [
  "generic_title_type",
  "generic_title_only",
  "generic_manual_fallback",
  "youtube_video",
  "youtube_playlist",
  "youtube_community_post",
  "youtube_unresolved",
] as const;

export type SourceInspectionReleaseClass = (typeof sourceClasses)[number];

interface SourceInspectionReleaseExpectation {
  readonly outcome: "suggested" | "unavailable";
  readonly acceptedTitles?: readonly string[];
  readonly type?: Type;
}

export interface SourceInspectionReleaseCase {
  readonly id: string;
  readonly sourceClass: SourceInspectionReleaseClass;
  readonly source: string;
  readonly expected: SourceInspectionReleaseExpectation;
}

export interface SourceInspectionReleaseManifest {
  readonly schemaVersion: 1;
  readonly corpusVersion: string;
  readonly cases: readonly SourceInspectionReleaseCase[];
}

export interface SourceInspectionReleaseObservation {
  readonly caseId: string;
  readonly sourceClass: SourceInspectionReleaseClass;
  readonly response: SourceInspectionResponse;
  readonly completion: SourceInspectionCompletion;
  readonly callerDurationMs: number;
}

export interface SourceInspectionQualificationEvidence {
  readonly commit: string;
  readonly deterministicCorpusPassed: boolean;
  readonly clientLifecyclePassed: boolean;
  readonly safetyPrivacyCancellationLimitsNoWritePassed: boolean;
}

export interface SourceInspectionReleaseGate {
  readonly id: string;
  readonly status: "passed" | "failed" | "disable_oembed";
  readonly actual: number;
  readonly threshold: number;
  readonly comparison: "at_least" | "at_most" | "exactly";
}

export interface SourceInspectionReleaseClassReport {
  readonly cases: number;
  readonly observations: number;
  readonly correctOutcomes: number;
  readonly correctTitles: number;
  readonly incorrectTitles: number;
  readonly correctTypes: number;
  readonly incorrectTypes: number;
  readonly timeouts: number;
  readonly terminalCodes: Readonly<
    Partial<Record<SourceInspectionTerminalCode, number>>
  >;
  readonly timingMs: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
  };
}

export interface SourceInspectionReleaseReport {
  readonly schemaVersion: 1;
  readonly corpusVersion: string;
  readonly qualificationCommit: string;
  readonly region: string;
  readonly observationsPerCase: 3;
  readonly recommendation:
    "release" | "release_without_oembed_titles" | "blocked";
  readonly classes: Readonly<
    Record<SourceInspectionReleaseClass, SourceInspectionReleaseClassReport>
  >;
  readonly gates: readonly SourceInspectionReleaseGate[];
}

export type InspectSourceForRelease = (input: {
  readonly source: string;
  readonly signal: AbortSignal;
  readonly observeCompletion: (completion: SourceInspectionCompletion) => void;
}) => Promise<SourceInspectionServiceResult>;

export interface SourceInspectionReleaseRuntime {
  readonly nowMilliseconds: () => number;
  readonly wait: (delayMs: number) => Promise<void>;
  readonly schedule: (input: {
    readonly delayMs: number;
    readonly callback: () => void;
  }) => () => void;
}

export type SourceInspectionReleaseManifestResult =
  | { readonly ok: true; readonly manifest: SourceInspectionReleaseManifest }
  | {
      readonly ok: false;
      readonly error: "invalid_manifest";
      readonly issues: readonly string[];
    };

const allowedTypes = new Set<string>(Object.values(Type));
const privateHostnameSuffixes = [
  ".home",
  ".internal",
  ".lan",
  ".local",
  ".localhost",
  ".onion",
  ".private",
  ".test",
] as const;
const signedParameterName =
  /(?:^|[-_])(auth|bearer|credential|jwt|key|secret|session|signature|signed|token)(?:$|[-_])/iu;

export function parseSourceInspectionReleaseManifest(
  document: unknown,
): SourceInspectionReleaseManifestResult {
  const issues: string[] = [];
  if (!isRecord(document)) return invalid(["manifest must be an object"]);
  requireExactKeys({
    value: document,
    allowed: ["schemaVersion", "corpusVersion", "cases"],
    path: "manifest",
    issues,
  });
  if (document.schemaVersion !== 1) {
    issues.push("schemaVersion must be 1");
  }
  if (
    typeof document.corpusVersion !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(document.corpusVersion)
  ) {
    issues.push("corpusVersion must be a stable version identifier");
  }
  if (!Array.isArray(document.cases)) {
    issues.push("cases must be an array");
    return invalid(issues);
  }

  const cases: SourceInspectionReleaseCase[] = [];
  const identities = new Set<string>();
  for (const [index, candidate] of document.cases.entries()) {
    const parsed = parseCase({ candidate, index, issues });
    if (parsed === null) continue;
    if (identities.has(parsed.id)) {
      issues.push(`cases[${index}].id must be unique`);
    }
    identities.add(parsed.id);
    cases.push(parsed);
  }
  validateDistribution({ cases, issues });

  if (issues.length > 0 || typeof document.corpusVersion !== "string") {
    return invalid(issues);
  }
  return {
    ok: true,
    manifest: {
      schemaVersion: 1,
      corpusVersion: document.corpusVersion,
      cases,
    },
  };
}

export function evaluateSourceInspectionRelease({
  manifest,
  observations,
  region,
  qualification,
}: {
  readonly manifest: SourceInspectionReleaseManifest;
  readonly observations: readonly SourceInspectionReleaseObservation[];
  readonly region: string;
  readonly qualification: SourceInspectionQualificationEvidence;
}): SourceInspectionReleaseReport {
  const caseById = new Map(manifest.cases.map((item) => [item.id, item]));
  const matched = observations.filter(
    (observation) =>
      caseById.get(observation.caseId)?.sourceClass === observation.sourceClass,
  );
  const classes = Object.fromEntries(
    sourceClasses.map((sourceClass) => [
      sourceClass,
      summarizeClass({
        cases: manifest.cases.filter(
          (item) => item.sourceClass === sourceClass,
        ),
        observations: matched.filter(
          (observation) => observation.sourceClass === sourceClass,
        ),
        caseById,
      }),
    ]),
  ) as Record<SourceInspectionReleaseClass, SourceInspectionReleaseClassReport>;

  const suggestionDurations = matched
    .filter(
      (observation) =>
        observation.response.status === "suggested" &&
        observation.completion.terminalCode !== "timeout",
    )
    .map((observation) => observation.callerDurationMs);
  const genericTitle = combineClassCounts({
    classes,
    sourceClasses: ["generic_title_type", "generic_title_only"],
  });
  const youtubeOEmbed = combineClassCounts({
    classes,
    sourceClasses: ["youtube_video", "youtube_playlist"],
  });
  const blockingIncorrectTitles = sourceClasses
    .filter(
      (sourceClass) =>
        sourceClass !== "youtube_video" && sourceClass !== "youtube_playlist",
    )
    .reduce(
      (total, sourceClass) => total + classes[sourceClass].incorrectTitles,
      0,
    );
  const incorrectTypes = sourceClasses.reduce(
    (total, sourceClass) => total + classes[sourceClass].incorrectTypes,
    0,
  );
  const communityNetworkFree = matched.filter(
    (observation) =>
      observation.sourceClass === "youtube_community_post" &&
      observation.completion.suggestedTitle === false &&
      Object.keys(observation.completion.phaseTimingsMs).length === 0 &&
      observation.completion.byteCountBucket === "0" &&
      observation.completion.redirectCountBucket === "0",
  ).length;
  const observationCountIsExact =
    matched.length === observations.length &&
    manifest.cases.every(
      (item) =>
        matched.filter((observation) => observation.caseId === item.id)
          .length === 3,
    );

  const gates: SourceInspectionReleaseGate[] = [
    exactGate({
      id: "three_observations_per_case",
      actual: observationCountIsExact ? 1 : 0,
      threshold: 1,
    }),
    exactGate({
      id: "deterministic_corpus",
      actual: qualification.deterministicCorpusPassed ? 1 : 0,
      threshold: 1,
    }),
    exactGate({
      id: "client_lifecycle",
      actual: qualification.clientLifecyclePassed ? 1 : 0,
      threshold: 1,
    }),
    exactGate({
      id: "safety_privacy_cancellation_limits_no_write",
      actual: qualification.safetyPrivacyCancellationLimitsNoWritePassed
        ? 1
        : 0,
      threshold: 1,
    }),
    atMostGate({
      id: "client_deadline_ms",
      actual: maximum(matched.map((item) => item.callerDurationMs)),
      threshold: 3_000,
    }),
    atMostGate({
      id: "server_deadline_ms",
      actual: maximum(matched.map((item) => item.completion.durationMs)),
      threshold: 2_500,
    }),
    atMostGate({
      id: "suggestion_latency_p50_ms",
      actual: percentile({ values: suggestionDurations, percentile: 0.5 }),
      threshold: 1_000,
    }),
    atMostGate({
      id: "suggestion_latency_p95_ms",
      actual: percentile({ values: suggestionDurations, percentile: 0.95 }),
      threshold: 2_500,
    }),
    exactGate({
      id: "title_correctness",
      actual: blockingIncorrectTitles,
      threshold: 0,
    }),
    exactGate({
      id: "youtube_oembed_title_correctness",
      actual: youtubeOEmbed.incorrectTitles,
      threshold: 0,
      failureStatus: "disable_oembed",
    }),
    exactGate({
      id: "type_correctness",
      actual: incorrectTypes,
      threshold: 0,
    }),
    atLeastGate({
      id: "generic_title_extraction",
      actual: ratio({
        numerator: genericTitle.correctTitles,
        denominator: genericTitle.observations,
      }),
      threshold: 0.9,
    }),
    atLeastGate({
      id: "generic_type_extraction",
      actual: ratio({
        numerator: classes.generic_title_type.correctTypes,
        denominator: classes.generic_title_type.observations,
      }),
      threshold: 0.9,
    }),
    atLeastGate({
      id: "generic_manual_fallback",
      actual: ratio({
        numerator: classes.generic_manual_fallback.correctOutcomes,
        denominator: classes.generic_manual_fallback.observations,
      }),
      threshold: 1,
    }),
    atLeastGate({
      id: "youtube_supported_type",
      actual: ratio({
        numerator:
          classes.youtube_video.correctTypes +
          classes.youtube_playlist.correctTypes +
          classes.youtube_community_post.correctTypes,
        denominator:
          classes.youtube_video.observations +
          classes.youtube_playlist.observations +
          classes.youtube_community_post.observations,
      }),
      threshold: 1,
    }),
    atLeastGate({
      id: "youtube_community_post_network_free",
      actual: ratio({
        numerator: communityNetworkFree,
        denominator: classes.youtube_community_post.observations,
      }),
      threshold: 1,
    }),
    atLeastGate({
      id: "youtube_unresolved",
      actual: ratio({
        numerator: classes.youtube_unresolved.correctOutcomes,
        denominator: classes.youtube_unresolved.observations,
      }),
      threshold: 1,
    }),
    atLeastGate({
      id: "youtube_oembed_title_extraction",
      actual: ratio({
        numerator: youtubeOEmbed.correctTitles,
        denominator: youtubeOEmbed.observations,
      }),
      threshold: 0.9,
      failureStatus: "disable_oembed",
    }),
    ...timeoutGates(classes),
  ];
  const recommendation = gates.some((gate) => gate.status === "failed")
    ? "blocked"
    : gates.some((gate) => gate.status === "disable_oembed")
      ? "release_without_oembed_titles"
      : "release";

  return {
    schemaVersion: 1,
    corpusVersion: manifest.corpusVersion,
    qualificationCommit: qualification.commit,
    region,
    observationsPerCase: 3,
    recommendation,
    classes,
    gates,
  };
}

export async function collectSourceInspectionReleaseObservations({
  cases,
  inspect,
  runtime,
}: {
  readonly cases: readonly SourceInspectionReleaseCase[];
  readonly inspect: InspectSourceForRelease;
  readonly runtime: SourceInspectionReleaseRuntime;
}): Promise<SourceInspectionReleaseObservation[]> {
  const observations: SourceInspectionReleaseObservation[] = [];
  let lastStartedAt: number | undefined;
  for (const releaseCase of cases) {
    for (let observation = 0; observation < 3; observation += 1) {
      if (lastStartedAt !== undefined) {
        const untilNextStart = Math.max(
          0,
          lastStartedAt + 3_000 - runtime.nowMilliseconds(),
        );
        if (untilNextStart > 0) await runtime.wait(untilNextStart);
      }
      const startedAt = runtime.nowMilliseconds();
      lastStartedAt = startedAt;
      observations.push(
        await observeReleaseCase({ releaseCase, inspect, runtime, startedAt }),
      );
    }
  }
  return observations;
}

async function observeReleaseCase({
  releaseCase,
  inspect,
  runtime,
  startedAt,
}: {
  readonly releaseCase: SourceInspectionReleaseCase;
  readonly inspect: InspectSourceForRelease;
  readonly runtime: SourceInspectionReleaseRuntime;
  readonly startedAt: number;
}): Promise<SourceInspectionReleaseObservation> {
  const controller = new AbortController();
  let completion: SourceInspectionCompletion | undefined;
  let cancelDeadline = (): void => undefined;
  const timedOut = new Promise<{
    readonly response: SourceInspectionResponse;
    readonly completion: SourceInspectionCompletion;
  }>((resolve) => {
    const finish = (): void => {
      controller.abort(new Error("Source inspection release deadline"));
      resolve({
        response: { status: "unavailable" },
        completion: syntheticCompletion({
          sourceClass: releaseCase.sourceClass,
          terminalCode: "timeout",
          durationMs: 3_000,
        }),
      });
    };
    cancelDeadline = runtime.schedule({ delayMs: 3_000, callback: finish });
  });
  const inspected = Promise.resolve()
    .then(() =>
      inspect({
        source: releaseCase.source,
        signal: controller.signal,
        observeCompletion: (value) => {
          completion = value;
        },
      }),
    )
    .then((result) => ({
      response: result.ok
        ? result.response
        : ({ status: "unavailable" } as const),
      completion:
        completion ??
        syntheticCompletion({
          sourceClass: releaseCase.sourceClass,
          terminalCode: "unexpected",
          durationMs: Math.max(0, runtime.nowMilliseconds() - startedAt),
        }),
    }))
    .catch(() => ({
      response: { status: "unavailable" } as const,
      completion: syntheticCompletion({
        sourceClass: releaseCase.sourceClass,
        terminalCode: controller.signal.aborted ? "cancelled" : "unexpected",
        durationMs: Math.max(0, runtime.nowMilliseconds() - startedAt),
      }),
    }));
  const result = await Promise.race([inspected, timedOut]);
  cancelDeadline();
  return {
    caseId: releaseCase.id,
    sourceClass: releaseCase.sourceClass,
    response: result.response,
    completion: result.completion,
    callerDurationMs: Math.max(0, runtime.nowMilliseconds() - startedAt),
  };
}

function syntheticCompletion({
  sourceClass,
  terminalCode,
  durationMs,
}: {
  readonly sourceClass: SourceInspectionReleaseClass;
  readonly terminalCode: SourceInspectionTerminalCode;
  readonly durationMs: number;
}): SourceInspectionCompletion {
  return {
    strategy: sourceClass.startsWith("generic_") ? "generic" : "youtube",
    terminalCode,
    suggestedTitle: false,
    suggestedType: false,
    durationMs,
    phaseTimingsMs: {},
    redirectCountBucket: "unknown",
    byteCountBucket: "unknown",
  };
}

function summarizeClass({
  cases,
  observations,
  caseById,
}: {
  readonly cases: readonly SourceInspectionReleaseCase[];
  readonly observations: readonly SourceInspectionReleaseObservation[];
  readonly caseById: ReadonlyMap<string, SourceInspectionReleaseCase>;
}): SourceInspectionReleaseClassReport {
  let correctOutcomes = 0;
  let correctTitles = 0;
  let incorrectTitles = 0;
  let correctTypes = 0;
  let incorrectTypes = 0;
  let timeouts = 0;
  const terminalCodes: Partial<Record<SourceInspectionTerminalCode, number>> =
    {};
  for (const observation of observations) {
    const releaseCase = caseById.get(observation.caseId);
    if (releaseCase === undefined) continue;
    if (observation.response.status === releaseCase.expected.outcome) {
      correctOutcomes += 1;
    }
    const returnedTitle =
      observation.response.status === "suggested" &&
      "title" in observation.response
        ? observation.response.title
        : undefined;
    const acceptedTitles = releaseCase.expected.acceptedTitles;
    if (returnedTitle !== undefined) {
      if (acceptedTitles?.includes(returnedTitle) === true) correctTitles += 1;
      else incorrectTitles += 1;
    }
    const returnedType =
      observation.response.status === "suggested" &&
      "type" in observation.response
        ? observation.response.type
        : undefined;
    if (returnedType !== undefined) {
      if (returnedType === releaseCase.expected.type) correctTypes += 1;
      else incorrectTypes += 1;
    }
    if (observation.completion.terminalCode === "timeout") timeouts += 1;
    terminalCodes[observation.completion.terminalCode] =
      (terminalCodes[observation.completion.terminalCode] ?? 0) + 1;
  }
  const durations = observations.map((item) => item.callerDurationMs);
  return {
    cases: cases.length,
    observations: observations.length,
    correctOutcomes,
    correctTitles,
    incorrectTitles,
    correctTypes,
    incorrectTypes,
    timeouts,
    terminalCodes,
    timingMs: {
      p50: percentile({ values: durations, percentile: 0.5 }),
      p95: percentile({ values: durations, percentile: 0.95 }),
      p99: percentile({ values: durations, percentile: 0.99 }),
    },
  };
}

function combineClassCounts({
  classes,
  sourceClasses: selected,
}: {
  readonly classes: Readonly<
    Record<SourceInspectionReleaseClass, SourceInspectionReleaseClassReport>
  >;
  readonly sourceClasses: readonly SourceInspectionReleaseClass[];
}): Pick<
  SourceInspectionReleaseClassReport,
  "observations" | "correctTitles" | "incorrectTitles"
> {
  return selected.reduce(
    (total, sourceClass) => ({
      observations: total.observations + classes[sourceClass].observations,
      correctTitles: total.correctTitles + classes[sourceClass].correctTitles,
      incorrectTitles:
        total.incorrectTitles + classes[sourceClass].incorrectTitles,
    }),
    { observations: 0, correctTitles: 0, incorrectTitles: 0 },
  );
}

function timeoutGates(
  classes: Readonly<
    Record<SourceInspectionReleaseClass, SourceInspectionReleaseClassReport>
  >,
): SourceInspectionReleaseGate[] {
  return (
    [
      "generic_title_type",
      "generic_title_only",
      "youtube_video",
      "youtube_playlist",
      "youtube_community_post",
    ] as const
  ).map((sourceClass) =>
    atMostGate({
      id: `timeout_rate_${sourceClass}`,
      actual: ratio({
        numerator: classes[sourceClass].timeouts,
        denominator: classes[sourceClass].observations,
      }),
      threshold: 0.1,
      ...(sourceClass === "youtube_video" || sourceClass === "youtube_playlist"
        ? { failureStatus: "disable_oembed" as const }
        : {}),
    }),
  );
}

function exactGate({
  id,
  actual,
  threshold,
  failureStatus = "failed",
}: {
  readonly id: string;
  readonly actual: number;
  readonly threshold: number;
  readonly failureStatus?: "failed" | "disable_oembed";
}): SourceInspectionReleaseGate {
  return {
    id,
    status: actual === threshold ? "passed" : failureStatus,
    actual,
    threshold,
    comparison: "exactly",
  };
}

function atLeastGate({
  id,
  actual,
  threshold,
  failureStatus = "failed",
}: {
  readonly id: string;
  readonly actual: number;
  readonly threshold: number;
  readonly failureStatus?: "failed" | "disable_oembed";
}): SourceInspectionReleaseGate {
  return {
    id,
    status: actual >= threshold ? "passed" : failureStatus,
    actual,
    threshold,
    comparison: "at_least",
  };
}

function atMostGate({
  id,
  actual,
  threshold,
  failureStatus = "failed",
}: {
  readonly id: string;
  readonly actual: number;
  readonly threshold: number;
  readonly failureStatus?: "failed" | "disable_oembed";
}): SourceInspectionReleaseGate {
  return {
    id,
    status: actual <= threshold ? "passed" : failureStatus,
    actual,
    threshold,
    comparison: "at_most",
  };
}

function ratio({
  numerator,
  denominator,
}: {
  readonly numerator: number;
  readonly denominator: number;
}): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function maximum(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function percentile({
  values,
  percentile: requested,
}: {
  readonly values: readonly number[];
  readonly percentile: number;
}): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(requested * sorted.length) - 1] ?? 0;
}

function parseCase({
  candidate,
  index,
  issues,
}: {
  readonly candidate: unknown;
  readonly index: number;
  readonly issues: string[];
}): SourceInspectionReleaseCase | null {
  const path = `cases[${index}]`;
  if (!isRecord(candidate)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  requireExactKeys({
    value: candidate,
    allowed: ["id", "sourceClass", "source", "expected"],
    path,
    issues,
  });
  const id = candidate.id;
  const sourceClass = candidate.sourceClass;
  const source = candidate.source;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(id)) {
    issues.push(`${path}.id must be a stable opaque identifier`);
  }
  if (!isSourceClass(sourceClass)) {
    issues.push(`${path}.sourceClass must be an explicit supported class`);
  }
  if (typeof source !== "string" || !isNonSecretPublicSource(source)) {
    issues.push(`${path}.source must be a non-secret public HTTP(S) Source`);
  }
  const expected = parseExpectation({
    candidate: candidate.expected,
    sourceClass,
    path: `${path}.expected`,
    issues,
  });
  if (
    typeof id !== "string" ||
    !isSourceClass(sourceClass) ||
    typeof source !== "string" ||
    expected === null
  ) {
    return null;
  }
  return { id, sourceClass, source, expected };
}

function parseExpectation({
  candidate,
  sourceClass,
  path,
  issues,
}: {
  readonly candidate: unknown;
  readonly sourceClass: unknown;
  readonly path: string;
  readonly issues: string[];
}): SourceInspectionReleaseExpectation | null {
  if (!isRecord(candidate)) {
    issues.push(`${path} must be an object`);
    return null;
  }
  requireExactKeys({
    value: candidate,
    allowed: ["outcome", "acceptedTitles", "type"],
    path,
    issues,
  });
  const outcome = candidate.outcome;
  const acceptedTitles = candidate.acceptedTitles;
  const type = candidate.type;
  if (outcome !== "suggested" && outcome !== "unavailable") {
    issues.push(`${path}.outcome must be explicit`);
    return null;
  }
  if (
    acceptedTitles !== undefined &&
    (!Array.isArray(acceptedTitles) ||
      acceptedTitles.length === 0 ||
      acceptedTitles.length > 8 ||
      !acceptedTitles.every(
        (title) =>
          typeof title === "string" &&
          title.trim().length > 0 &&
          [...title].length <= 512,
      ))
  ) {
    issues.push(`${path}.acceptedTitles must contain nonblank strings`);
    return null;
  }
  if (
    type !== undefined &&
    (typeof type !== "string" || !allowedTypes.has(type))
  ) {
    issues.push(`${path}.type must be an Unshelf Type`);
    return null;
  }
  if (!isSourceClass(sourceClass)) return null;
  if (
    !expectationMatchesClass({
      sourceClass,
      outcome,
      hasTitles: acceptedTitles !== undefined,
      type,
    })
  ) {
    issues.push(`${path} does not match sourceClass ${sourceClass}`);
  }
  return {
    outcome,
    ...(acceptedTitles === undefined
      ? {}
      : { acceptedTitles: acceptedTitles as string[] }),
    ...(type === undefined ? {} : { type: type as Type }),
  };
}

function expectationMatchesClass({
  sourceClass,
  outcome,
  hasTitles,
  type,
}: {
  readonly sourceClass: SourceInspectionReleaseClass;
  readonly outcome: "suggested" | "unavailable";
  readonly hasTitles: boolean;
  readonly type: unknown;
}): boolean {
  switch (sourceClass) {
    case "generic_title_type":
      return (
        outcome === "suggested" &&
        hasTitles &&
        (type === Type.Article ||
          type === Type.Video ||
          type === Type.Course ||
          type === Type.Book)
      );
    case "generic_title_only":
      return outcome === "suggested" && hasTitles && type === undefined;
    case "generic_manual_fallback":
    case "youtube_unresolved":
      return outcome === "unavailable" && !hasTitles && type === undefined;
    case "youtube_video":
      return outcome === "suggested" && hasTitles && type === Type.Video;
    case "youtube_playlist":
      return outcome === "suggested" && hasTitles && type === Type.Playlist;
    case "youtube_community_post":
      return outcome === "suggested" && !hasTitles && type === Type.Other;
  }
}

function validateDistribution({
  cases,
  issues,
}: {
  readonly cases: readonly SourceInspectionReleaseCase[];
  readonly issues: string[];
}): void {
  const counts = new Map<SourceInspectionReleaseClass, number>();
  for (const sourceClass of sourceClasses) counts.set(sourceClass, 0);
  for (const item of cases) {
    counts.set(item.sourceClass, (counts.get(item.sourceClass) ?? 0) + 1);
  }
  const minimums: Readonly<
    Partial<Record<SourceInspectionReleaseClass, number>>
  > = {
    generic_title_type: 8,
    generic_title_only: 10,
    generic_manual_fallback: 10,
    youtube_video: 8,
    youtube_playlist: 6,
    youtube_community_post: 3,
    youtube_unresolved: 3,
  };
  if (cases.length < 60) issues.push("corpus must contain at least 60 cases");
  const genericTitleCases =
    (counts.get("generic_title_type") ?? 0) +
    (counts.get("generic_title_only") ?? 0);
  if (genericTitleCases < 20) {
    issues.push("corpus must contain at least 20 generic title-capable cases");
  }
  for (const [sourceClass, minimum] of Object.entries(minimums)) {
    if (
      (counts.get(sourceClass as SourceInspectionReleaseClass) ?? 0) < minimum
    ) {
      issues.push(`corpus does not meet the ${sourceClass} minimum`);
    }
  }
}

function isNonSecretPublicSource(source: string): boolean {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return false;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hostname.length === 0 ||
    url.port.length > 0 ||
    isIP(url.hostname) !== 0 ||
    url.hostname.toLowerCase() === "localhost" ||
    !url.hostname.includes(".") ||
    new TextEncoder().encode(source).byteLength > 8 * 1024 ||
    privateHostnameSuffixes.some((suffix) =>
      url.hostname.toLowerCase().endsWith(suffix),
    )
  ) {
    return false;
  }
  for (const [name, value] of url.searchParams) {
    if (
      signedParameterName.test(name) ||
      /^bearer\s/iu.test(value) ||
      /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/u.test(value)
    ) {
      return false;
    }
  }
  return true;
}

function isSourceClass(value: unknown): value is SourceInspectionReleaseClass {
  return sourceClasses.some((sourceClass) => sourceClass === value);
}

function requireExactKeys({
  value,
  allowed,
  path,
  issues,
}: {
  readonly value: Readonly<Record<string, unknown>>;
  readonly allowed: readonly string[];
  readonly path: string;
  readonly issues: string[];
}): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`${path}.${key} is not allowed`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(
  issues: readonly string[],
): SourceInspectionReleaseManifestResult {
  return { ok: false, error: "invalid_manifest", issues };
}
