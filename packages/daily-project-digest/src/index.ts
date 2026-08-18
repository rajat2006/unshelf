import {
  AIPresentationFailure,
  DigestFailure,
  type AIPresentationFailureReason,
} from "./failures.js";
import { asRecord } from "./provider-support.js";

export type DiscordPayload = {
  allowed_mentions: { parse: [] };
  content?: string;
  embeds?: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string }>;
    footer: { text: string };
    timestamp: string;
  }>;
};

type DependencyEvidence = {
  state: "OPEN" | "CLOSED";
};

type ClosingIssueEvidence = {
  state: "OPEN" | "CLOSED";
  labels: string[];
  blockedBy: DependencyEvidence[];
};

export type PullRequestEvidence = {
  state: "OPEN" | "CLOSED" | "MERGED";
  mergedAt: string | null;
  number: number;
  title: string;
  baseRefName: string;
  headRefName: string;
  headRepository: string | null;
  labels: string[];
  isDraft: boolean;
  headContainsMain: boolean;
  blockedBy: DependencyEvidence[];
  closingIssues: ClosingIssueEvidence[];
};

export type DeploymentEvidence = {
  environment: string;
  status:
    | "error"
    | "failure"
    | "inactive"
    | "in_progress"
    | "pending"
    | "queued"
    | "success";
  statusAt: string;
  sha: string;
  reachableFromMain: boolean;
  newlyContainedPullRequests: PullRequestEvidence[];
};

type WayfinderRouteEvidence = {
  state: "OPEN" | "CLOSED";
  labels: string[];
  blockedBy: DependencyEvidence[];
};

export type WayfinderMapEvidence = {
  state: "OPEN" | "CLOSED";
  stateReason: "COMPLETED" | "NOT_PLANNED" | "REOPENED" | null;
  closedAt: string | null;
  number: number;
  title: string;
  labels: string[];
  children: WayfinderRouteEvidence[];
};

export type ClockAdapter = {
  now(): Date;
};

type DigestWindow = {
  windowStart: Date;
  windowEnd: Date;
};

export type GitHubAdapter = {
  listPullRequests(window: DigestWindow): Promise<PullRequestEvidence[]>;
  listDeployments(window: DigestWindow): Promise<DeploymentEvidence[]>;
  listWayfinderMaps(window: DigestWindow): Promise<WayfinderMapEvidence[]>;
};

export type SummaryAdapter = {
  writePreview(payload: DiscordPayload): Promise<void>;
};

export type OpenAIPresentationInput = {
  schemaVersion: "1";
  subjects: Array<{
    subjectId: string;
    kind: "pull-request" | "wayfinder-map";
    facts: Array<{
      id: string;
      value: string;
      source: "github_untrusted";
    }>;
  }>;
};

export type OpenAIAdapterBoundary =
  | { availability: "unavailable" }
  | {
      generatePresentation(input: OpenAIPresentationInput): Promise<unknown>;
    };

type UnavailableAdapter = { availability: "unavailable" };

export type DiscordAdapterBoundary =
  | UnavailableAdapter
  | {
      deliver(payload: DiscordPayload): Promise<void>;
    };

export type PreviewAdapters = {
  clock: ClockAdapter;
  github: GitHubAdapter;
  summary: SummaryAdapter;
  openai: OpenAIAdapterBoundary;
  discord: UnavailableAdapter;
};

export type DeliveryAdapters = {
  clock: ClockAdapter;
  github: GitHubAdapter;
  summary: UnavailableAdapter;
  openai: OpenAIAdapterBoundary;
  discord: Exclude<DiscordAdapterBoundary, UnavailableAdapter>;
};

export {
  createGitHubActionsDeliveryAdapters,
  createGitHubActionsPreviewAdapters,
} from "./github-actions.js";
export { createOpenAIResponsesAdapter } from "./openai.js";
export { createDiscordWebhookAdapter } from "./discord.js";

type DigestLifecycle = "released" | "completed" | "blocked" | "in-progress";

