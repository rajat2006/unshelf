import { SOURCE_INSPECTION_SOURCE_BYTE_LIMIT, Type } from "@unshelf/shared";
import { isIP } from "node:net";
import { classifySource } from "../classifier";
import type { SourceInspectionTerminalCode } from "../service";
import type { SourceInspectionReleaseObservation } from "./release-observation-runner";
export {
  collectSourceInspectionReleaseObservations,
  type InspectSourceForRelease,
  type SourceInspectionReleaseObservation,
  type SourceInspectionReleaseRuntime,
} from "./release-observation-runner";

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

interface SourceInspectionReleaseClassPolicy {
  readonly source:
    | { readonly classification: "generic" }
    | { readonly classification: "unsupported_youtube" }
    | { readonly classification: "youtube"; readonly type: Type };
  readonly expectation: {
    readonly outcome: "suggested" | "unavailable";
    readonly hasTitles: boolean;
    readonly types: readonly Type[];
  };
}

const sourceClassPolicies = {
  generic_title_type: {
    source: { classification: "generic" },
    expectation: {
      outcome: "suggested",
      hasTitles: true,
      types: [Type.Article, Type.Video, Type.Course, Type.Book],
    },
  },
  generic_title_only: {
    source: { classification: "generic" },
    expectation: { outcome: "suggested", hasTitles: true, types: [] },
  },
  generic_manual_fallback: {
    source: { classification: "generic" },
    expectation: { outcome: "unavailable", hasTitles: false, types: [] },
  },
  youtube_video: {
    source: { classification: "youtube", type: Type.Video },
    expectation: {
      outcome: "suggested",
      hasTitles: true,
      types: [Type.Video],
    },
  },
  youtube_playlist: {
    source: { classification: "youtube", type: Type.Playlist },
    expectation: {
      outcome: "suggested",
      hasTitles: true,
      types: [Type.Playlist],
    },
  },
  youtube_community_post: {
    source: { classification: "youtube", type: Type.Other },
    expectation: {
      outcome: "suggested",
      hasTitles: false,
      types: [Type.Other],
    },
  },
  youtube_unresolved: {
    source: { classification: "unsupported_youtube" },
    expectation: { outcome: "unavailable", hasTitles: false, types: [] },
  },
} satisfies Record<
  SourceInspectionReleaseClass,
  SourceInspectionReleaseClassPolicy
>;

const fallbackReasons = [
  "blocked_origin",
  "no_metadata",
  "redirect",
  "timeout",
  "unsupported_content",
] as const;

export type SourceInspectionReleaseFallbackReason =
  (typeof fallbackReasons)[number];

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
  readonly fallbackReason?: SourceInspectionReleaseFallbackReason;
}

export interface SourceInspectionReleaseManifest {
  readonly schemaVersion: 1;
  readonly corpusVersion: string;
  readonly cases: readonly SourceInspectionReleaseCase[];
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
  /(?:^|[-_])(auth|bearer|code|credential|expires|jwt|key|policy|secret|session|sig|signature|signed|token)(?:$|[-_])/iu;
const bearerLikeValue =
  /(?:^|[/#])(?:bearer(?:%20|\s)+)?eyJ[\w-]+\.[\w-]+\.[\w-]+(?:$|[/#?&])/iu;

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

interface ReleaseGateInput {
  readonly id: string;
  readonly actual: number;
  readonly threshold: number;
  readonly failureStatus?: "failed" | "disable_oembed";
}

const exactGate = createGate("exactly");
const atLeastGate = createGate("at_least");
const atMostGate = createGate("at_most");

function createGate(comparison: SourceInspectionReleaseGate["comparison"]) {
  return ({
    id,
    actual,
    threshold,
    failureStatus = "failed",
  }: ReleaseGateInput): SourceInspectionReleaseGate => {
    const passed =
      comparison === "exactly"
        ? actual === threshold
        : comparison === "at_least"
          ? actual >= threshold
          : actual <= threshold;
    return {
      id,
      status: passed ? "passed" : failureStatus,
      actual,
      threshold,
      comparison,
    };
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
    allowed: ["id", "sourceClass", "source", "expected", "fallbackReason"],
    path,
    issues,
  });
  const id = candidate.id;
  const sourceClass = candidate.sourceClass;
  const source = candidate.source;
  const fallbackReason = candidate.fallbackReason;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(id)) {
    issues.push(`${path}.id must be a stable opaque identifier`);
  }
  if (!isSourceClass(sourceClass)) {
    issues.push(`${path}.sourceClass must be an explicit supported class`);
  }
  if (typeof source !== "string" || !isNonSecretPublicSource(source)) {
    issues.push(`${path}.source must be a non-secret public HTTP(S) Source`);
  }
  if (
    typeof source === "string" &&
    isSourceClass(sourceClass) &&
    !sourceMatchesClass({ source, sourceClass })
  ) {
    issues.push(`${path}.source does not match sourceClass ${sourceClass}`);
  }
  if (
    sourceClass === "generic_manual_fallback"
      ? !isFallbackReason(fallbackReason)
      : fallbackReason !== undefined
  ) {
    issues.push(
      `${path}.fallbackReason must identify the generic manual-fallback category`,
    );
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
  return {
    id,
    sourceClass,
    source,
    expected,
    ...(isFallbackReason(fallbackReason) ? { fallbackReason } : {}),
  };
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
  const expectation = sourceClassPolicies[sourceClass].expectation;
  return (
    outcome === expectation.outcome &&
    hasTitles === expectation.hasTitles &&
    (expectation.types.length === 0
      ? type === undefined
      : expectation.types.some((expectedType) => expectedType === type))
  );
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
  const strongTypes = new Set(
    cases
      .filter((item) => item.sourceClass === "generic_title_type")
      .map((item) => item.expected.type),
  );
  for (const type of [Type.Article, Type.Video, Type.Course, Type.Book]) {
    if (!strongTypes.has(type)) {
      issues.push(
        `corpus must include strong expected Type evidence for ${type}`,
      );
    }
  }
  const representedFallbackReasons = new Set(
    cases.map((item) => item.fallbackReason).filter(isFallbackReason),
  );
  for (const reason of fallbackReasons) {
    if (!representedFallbackReasons.has(reason)) {
      issues.push(`corpus must include generic manual fallback for ${reason}`);
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
    new TextEncoder().encode(source).byteLength >
      SOURCE_INSPECTION_SOURCE_BYTE_LIMIT ||
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
  return !bearerLikeValue.test(`${url.pathname}${url.search}${url.hash}`);
}

function isFallbackReason(
  value: unknown,
): value is SourceInspectionReleaseFallbackReason {
  return fallbackReasons.some((reason) => reason === value);
}

function sourceMatchesClass({
  source,
  sourceClass,
}: {
  readonly source: string;
  readonly sourceClass: SourceInspectionReleaseClass;
}): boolean {
  const classification = classifySource(source);
  const expected = sourceClassPolicies[sourceClass].source;
  return (
    classification.classification === expected.classification &&
    (expected.classification !== "youtube" ||
      (classification.classification === "youtube" &&
        classification.type === expected.type))
  );
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
