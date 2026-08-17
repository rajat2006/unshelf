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
  listOpenPullRequests(input: {
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

type ActiveSubject = {
  number: number;
  title: string;
  lifecycle: "blocked" | "in-progress";
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

  const pullRequests = await adapters.github.listOpenPullRequests({
    windowEnd: new Date(windowEnd),
  });
  const subjects = pullRequests
    .filter(isEligibleDeliveryPullRequest)
    .map(toActiveSubject)
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
  if (pullRequest.baseRefName === "dev") {
    return true;
  }
  return (
    pullRequest.baseRefName === "main" &&
    pullRequest.headRefName !== "dev" &&
    pullRequest.headRefName !== "main" &&
    pullRequest.headRepository === digestRepository.nameWithOwner &&
    pullRequest.headContainsMain &&
    !pullRequest.labels.some((label) => releaseLabels.has(label))
  );
}

function toActiveSubject(pullRequest: PullRequestEvidence): ActiveSubject {
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
  subjects: ActiveSubject[];
  windowEnd: Date;
}): DiscordPayload {
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
  lifecycle: ActiveSubject["lifecycle"];
  subjects: ActiveSubject[];
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
  subjects: ActiveSubject[];
  lifecycle: ActiveSubject["lifecycle"];
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

function overflowUrl(lifecycle: ActiveSubject["lifecycle"]): string {
  return lifecycle === "blocked"
    ? `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Aopen+label%3Aagent%3Ablocked%2Cagent%3Aqueued%2Cneeds-info`
    : `${digestRepository.webUrl}/pulls?q=is%3Apr+is%3Aopen+-label%3Aagent%3Ablocked+-label%3Aagent%3Aqueued+-label%3Aneeds-info`;
}

function renderSubject({
  subject,
  lifecycle,
}: {
  subject: ActiveSubject;
  lifecycle: ActiveSubject["lifecycle"];
}): string {
  const state = lifecycle === "blocked" ? "blocked" : "in progress";
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
  blocked,
  inProgress,
}: {
  blocked: number;
  inProgress: number;
}): string {
  if (blocked > 0) {
    return `${blocked} item${blocked === 1 ? " needs" : "s need"} attention; ${inProgress} ${inProgress === 1 ? "effort is" : "efforts are"} still moving.`;
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