type DigestSubject = {
  kind: "pull-request" | "wayfinder-map";
  number: number;
  title: string;
  lifecycle: DigestLifecycle;
};

type PresentedSubject = DigestSubject & {
  audienceGroup: "standard" | "internal_maintenance";
  sentence?: string;
};

type DigestSection =
  { kind: "lifecycle"; lifecycle: DigestLifecycle } | { kind: "maintenance" };

const discordLimits = {
  content: 2_000,
  embeds: 1,
  embedTitle: 256,
  embedDescription: 4_096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1_024,
  footer: 2_048,
  aggregateEmbedText: 6_000,
} as const;
const digestRepository = {
  nameWithOwner: "rajat2006/unshelf",
  webUrl: "https://github.com/rajat2006/unshelf",
} as const;
const lifecyclePresentation: Record<
  DigestLifecycle,
  {
    precedence: number;
    sectionName: string;
    state: string;
    overflowUrl: string;
  }
> = {
  released: {
    precedence: 4,
    sectionName: "Released — Live in production",
    state: "released",
    overflowUrl: `${digestRepository.webUrl}/deployments/production`,
  },
  completed: {
    precedence: 3,
    sectionName: "Completed — Merged and ready for a release",
    state: "completed",
    overflowUrl: `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Amerged+base%3Adev`,
  },
  blocked: {
    precedence: 2,
    sectionName: "Blocked — Needs attention before work can continue",
    state: "blocked",
    overflowUrl: `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Aopen+label%3Aagent%3Ablocked%2Cagent%3Aqueued%2Cneeds-info`,
  },
  "in-progress": {
    precedence: 1,
    sectionName: "In progress — Actively moving forward",
    state: "in progress",
    overflowUrl: `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Aopen+-label%3Aagent%3Ablocked+-label%3Aagent%3Aqueued+-label%3Aneeds-info`,
  },
};

const blockingLabels = new Set(["agent:queued", "agent:blocked", "needs-info"]);
const releaseLabels = new Set([
  "release:patch",
  "release:minor",
  "release:major",
]);
const aiSchemaVersion = "1" as const;
const maintenanceOverflowUrl = `${digestRepository.webUrl}/issues?q=sort%3Aupdated-desc`;

type AIPresentationOutcome =
  | { aiPresentation: "applied" }
  | {
      aiPresentation: "failed";
      aiFailureReason: AIPresentationFailureReason;
      aiFailureSubjectId?: string;
    }
  | { aiPresentation: "skipped" };

type DigestRunResult<Mode extends "preview" | "deliver"> = {
  mode: Mode;
  windowEnd: string;
  payload: DiscordPayload;
} & AIPresentationOutcome;

