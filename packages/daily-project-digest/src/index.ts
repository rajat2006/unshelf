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

export type ClockAdapter = {
  now(): Date;
};

export type GitHubAdapter = {
  listPullRequests(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<PullRequestEvidence[]>;
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

type DigestSubject = {
  number: number;
  title: string;
  lifecycle: "completed" | "blocked" | "in-progress";
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
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1_000);

  const pullRequests = await adapters.github.listPullRequests({
    windowStart: new Date(windowStart),
    windowEnd: new Date(windowEnd),
  });
  const subjects = pullRequests
    .map((pullRequest) =>
      toDigestSubject({ pullRequest, windowStart, windowEnd }),
    )
    .filter((subject) => subject !== undefined)
    .sort((left, right) => left.number - right.number);
  const payload = renderPayload({ subjects, windowEnd });
  preflightDiscordPayload(payload);

  await adapters.summary.writePreview(payload);
  return {
    mode: input.mode,
    windowEnd: windowEnd.toISOString(),
    payload,
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
  windowStart,
  windowEnd,
}: {
  pullRequest: PullRequestEvidence;
  windowStart: Date;
  windowEnd: Date;
}): DigestSubject | undefined {
  if (pullRequest.state === "MERGED") {
    if (pullRequest.mergedAt === null) {
      throw new Error("GitHub returned invalid merged pull-request evidence.");
    }
    const mergedAt = new Date(pullRequest.mergedAt);
    if (Number.isNaN(mergedAt.getTime())) {
      throw new Error("GitHub returned invalid merged pull-request evidence.");
    }
    return pullRequest.baseRefName === "dev" &&
      mergedAt >= windowStart &&
      mergedAt < windowEnd
      ? {
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
    number: pullRequest.number,
    title: normalizeTitle({
      title: pullRequest.title,
      number: pullRequest.number,
    }),
    lifecycle: isBlocked ? "blocked" : "in-progress",
  };
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
      name: "Completed — Merged and ready for a release",
      lifecycle: "completed",
      subjects: completed,
    }),
    renderSection({
      name: "Blocked — Needs attention before work can continue",
      lifecycle: "blocked",
      subjects: blocked,
    }),
    renderSection({
      name: "In progress — Actively moving forward",
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
    lines.push(`[+ ${remainder} more on GitHub](${overflowUrl(lifecycle)})`);
  }
  return lines.join("\n");
}

function overflowUrl(lifecycle: DigestSubject["lifecycle"]): string {
  if (lifecycle === "completed") {
    return `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Amerged+base%3Adev`;
  }
  return lifecycle === "blocked"
    ? `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Aopen+label%3Aagent%3Ablocked%2Cagent%3Aqueued%2Cneeds-info`
    : `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Aopen+-label%3Aagent%3Ablocked+-label%3Aagent%3Aqueued+-label%3Aneeds-info`;
}

function renderSubject({
  subject,
  lifecycle,
}: {
  subject: DigestSubject;
  lifecycle: DigestSubject["lifecycle"];
}): string {
  const state =
    lifecycle === "completed"
      ? "completed"
      : lifecycle === "blocked"
        ? "blocked"
        : "in progress";
  return `[${subject.title} is ${state}.](${digestRepository.webUrl}/pull/${subject.number})`;
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
  completed,
  blocked,
  inProgress,
}: {
  completed: number;
  blocked: number;
  inProgress: number;
}): string {
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
