import { appendFile } from "node:fs/promises";

import type {
  DiscordPayload,
  PreviewAdapters,
  PullRequestEvidence,
} from "./index.js";

type GitHubActionsPreviewInput = {
  token: string;
  repository: string;
  summaryPath: string;
};

type GitHubRequest = {
  token: string;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

type GitHubRepositoryContext = {
  token: string;
  owner: string;
  name: string;
};

const openPullRequestsQuery = `
  query OpenPullRequests($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: "refs/heads/main") { target { oid } }
      pullRequests(states: OPEN, first: 50, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          baseRefName
          headRefName
          headRefOid
          headRepository { nameWithOwner }
          isDraft
          labels(first: 100) {
            pageInfo { hasNextPage }
            nodes { name }
          }
          closingIssuesReferences(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              number
              state
              labels(first: 100) {
                pageInfo { hasNextPage }
                nodes { name }
              }
            }
          }
        }
      }
    }
  }
`;

export function createGitHubActionsPreviewAdapters(
  input: GitHubActionsPreviewInput,
): PreviewAdapters {
  const [owner, name, extra] = input.repository.split("/");
  if (
    owner === undefined ||
    name === undefined ||
    extra !== undefined ||
    input.token === "" ||
    input.summaryPath === ""
  ) {
    throw new Error("Daily Project Digest preview configuration is invalid.");
  }

  return {
    clock: { now: () => new Date() },
    github: {
      listOpenPullRequests: () =>
        gatherOpenPullRequests({ github: { token: input.token, owner, name } }),
    },
    summary: {
      writePreview: (payload) =>
        writePreview({
          summaryPath: input.summaryPath,
          payload,
        }),
    },
    openai: { availability: "unavailable" },
    discord: { availability: "unavailable" },
  };
}

async function gatherOpenPullRequests({
  github,
}: {
  github: GitHubRepositoryContext;
}): Promise<PullRequestEvidence[]> {
  const pullRequests: PullRequestEvidence[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await githubJson({
      token: github.token,
      path: "/graphql",
      method: "POST",
      body: {
        query: openPullRequestsQuery,
        variables: {
          owner: github.owner,
          name: github.name,
          after: cursor,
        },
      },
    });
    const page = parsePullRequestPage(response);
    for (const pullRequest of page.pullRequests) {
      const blockedBy = await fetchDependencies({
        github,
        issueNumber: pullRequest.number,
      });
      const closingIssues = await Promise.all(
        pullRequest.closingIssues.map(async (issue) => ({
          state: issue.state,
          labels: issue.labels,
          blockedBy: await fetchDependencies({
            github,
            issueNumber: issue.number,
          }),
        })),
      );
      const containsMain = await checkHeadContainsMain({
        github,
        mainOid: page.mainOid,
        pullRequest,
      });
      pullRequests.push({
        number: pullRequest.number,
        title: pullRequest.title,
        baseRefName: pullRequest.baseRefName,
        headRefName: pullRequest.headRefName,
        headRepository: pullRequest.headRepository,
        labels: pullRequest.labels,
        isDraft: pullRequest.isDraft,
        headContainsMain: containsMain,
        blockedBy,
        closingIssues,
      });
    }
    hasNextPage = page.hasNextPage;
    cursor = page.endCursor;
    if (hasNextPage && cursor === null) {
      throw new Error("GitHub returned incomplete digest evidence.");
    }
  }
  return pullRequests;
}

type ParsedPullRequest = Omit<
  PullRequestEvidence,
  "blockedBy" | "closingIssues" | "headContainsMain"
> & {
  headRefOid: string;
  closingIssues: Array<{
    number: number;
    state: "OPEN" | "CLOSED";
    labels: string[];
  }>;
};

function parsePullRequestPage(value: unknown): {
  mainOid: string;
  pullRequests: ParsedPullRequest[];
  hasNextPage: boolean;
  endCursor: string | null;
} {
  const root = record(value);
  if (root === undefined || root.errors !== undefined) {
    throw new Error("GitHub rejected digest evidence gathering.");
  }
  const repository = nestedRecord(root, ["data", "repository"]);
  const connection = nestedRecord(repository, ["pullRequests"]);
  const pageInfo = nestedRecord(connection, ["pageInfo"]);
  const mainOid = nestedString(repository, ["ref", "target", "oid"]);
  const nodes = connection?.nodes;
  const hasNextPage = pageInfo?.hasNextPage;
  const endCursor = pageInfo?.endCursor;
  if (
    mainOid === undefined ||
    !Array.isArray(nodes) ||
    typeof hasNextPage !== "boolean" ||
    (endCursor !== null && typeof endCursor !== "string")
  ) {
    throw new Error("GitHub returned invalid digest evidence.");
  }
  return {
    mainOid,
    pullRequests: nodes.map(parsePullRequest),
    hasNextPage,
    endCursor,
  };
}

function parsePullRequest(value: unknown): ParsedPullRequest {
  const pullRequest = record(value);
  const number = pullRequest?.number;
  const title = pullRequest?.title;
  const baseRefName = pullRequest?.baseRefName;
  const headRefName = pullRequest?.headRefName;
  const headRefOid = pullRequest?.headRefOid;
  const isDraft = pullRequest?.isDraft;
  const headRepositoryValue = pullRequest?.headRepository;
  const headRepository =
    headRepositoryValue === null
      ? null
      : record(headRepositoryValue)?.nameWithOwner;
  if (
    !isInteger(number) ||
    typeof title !== "string" ||
    typeof baseRefName !== "string" ||
    typeof headRefName !== "string" ||
    typeof headRefOid !== "string" ||
    typeof isDraft !== "boolean" ||
    (headRepository !== null && typeof headRepository !== "string")
  ) {
    throw new Error("GitHub returned invalid pull-request evidence.");
  }
  return {
    number,
    title,
    baseRefName,
    headRefName,
    headRefOid,
    headRepository,
    isDraft,
    labels: parseLabels(pullRequest?.labels),
    closingIssues: parseClosingIssues(pullRequest?.closingIssuesReferences),
  };
}

function parseLabels(value: unknown): string[] {
  const connection = record(value);
  const pageInfo = record(connection?.pageInfo);
  if (pageInfo?.hasNextPage !== false || !Array.isArray(connection?.nodes)) {
    throw new Error("GitHub returned incomplete label evidence.");
  }
  return connection.nodes.map((node) => {
    const name = record(node)?.name;
    if (typeof name !== "string") {
      throw new Error("GitHub returned invalid label evidence.");
    }
    return name;
  });
}

function parseClosingIssues(
  value: unknown,
): ParsedPullRequest["closingIssues"] {
  const connection = record(value);
  const pageInfo = record(connection?.pageInfo);
  if (pageInfo?.hasNextPage !== false || !Array.isArray(connection?.nodes)) {
    throw new Error("GitHub returned incomplete closing-issue evidence.");
  }
  return connection.nodes.map((node) => {
    const issue = record(node);
    const number = issue?.number;
    const state = issue?.state;
    if (
      issue === undefined ||
      !isInteger(number) ||
      (state !== "OPEN" && state !== "CLOSED")
    ) {
      throw new Error("GitHub returned invalid closing-issue evidence.");
    }
    return { number, state, labels: parseLabels(issue.labels) };
  });
}

async function fetchDependencies({
  github,
  issueNumber,
}: {
  github: GitHubRepositoryContext;
  issueNumber: number;
}): Promise<Array<{ state: "OPEN" | "CLOSED" }>> {
  const dependencies: Array<{ state: "OPEN" | "CLOSED" }> = [];
  for (let page = 1; ; page += 1) {
    const response = await githubJson({
      token: github.token,
      path: `/repos/${github.owner}/${github.name}/issues/${issueNumber}/dependencies/blocked_by?per_page=100&page=${page}`,
    });
    if (!Array.isArray(response)) {
      throw new Error("GitHub returned invalid dependency evidence.");
    }
    for (const value of response) {
      const state = record(value)?.state;
      if (state !== "open" && state !== "closed") {
        throw new Error("GitHub returned invalid dependency evidence.");
      }
      dependencies.push({ state: state === "open" ? "OPEN" : "CLOSED" });
    }
    if (response.length < 100) {
      return dependencies;
    }
  }
}

async function checkHeadContainsMain({
  github,
  mainOid,
  pullRequest,
}: {
  github: GitHubRepositoryContext;
  mainOid: string;
  pullRequest: ParsedPullRequest;
}): Promise<boolean> {
  if (
    pullRequest.baseRefName !== "main" ||
    pullRequest.headRepository !== `${github.owner}/${github.name}` ||
    pullRequest.headRefName === "dev" ||
    pullRequest.headRefName === "main"
  ) {
    return false;
  }
  const response = await githubJson({
    token: github.token,
    path: `/repos/${github.owner}/${github.name}/compare/${mainOid}...${pullRequest.headRefOid}`,
  });
  const status = record(response)?.status;
  if (typeof status !== "string") {
    throw new Error("GitHub returned invalid ancestry evidence.");
  }
  return status === "ahead" || status === "identical";
}

async function githubJson(input: GitHubRequest): Promise<unknown> {
  const response = await fetch(`https://api.github.com${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "User-Agent": "unshelf-daily-project-digest",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(input.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  if (!response.ok) {
    throw new Error("GitHub rejected digest evidence gathering.");
  }
  const value: unknown = await response.json();
  return value;
}

async function writePreview({
  summaryPath,
  payload,
}: {
  summaryPath: string;
  payload: DiscordPayload;
}): Promise<void> {
  await appendFile(
    summaryPath,
    `## Daily Project Digest preview\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`,
    "utf8",
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function nestedRecord(
  value: Record<string, unknown> | undefined,
  path: string[],
): Record<string, unknown> | undefined {
  let current = value;
  for (const key of path) {
    current = record(current?.[key]);
  }
  return current;
}

function nestedString(
  value: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    current = record(current)?.[key];
  }
  return typeof current === "string" ? current : undefined;
}