export function runDailyProjectDigest(
  input: { mode: "preview" },
  adapters: PreviewAdapters,
): Promise<DigestRunResult<"preview">>;
export function runDailyProjectDigest(
  input: { mode: "deliver" },
  adapters: DeliveryAdapters,
): Promise<DigestRunResult<"deliver">>;
export async function runDailyProjectDigest(
  input: { mode: "preview" } | { mode: "deliver" },
  adapters: PreviewAdapters | DeliveryAdapters,
): Promise<DigestRunResult<"preview" | "deliver">> {
  const windowEnd = adapters.clock.now();
  if (Number.isNaN(windowEnd.getTime())) {
    throw new DigestFailure({
      category: "orchestration",
      message: "Daily Project Digest received an invalid window end.",
    });
  }
  const window = {
    windowStart: new Date(windowEnd.getTime() - 24 * 60 * 60 * 1_000),
    windowEnd,
  };

  const [pullRequests, deployments, wayfinderMaps] = await Promise.all([
    adapters.github.listPullRequests(copyWindow(window)),
    adapters.github.listDeployments(copyWindow(window)),
    adapters.github.listWayfinderMaps(copyWindow(window)),
  ]);
  const wayfinderMapNumbers = new Set(
    wayfinderMaps.map((wayfinderMap) => wayfinderMap.number),
  );
  const subjects = deduplicateSubjects(
    [
      ...pullRequests.map((pullRequest) =>
        toDigestSubject({ pullRequest, window, wayfinderMapNumbers }),
      ),
      ...deployments.flatMap((deployment) =>
        toReleasedSubjects({ deployment, window, wayfinderMapNumbers }),
      ),
      ...wayfinderMaps.map((wayfinderMap) =>
        toWayfinderSubject({ wayfinderMap, window }),
      ),
    ].filter((subject) => subject !== undefined),
  ).sort((...subjects) => compareSubjects(subjects));
  const { subjects: presentedSubjects, ...aiPresentationOutcome } =
    await presentSubjects({
      subjects,
      openai: adapters.openai,
    });
  const payload = renderPayload({
    subjects: presentedSubjects,
    windowEnd,
  });
  preflightDiscordPayload(payload);

  if (input.mode === "preview") {
    if (!("writePreview" in adapters.summary)) {
      throw new DigestFailure({
        category: "actions-summary",
        message: "Daily Project Digest preview capability is unavailable.",
      });
    }
    await adapters.summary.writePreview(payload);
  } else {
    if (!("deliver" in adapters.discord)) {
      throw new DigestFailure({
        category: "discord-delivery",
        message: "Daily Project Digest delivery capability is unavailable.",
      });
    }
    await adapters.discord.deliver(payload);
  }
  return {
    mode: input.mode,
    windowEnd: windowEnd.toISOString(),
    payload,
    ...aiPresentationOutcome,
  };
}

async function presentSubjects({
  subjects,
  openai,
}: {
  subjects: DigestSubject[];
  openai: OpenAIAdapterBoundary;
}): Promise<{ subjects: PresentedSubject[] } & AIPresentationOutcome> {
  const fallback = subjects.map((subject) => ({
    ...subject,
    audienceGroup: "standard" as const,
  }));
  if (subjects.length === 0 || !("generatePresentation" in openai)) {
    return { subjects: fallback, aiPresentation: "skipped" };
  }
  const input = toOpenAIInput(subjects);
  let response: unknown;
  try {
    response = await openai.generatePresentation(input);
  } catch (error) {
    return {
      subjects: fallback,
      ...toFailedAIPresentationOutcome({
        error,
        unexpectedReason: "request-unexpected",
        allowSubjectId: false,
      }),
    };
  }
  try {
    return {
      subjects: applyOpenAIPresentation({ subjects, input, response }),
      aiPresentation: "applied",
    };
  } catch (error) {
    return {
      subjects: fallback,
      ...toFailedAIPresentationOutcome({
        error,
        unexpectedReason: "contract-unexpected",
        allowSubjectId: true,
      }),
    };
  }
}

function toFailedAIPresentationOutcome({
  error,
  unexpectedReason,
  allowSubjectId,
}: {
  error: unknown;
  unexpectedReason: "request-unexpected" | "contract-unexpected";
  allowSubjectId: boolean;
}): Extract<AIPresentationOutcome, { aiPresentation: "failed" }> {
  return {
    aiPresentation: "failed",
    aiFailureReason:
      error instanceof AIPresentationFailure ? error.reason : unexpectedReason,
    ...(allowSubjectId &&
    error instanceof AIPresentationFailure &&
    error.subjectId !== undefined
      ? { aiFailureSubjectId: error.subjectId }
      : {}),
  };
}

function toOpenAIInput(subjects: DigestSubject[]): OpenAIPresentationInput {
  return {
    schemaVersion: aiSchemaVersion,
    subjects: subjects.map((subject) => ({
      subjectId: subjectId(subject),
      kind: subject.kind,
      facts: [
        {
          id: "title",
          value: subject.title,
          source: "github_untrusted",
        },
      ],
    })),
  };
}

function subjectId(subject: DigestSubject): string {
  return `${subject.kind}:${subject.number}`;
}

