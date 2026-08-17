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
  stateReason: "COMPLETED" | "NOT_PLANNED" | null;
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

export type OpenAIAdapterBoundary = { availability: "unavailable" };

export type DiscordAdapterBoundary = { availability: "unavailable" };

export type PreviewAdapters = {
  clock: ClockAdapter;
  github: GitHubAdapter;
  summary: SummaryAdapter;
  openai: OpenAIAdapterBoundary;
  discord: DiscordAdapterBoundary;
};

export { createGitHubActionsPreviewAdapters } from "./github-actions.js";

type DigestLifecycle = "released" | "completed" | "blocked" | "in-progress";

type DigestSubject = {
  kind: "pull-request" | "wayfinder-map";
  number: number;
  title: string;
  lifecycle: DigestLifecycle;
};

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

export async function runDailyProjectDigest(
  input: { mode: "preview" },
  adapters: PreviewAdapters,
): Promise<{
  mode: "preview";
  windowEnd: string;
  payload: DiscordPayload;
}> {
  const windowEnd = adapters.clock.now();
  if (Number.isNaN(windowEnd.getTime())) {
    throw new Error("Daily Project Digest received an invalid window end.");
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
  ).sort((left, right) => left.number - right.number);
  const payload = renderPayload({ subjects, windowEnd });
  preflightDiscordPayload(payload);

  await adapters.summary.writePreview(payload);
  return {
    mode: input.mode,
    windowEnd: windowEnd.toISOString(),
    payload,
  };
}

function copyWindow(window: DigestWindow): DigestWindow {
  return {
    windowStart: new Date(window.windowStart),
    windowEnd: new Date(window.windowEnd),
  };
}

function isEligibleDeliveryPullRequest(
  pullRequest: PullRequestEvidence,
): boolean {
  if (pullRequest.state === "OPEN" && pullRequest.baseRefName === "dev") {
    return true;
  }
  return (
    pullRequest.state === "OPEN" &&
    pullRequest.baseRefName === "main" &&
    pullRequest.headRefName !== "dev" &&
    pullRequest.headRefName !== "main" &&
    pullRequest.headRepository === digestRepository.nameWithOwner &&
    pullRequest.headContainsMain &&
    !pullRequest.labels.some((label) => releaseLabels.has(label))
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
  const match =
    /^wayfinder\/map-(\d+)-(?:decision-documents|research-and-prototypes)$/.exec(
      pullRequest.headRefName,
    );
  return match !== null && wayfinderMapNumbers.has(Number(match[1]));
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
  return (
    pullRequest.baseRefName === "main" &&
    pullRequest.headRefName !== "dev" &&
    pullRequest.headRefName !== "main" &&
    pullRequest.headRepository === digestRepository.nameWithOwner &&
    !pullRequest.labels.some((label) => releaseLabels.has(label))
  );
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
  subjects: DigestSubject[];
  windowEnd: Date;
}): DiscordPayload {
  const released = subjects.filter(
    (subject) => subject.lifecycle === "released",
  );
  const completed = subjects.filter(
    (subject) => subject.lifecycle === "completed",
  );
  const blocked = subjects.filter((subject) => subject.lifecycle === "blocked");
  const inProgress = subjects.filter(
    (subject) => subject.lifecycle === "in-progress",
  );
  if (subjects.length === 0) {
    return {
      allowed_mentions: { parse: [] },
      content:
        "🌙 **Quiet day for Unshelf**\nNo project updates to report in this snapshot.",
    };
  }

  const fields = [
    renderSection({
      name: lifecyclePresentation.released.sectionName,
      lifecycle: "released",
      subjects: released,
    }),
    renderSection({
      name: lifecyclePresentation.completed.sectionName,
      lifecycle: "completed",
      subjects: completed,
    }),
    renderSection({
      name: lifecyclePresentation.blocked.sectionName,
      lifecycle: "blocked",
      subjects: blocked,
    }),
    renderSection({
      name: lifecyclePresentation["in-progress"].sectionName,
      lifecycle: "in-progress",
      subjects: inProgress,
    }),
  ].filter((field) => field !== undefined);

  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "Daily Project Digest",
        description: headline({
          released: released.length,
          completed: completed.length,
          blocked: blocked.length,
          inProgress: inProgress.length,
        }),
        color: 0x5865f2,
        fields,
        footer: {
          text: "Updates are based on authoritative GitHub activity.",
        },
        timestamp: windowEnd.toISOString(),
      },
    ],
  };
}

function renderSection({
  name,
  lifecycle,
  subjects,
}: {
  name: string;
  lifecycle: DigestSubject["lifecycle"];
  subjects: DigestSubject[];
}): { name: string; value: string } | undefined {
  if (subjects.length === 0) {
    return undefined;
  }
  let visibleCount = Math.min(10, subjects.length);
  let value = renderSectionValue({ subjects, lifecycle, visibleCount });
  while (value.length > discordLimits.fieldValue && visibleCount > 0) {
    visibleCount -= 1;
    value = renderSectionValue({ subjects, lifecycle, visibleCount });
  }
  if (value.length > discordLimits.fieldValue) {
    throw new Error("Daily Project Digest cannot fit a Discord section.");
  }
  return {
    name,
    value,
  };
}

function renderSectionValue({
  subjects,
  lifecycle,
  visibleCount,
}: {
  subjects: DigestSubject[];
  lifecycle: DigestSubject["lifecycle"];
  visibleCount: number;
}): string {
  const lines = subjects
    .slice(0, visibleCount)
    .map((subject) => renderSubject({ subject, lifecycle }));
  const remainder = subjects.length - visibleCount;
  if (remainder > 0) {
    lines.push(
      `[+ ${remainder} more on GitHub](${lifecyclePresentation[lifecycle].overflowUrl})`,
    );
  }
  return lines.join("\n");
}

function renderSubject({
  subject,
  lifecycle,
}: {
  subject: DigestSubject;
  lifecycle: DigestSubject["lifecycle"];
}): string {
  const state = lifecyclePresentation[lifecycle].state;
  const collection =
    subject.kind === "wayfinder-map" ? "issues" : "pull";
  return `[${subject.title} is ${state}.](${digestRepository.webUrl}/${collection}/${subject.number})`;
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
    throw new Error("Daily Project Digest failed Discord preflight.");
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
      throw new Error("Daily Project Digest failed Discord preflight.");
    }
  }
}