function applyOpenAIPresentation({
  subjects,
  input,
  response,
}: {
  subjects: DigestSubject[];
  input: OpenAIPresentationInput;
  response: unknown;
}): PresentedSubject[] {
  const output = exactRecord(response, ["schemaVersion", "items"]);
  if (output === undefined) {
    throw new AIPresentationFailure({ reason: "contract-envelope" });
  }
  if (output.schemaVersion !== aiSchemaVersion) {
    throw new AIPresentationFailure({ reason: "contract-schema-version" });
  }
  if (!Array.isArray(output.items)) {
    throw new AIPresentationFailure({ reason: "contract-items" });
  }
  const factsBySubject = new Map(
    input.subjects.map((subject) => [
      subject.subjectId,
      new Set(subject.facts.map((fact) => fact.id)),
    ]),
  );
  const presentationBySubject = new Map<
    string,
    { sentence: string; audienceGroup: "standard" | "internal_maintenance" }
  >();
  for (const value of output.items) {
    const knownItemSubjectId = knownSubjectId(value, factsBySubject);
    const item = exactRecord(value, [
      "subjectId",
      "sentence",
      "audienceGroup",
      "citations",
    ]);
    if (item === undefined) {
      throw new AIPresentationFailure({
        reason: "contract-item-shape",
        subjectId: knownItemSubjectId,
      });
    }
    if (
      typeof item.subjectId !== "string" ||
      typeof item.sentence !== "string" ||
      (item.audienceGroup !== "standard" &&
        item.audienceGroup !== "internal_maintenance") ||
      !Array.isArray(item.citations)
    ) {
      throw new AIPresentationFailure({
        reason: "contract-item-shape",
        subjectId: knownItemSubjectId,
      });
    }
    const knownFacts = factsBySubject.get(item.subjectId);
    if (knownFacts === undefined) {
      throw new AIPresentationFailure({ reason: "contract-unknown-subject" });
    }
    if (presentationBySubject.has(item.subjectId)) {
      throw new AIPresentationFailure({
        reason: "contract-duplicate-subject",
        subjectId: item.subjectId,
      });
    }
    const sentence = item.sentence.trim();
    const sentenceFailure = aiSentenceFailure(sentence);
    if (sentenceFailure !== undefined) {
      throw new AIPresentationFailure({
        reason: sentenceFailure,
        subjectId: item.subjectId,
      });
    }
    const citations = new Set<string>();
    if (
      item.citations.length === 0 ||
      item.citations.some((citation) => {
        if (
          typeof citation !== "string" ||
          !knownFacts.has(citation) ||
          citations.has(citation)
        ) {
          return true;
        }
        citations.add(citation);
        return false;
      }) ||
      citations.size !== item.citations.length
    ) {
      throw new AIPresentationFailure({
        reason: "contract-citation",
        subjectId: item.subjectId,
      });
    }
    presentationBySubject.set(item.subjectId, {
      sentence,
      audienceGroup: item.audienceGroup,
    });
  }
  if (presentationBySubject.size !== subjects.length) {
    const missingSubjectIds = [...factsBySubject.keys()].filter(
      (knownSubjectId) => !presentationBySubject.has(knownSubjectId),
    );
    throw new AIPresentationFailure({
      reason: "contract-subject-set",
      subjectId:
        missingSubjectIds.length === 1 ? missingSubjectIds[0] : undefined,
    });
  }
  return subjects.map((subject) => {
    const presentation = presentationBySubject.get(subjectId(subject));
    if (presentation === undefined) {
      throw new AIPresentationFailure({
        reason: "contract-subject-set",
        subjectId: subjectId(subject),
      });
    }
    return { ...subject, ...presentation };
  });
}

function knownSubjectId(
  value: unknown,
  factsBySubject: Map<string, Set<string>>,
): string | undefined {
  const candidate = asRecord(value)?.subjectId;
  return typeof candidate === "string" && factsBySubject.has(candidate)
    ? candidate
    : undefined;
}

function exactRecord(
  value: unknown,
  fields: string[],
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === fields.length &&
    fields.every((field) => field in record)
    ? record
    : undefined;
}

function aiSentenceFailure(
  sentence: string,
): AIPresentationFailureReason | undefined {
  if (sentence.length === 0 || sentence.length > 180)
    return "contract-sentence-length";
  if (hasControlCharacter(sentence)) return "contract-sentence-control";
  if (
    /(?:\b[a-z][a-z\d+.-]*:\/\/|www\.|github\.com)/i.test(sentence) ||
    /\b[\w-]+\.(?:com|org|net|io|dev|app|co)(?:\b|\/)/i.test(sentence)
  )
    return "contract-sentence-url";
  if (/(?:\[|\]|[*_`~#><|])/.test(sentence))
    return "contract-sentence-markdown";
  if (/@/.test(sentence)) return "contract-sentence-mention";
  return undefined;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function copyWindow(window: DigestWindow): DigestWindow {
  return {
    windowStart: new Date(window.windowStart),
    windowEnd: new Date(window.windowEnd),
  };
}

function compareSubjects([left, right]: [
  DigestSubject,
  DigestSubject,
]): number {
  return left.number - right.number;
}

function isDirectHotfixPullRequest(pullRequest: PullRequestEvidence): boolean {
  return (
    pullRequest.baseRefName === "main" &&
    pullRequest.headRefName !== "dev" &&
    pullRequest.headRefName !== "main" &&
    pullRequest.headRepository === digestRepository.nameWithOwner &&
    !pullRequest.labels.some((label) => releaseLabels.has(label))
  );
}

function isEligibleDeliveryPullRequest(
  pullRequest: PullRequestEvidence,
): boolean {
  if (pullRequest.state === "OPEN" && pullRequest.baseRefName === "dev") {
    return true;
  }
  return (
    pullRequest.state === "OPEN" &&
    isDirectHotfixPullRequest(pullRequest) &&
    pullRequest.headContainsMain
  );
}

function toDigestSubject({
  pullRequest,
  window,
  wayfinderMapNumbers,
}: {
  pullRequest: PullRequestEvidence;
  window: DigestWindow;
  wayfinderMapNumbers: Set<number>;
}): DigestSubject | undefined {
  if (isWayfinderArtifactPullRequest({ pullRequest, wayfinderMapNumbers })) {
    return undefined;
  }
  if (pullRequest.state === "MERGED") {
    if (pullRequest.mergedAt === null) {
      throw new Error("GitHub returned invalid merged pull-request evidence.");
    }
    const mergedAt = new Date(pullRequest.mergedAt);
    if (Number.isNaN(mergedAt.getTime())) {
      throw new Error("GitHub returned invalid merged pull-request evidence.");
    }
    return pullRequest.baseRefName === "dev" &&
      mergedAt >= window.windowStart &&
      mergedAt < window.windowEnd
      ? {
          kind: "pull-request",
          number: pullRequest.number,
          title: normalizeTitle({
            title: pullRequest.title,
            number: pullRequest.number,
          }),
          lifecycle: "completed",
        }
      : undefined;
  }
  if (!isEligibleDeliveryPullRequest(pullRequest)) {
    return undefined;
  }
  const isBlocked =
    hasBlockingLabel(pullRequest.labels) ||
    hasOpenDependency(pullRequest.blockedBy) ||
    pullRequest.closingIssues.some(
      (issue) =>
        hasBlockingLabel(issue.labels) || hasOpenDependency(issue.blockedBy),
    );
  return {
    kind: "pull-request",
    number: pullRequest.number,
    title: normalizeTitle({
      title: pullRequest.title,
      number: pullRequest.number,
    }),
    lifecycle: isBlocked ? "blocked" : "in-progress",
  };
}

function toReleasedSubjects({
  deployment,
  window,
  wayfinderMapNumbers,
}: {
  deployment: DeploymentEvidence;
  window: DigestWindow;
  wayfinderMapNumbers: Set<number>;
}): DigestSubject[] {
  if (
    deployment.environment !== "production" ||
    deployment.status !== "success" ||
    !deployment.reachableFromMain
  ) {
    return [];
  }
  const statusAt = new Date(deployment.statusAt);
  if (Number.isNaN(statusAt.getTime())) {
    throw new Error("GitHub returned invalid production deployment evidence.");
  }
  if (statusAt < window.windowStart || statusAt >= window.windowEnd) {
    return [];
  }
  return deployment.newlyContainedPullRequests
    .filter(
      (pullRequest) =>
        !isWayfinderArtifactPullRequest({
          pullRequest,
          wayfinderMapNumbers,
        }) && isReleasedDeliveryPullRequest(pullRequest),
    )
    .map((pullRequest) => ({
      kind: "pull-request",
      number: pullRequest.number,
      title: normalizeTitle({
        title: pullRequest.title,
        number: pullRequest.number,
      }),
      lifecycle: "released",
    }));
}

function toWayfinderSubject({
  wayfinderMap,
  window,
}: {
  wayfinderMap: WayfinderMapEvidence;
  window: DigestWindow;
}): DigestSubject | undefined {
  if (!wayfinderMap.labels.includes("wayfinder:map")) {
    return undefined;
  }
  if (wayfinderMap.state === "CLOSED") {
    if (
      wayfinderMap.stateReason !== "COMPLETED" ||
      wayfinderMap.closedAt === null
    ) {
      return undefined;
    }
    const closedAt = new Date(wayfinderMap.closedAt);
    if (Number.isNaN(closedAt.getTime())) {
      throw new Error("GitHub returned invalid Wayfinder map evidence.");
    }
    if (closedAt < window.windowStart || closedAt >= window.windowEnd) {
      return undefined;
    }
    return wayfinderSubject({ wayfinderMap, lifecycle: "completed" });
  }
  const remainingRoutes = wayfinderMap.children.filter(
    (route) => route.state === "OPEN",
  );
  const everyRemainingRouteIsBlocked =
    remainingRoutes.length > 0 &&
    remainingRoutes.every(
      (route) =>
        hasBlockingLabel(route.labels) || hasOpenDependency(route.blockedBy),
    );
  return wayfinderSubject({
    wayfinderMap,
    lifecycle: everyRemainingRouteIsBlocked ? "blocked" : "in-progress",
  });
}

function wayfinderSubject({
  wayfinderMap,
  lifecycle,
}: {
  wayfinderMap: WayfinderMapEvidence;
  lifecycle: "completed" | "blocked" | "in-progress";
}): DigestSubject {
  return {
    kind: "wayfinder-map",
    number: wayfinderMap.number,
    title: normalizeTitle({
      title: wayfinderMap.title,
      number: wayfinderMap.number,
    }),
    lifecycle,
  };
}

function isWayfinderArtifactPullRequest({
  pullRequest,
  wayfinderMapNumbers,
}: {
  pullRequest: PullRequestEvidence;
  wayfinderMapNumbers: Set<number>;
}): boolean {
  if (pullRequest.labels.includes("wayfinder:artifact")) {
    return true;
  }
  const match =
    /^wayfinder\/map-(\d+)-(?:decision-documents|research-and-prototypes)$/.exec(
      pullRequest.headRefName,
    );
  return (
    pullRequest.headRepository === digestRepository.nameWithOwner &&
    match !== null &&
    wayfinderMapNumbers.has(Number(match[1]))
  );
}

function isReleasedDeliveryPullRequest(
  pullRequest: PullRequestEvidence,
): boolean {
  if (pullRequest.state !== "MERGED") {
    return false;
  }
  if (pullRequest.baseRefName === "dev") {
    return true;
  }
  return isDirectHotfixPullRequest(pullRequest);
}

function deduplicateSubjects(subjects: DigestSubject[]): DigestSubject[] {
  const subjectsByNumber = new Map<number, DigestSubject>();
  for (const subject of subjects) {
    const existing = subjectsByNumber.get(subject.number);
    if (
      existing === undefined ||
      lifecyclePresentation[subject.lifecycle].precedence >
        lifecyclePresentation[existing.lifecycle].precedence
    ) {
      subjectsByNumber.set(subject.number, subject);
    }
  }
  return [...subjectsByNumber.values()];
}

function hasBlockingLabel(labels: string[]): boolean {
  return labels.some((label) => blockingLabels.has(label));
}

function hasOpenDependency(dependencies: DependencyEvidence[]): boolean {
  return dependencies.some((dependency) => dependency.state === "OPEN");
}

function renderPayload({
  subjects,
  windowEnd,
}: {
  subjects: PresentedSubject[];
  windowEnd: Date;
}): DiscordPayload {
  const deliveryIdentifier = `Digest ${windowEnd
    .toISOString()
    .replace(/[-:.]/g, "")}`;
  const lifecycleCounts = {
    released: subjects.filter((subject) => subject.lifecycle === "released")
      .length,
    completed: subjects.filter((subject) => subject.lifecycle === "completed")
      .length,
    blocked: subjects.filter((subject) => subject.lifecycle === "blocked")
      .length,
    inProgress: subjects.filter(
      (subject) => subject.lifecycle === "in-progress",
    ).length,
  };
  const released = subjects.filter(
    (subject) =>
      subject.lifecycle === "released" && subject.audienceGroup === "standard",
  );
  const completed = subjects.filter(
    (subject) =>
      subject.lifecycle === "completed" && subject.audienceGroup === "standard",
  );
  const blocked = subjects.filter(
    (subject) =>
      subject.lifecycle === "blocked" && subject.audienceGroup === "standard",
  );
  const inProgress = subjects.filter(
    (subject) =>
      subject.lifecycle === "in-progress" &&
      subject.audienceGroup === "standard",
  );
  const maintenance = subjects.filter(
    (subject) => subject.audienceGroup === "internal_maintenance",
  );
  if (subjects.length === 0) {
    return {
      allowed_mentions: { parse: [] },
      content: `🌙 **Quiet day for Unshelf**\nNo project updates to report in this snapshot.\n${deliveryIdentifier}`,
    };
  }

  const fields = [
    renderSection({
      name: lifecyclePresentation.released.sectionName,
      section: { kind: "lifecycle", lifecycle: "released" },
      subjects: released,
    }),
    renderSection({
      name: lifecyclePresentation.completed.sectionName,
      section: { kind: "lifecycle", lifecycle: "completed" },
      subjects: completed,
    }),
    renderSection({
      name: lifecyclePresentation.blocked.sectionName,
      section: { kind: "lifecycle", lifecycle: "blocked" },
      subjects: blocked,
    }),
    renderSection({
      name: lifecyclePresentation["in-progress"].sectionName,
      section: { kind: "lifecycle", lifecycle: "in-progress" },
      subjects: inProgress,
    }),
    renderSection({
      name: "Internal maintenance — Keeps the project healthy",
      subjects: maintenance,
      section: { kind: "maintenance" },
    }),
  ].filter((field) => field !== undefined);

  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "Daily Project Digest",
        description: headline(lifecycleCounts),
        color: 0x5865f2,
        fields,
        footer: {
          text: `Updates are based on authoritative GitHub activity. · ${deliveryIdentifier}`,
        },
        timestamp: windowEnd.toISOString(),
      },
    ],
  };
}

function renderSection({
  name,
  subjects,
  section,
}: {
  name: string;
  subjects: PresentedSubject[];
  section: DigestSection;
}): { name: string; value: string } | undefined {
  if (subjects.length === 0) {
    return undefined;
  }
  let visibleCount = Math.min(10, subjects.length);
  let value = renderSectionValue({
    subjects,
    visibleCount,
    section,
  });
  while (value.length > discordLimits.fieldValue && visibleCount > 0) {
    visibleCount -= 1;
    value = renderSectionValue({
      subjects,
      visibleCount,
      section,
    });
  }
  if (value.length > discordLimits.fieldValue) {
    throw new DigestFailure({
      category: "discord-preflight",
      message: "Daily Project Digest cannot fit a Discord section.",
    });
  }
  return {
    name,
    value,
  };
}

function renderSectionValue({
  subjects,
  visibleCount,
  section,
}: {
  subjects: PresentedSubject[];
  visibleCount: number;
  section: DigestSection;
}): string {
  const lines = subjects
    .slice(0, visibleCount)
    .map((subject) => renderSubject({ subject, section }));
  const remainder = subjects.length - visibleCount;
  if (remainder > 0) {
    lines.push(
      `[+ ${remainder} more on GitHub](${
        section.kind === "maintenance"
          ? maintenanceOverflowUrl
          : lifecyclePresentation[section.lifecycle].overflowUrl
      })`,
    );
  }
  return lines.join("\n");
}

function renderSubject({
  subject,
  section,
}: {
  subject: PresentedSubject;
  section: DigestSection;
}): string {
  const state = lifecyclePresentation[subject.lifecycle].state;
  const collection = subject.kind === "wayfinder-map" ? "issues" : "pull";
  const displayState = `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
  const sentence = subject.sentence ?? `${displayState}: ${subject.title}.`;
  const metadata = section.kind === "maintenance" ? ` — ${displayState}` : "";
  return `[${sentence}](${digestRepository.webUrl}/${collection}/${subject.number})${metadata}`;
}

function normalizeTitle({
  title,
  number,
}: {
  title: string;
  number: number;
}): string {
  const plainText = title
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[.!?]+/g, ";")
    .replace(/[\\*_[\]()`~><|#]/g, "")
    .replace(/@/g, "@\u200b")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = plainText === "" ? `Pull request ${number}` : plainText;
  return fallback.length <= 180
    ? fallback
    : `${fallback.slice(0, 179).trimEnd()}…`;
}

function headline({
  released,
  completed,
  blocked,
  inProgress,
}: {
  released: number;
  completed: number;
  blocked: number;
  inProgress: number;
}): string {
  if (released > 0) {
    const outcomes = [
      `${released} change${released === 1 ? "" : "s"} reached production`,
      completed > 0
        ? `${completed} meaningful change${completed === 1 ? "" : "s"} landed`
        : undefined,
      blocked > 0
        ? `${blocked} item${blocked === 1 ? " needs" : "s need"} attention`
        : undefined,
      inProgress > 0
        ? `${inProgress} ${inProgress === 1 ? "effort is" : "efforts are"} still moving`
        : undefined,
    ].filter((outcome) => outcome !== undefined);
    return `${outcomes.join("; ")}.`;
  }
  if (blocked > 0) {
    return `${blocked} item${blocked === 1 ? " needs" : "s need"} attention; ${inProgress} ${inProgress === 1 ? "effort is" : "efforts are"} still moving.`;
  }
  if (completed > 0) {
    return `${completed} meaningful change${completed === 1 ? "" : "s"} landed; ${inProgress} ${inProgress === 1 ? "effort is" : "efforts are"} underway.`;
  }
  return `${inProgress} ${inProgress === 1 ? "effort is" : "efforts are"} moving forward.`;
}

function preflightDiscordPayload(payload: DiscordPayload): void {
  if (
    payload.allowed_mentions.parse.length !== 0 ||
    (payload.content?.length ?? 0) > discordLimits.content ||
    (payload.embeds?.length ?? 0) > discordLimits.embeds
  ) {
    throw new DigestFailure({
      category: "discord-preflight",
      message: "Daily Project Digest failed Discord preflight.",
    });
  }
  for (const embed of payload.embeds ?? []) {
    const aggregateText =
      embed.title.length +
      embed.description.length +
      embed.footer.text.length +
      embed.fields.reduce(
        (length, field) => length + field.name.length + field.value.length,
        0,
      );
    if (
      embed.title.length > discordLimits.embedTitle ||
      embed.description.length > discordLimits.embedDescription ||
      embed.fields.length > discordLimits.fields ||
      embed.footer.text.length > discordLimits.footer ||
      aggregateText > discordLimits.aggregateEmbedText ||
      embed.fields.some(
        (field) =>
          field.name.length > discordLimits.fieldName ||
          field.value.length > discordLimits.fieldValue,
      )
    ) {
      throw new DigestFailure({
        category: "discord-preflight",
        message: "Daily Project Digest failed Discord preflight.",
      });
    }
  }
}
