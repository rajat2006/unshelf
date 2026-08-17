import { appendFile } from "node:fs/promises";

import type {
  DeploymentEvidence,
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

const mergedPullRequestsQuery = `
  query MergedPullRequests($owner: String!, $name: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(states: MERGED, first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          mergedAt
          baseRefName
          headRefName
          headRepository { nameWithOwner }
          isDraft
          mergeCommit { oid }
          labels(first: 100) {
            pageInfo { hasNextPage }
            nodes { name }
          }
        }
      }
    }
  }
`;

const releaseCarrierCommitsQuery = `
  query ReleaseCarrierCommits($owner: String!, $name: String!, $number: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        commits(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { commit { oid } }
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
      listPullRequests: ({ windowStart }) =>
        gatherPullRequests({
          github: { token: input.token, owner, name },
          windowStart,
        }),
      listDeployments: (window) =>
        gatherDeployments({
          github: { token: input.token, owner, name },
          window,
        }),
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

async function gatherPullRequests({
  github,
  windowStart,
}: {
  github: GitHubRepositoryContext;
  windowStart: Date;
}): Promise<PullRequestEvidence[]> {
  const [open, merged] = await Promise.all([
    gatherOpenPullRequests({ github }),
    gatherRecentlyMergedPullRequests({ github, windowStart }),
  ]);
  return [...open, ...merged];
}

type DeploymentRecord = {
  id: number;
  environment: string;
  sha: string;
};

type DeploymentStatus = DeploymentEvidence["status"];

type DeploymentWithStatus = DeploymentRecord & {
  status: DeploymentStatus;
  statusAt: string;
};

type MergedPullRequest = {
  mergeCommitOid: string;
  pullRequest: PullRequestEvidence;
};

async function gatherDeployments({
  github,
  window,
}: {
  github: GitHubRepositoryContext;
  window: { windowStart: Date; windowEnd: Date };
}): Promise<DeploymentEvidence[]> {
  const [mainOid, deploymentRecords] = await Promise.all([
    fetchMainOid({ github }),
    fetchDeploymentRecords({ github }),
  ]);
  const deployments: DeploymentWithStatus[] = [];
  for (const deployment of deploymentRecords) {
    const withStatus = await fetchDeploymentWithLatestStatus({
      github,
      deployment,
    });
    if (withStatus !== undefined) {
      deployments.push(withStatus);
    }
  }
  const reachability = new Map<string, boolean>();
  for (const deployment of deployments) {
    if (
      deployment.environment === "production" &&
      deployment.status === "success" &&
      !reachability.has(deployment.sha)
    ) {
      reachability.set(
        deployment.sha,
        await isReachableFromMain({
          github,
          mainOid,
          deployedOid: deployment.sha,
        }),
      );
    }
  }
  const successfulProductionDeployments = deployments
    .filter(
      (deployment) =>
        deployment.environment === "production" &&
        deployment.status === "success" &&
        reachability.get(deployment.sha) === true,
    )
    .sort((...deployments) => compareDeployments(deployments));
  const releasesInWindow = successfulProductionDeployments.filter(
    (deployment) => {
      const statusAt = new Date(deployment.statusAt);
      return statusAt >= window.windowStart && statusAt < window.windowEnd;
    },
  );
  const mergedPullRequests =
    releasesInWindow.length === 0
      ? []
      : await gatherMergedPullRequests({ github });
  const newlyContainedByDeployment = new Map<number, PullRequestEvidence[]>();
  for (const deployment of releasesInWindow) {
    const deploymentIndex = successfulProductionDeployments.indexOf(deployment);
    const precedingDeployment =
      deploymentIndex === 0
        ? undefined
        : successfulProductionDeployments[deploymentIndex - 1];
    const newlyContainedCommitOids = await gatherNewlyContainedCommitOids({
      github,
      precedingOid: precedingDeployment?.sha,
      deployedOid: deployment.sha,
    });
    const releaseCarrierCommitOids = new Set<string>();
    for (const pullRequest of mergedPullRequests) {
      if (
        newlyContainedCommitOids.has(pullRequest.mergeCommitOid) &&
        isAggregateReleaseCarrier(pullRequest.pullRequest)
      ) {
        const carrierCommitOids = await gatherPullRequestCommitOids({
          github,
          pullRequestNumber: pullRequest.pullRequest.number,
        });
        for (const oid of carrierCommitOids) {
          releaseCarrierCommitOids.add(oid);
        }
      }
    }
    const releasedPullRequests = new Map<number, MergedPullRequest>();
    for (const pullRequest of mergedPullRequests) {
      if (
        newlyContainedCommitOids.has(pullRequest.mergeCommitOid) ||
        releaseCarrierCommitOids.has(pullRequest.mergeCommitOid)
      ) {
        releasedPullRequests.set(
          pullRequest.pullRequest.number,
          pullRequest,
        );
      }
    }
    newlyContainedByDeployment.set(
      deployment.id,
      [...releasedPullRequests.values()].map(
        (pullRequest) => pullRequest.pullRequest,
      ),
    );
  }
  return deployments.map((deployment) => ({
    environment: deployment.environment,
    status: deployment.status,
    statusAt: deployment.statusAt,
    sha: deployment.sha,
    reachableFromMain: reachability.get(deployment.sha) === true,
    newlyContainedPullRequests:
      newlyContainedByDeployment.get(deployment.id) ?? [],
  }));
}

function compareDeployments([
  left,
  right,
]: [DeploymentWithStatus, DeploymentWithStatus]): number {
  const byStatusTime = left.statusAt.localeCompare(right.statusAt);
  return byStatusTime === 0 ? left.id - right.id : byStatusTime;
}

function isAggregateReleaseCarrier(
  pullRequest: PullRequestEvidence,
): boolean {
  return (
    pullRequest.baseRefName === "main" && pullRequest.headRefName === "dev"
  );
}

async function fetchMainOid({
  github,
}: {
  github: GitHubRepositoryContext;
}): Promise<string> {
  const response = await githubJson({
    token: github.token,
    path: `/repos/${github.owner}/${github.name}/git/ref/heads/main`,
  });
  const oid = nestedString(record(response), ["object", "sha"]);
  if (oid === undefined) {
    throw new Error("GitHub returned invalid main revision evidence.");
  }
  return oid;
}

async function fetchDeploymentRecords({
  github,
}: {
  github: GitHubRepositoryContext;
}): Promise<DeploymentRecord[]> {
  const deployments: DeploymentRecord[] = [];
  for (let page = 1; ; page += 1) {
    const response = await githubJson({
      token: github.token,
      path: `/repos/${github.owner}/${github.name}/deployments?environment=production&per_page=100&page=${page}`,
    });
    if (!Array.isArray(response)) {
      throw new Error("GitHub returned invalid deployment evidence.");
    }
    deployments.push(...response.map(parseDeploymentRecord));
    if (response.length < 100) {
      return deployments;
    }
  }
}

function parseDeploymentRecord(value: unknown): DeploymentRecord {
  const deployment = record(value);
  const id = deployment?.id;
  const environment = deployment?.environment;
  const sha = deployment?.sha;
  if (
    !isInteger(id) ||
    typeof environment !== "string" ||
    typeof sha !== "string" ||
    sha === ""
  ) {
    throw new Error("GitHub returned invalid deployment evidence.");
  }
  return { id, environment, sha };
}

async function fetchDeploymentWithLatestStatus({
  github,
  deployment,
}: {
  github: GitHubRepositoryContext;
  deployment: DeploymentRecord;
}): Promise<DeploymentWithStatus | undefined> {
  const response = await githubJson({
    token: github.token,
    path: `/repos/${github.owner}/${github.name}/deployments/${deployment.id}/statuses?per_page=1`,
  });
  if (!Array.isArray(response)) {
    throw new Error("GitHub returned invalid deployment-status evidence.");
  }
  if (response.length === 0) {
    return undefined;
  }
  const status = record(response[0]);
  const state = status?.state;
  const statusAt = status?.created_at;
  if (!isDeploymentStatus(state) || typeof statusAt !== "string") {
    throw new Error("GitHub returned invalid deployment-status evidence.");
  }
  const parsedStatusAt = new Date(statusAt);
  if (Number.isNaN(parsedStatusAt.getTime())) {
    throw new Error("GitHub returned invalid deployment-status evidence.");
  }
  return { ...deployment, status: state, statusAt };
}

function isDeploymentStatus(value: unknown): value is DeploymentStatus {
  return (
    value === "error" ||
    value === "failure" ||
    value === "inactive" ||
    value === "in_progress" ||
    value === "pending" ||
    value === "queued" ||
    value === "success"
  );
}

async function isReachableFromMain({
  github,
  mainOid,
  deployedOid,
}: {
  github: GitHubRepositoryContext;
  mainOid: string;
  deployedOid: string;
}): Promise<boolean> {
  const response = await githubJson({
    token: github.token,
    path: `/repos/${github.owner}/${github.name}/compare/${deployedOid}...${mainOid}`,
  });
  const status = record(response)?.status;
  if (typeof status !== "string") {
    throw new Error("GitHub returned invalid deployment ancestry evidence.");
  }
  return status === "ahead" || status === "identical";
}

async function gatherNewlyContainedCommitOids({
  github,
  precedingOid,
  deployedOid,
}: {
  github: GitHubRepositoryContext;
  precedingOid: string | undefined;
  deployedOid: string;
}): Promise<Set<string>> {
  return precedingOid === undefined
    ? gatherCommitHistoryOids({ github, deployedOid })
    : gatherComparisonCommitOids({ github, precedingOid, deployedOid });
}

async function gatherCommitHistoryOids({
  github,
  deployedOid,
}: {
  github: GitHubRepositoryContext;
  deployedOid: string;
}): Promise<Set<string>> {
  const commitOids = new Set<string>();
  for (let page = 1; ; page += 1) {
    const response = await githubJson({
      token: github.token,
      path: `/repos/${github.owner}/${github.name}/commits?sha=${deployedOid}&per_page=100&page=${page}`,
    });
    if (!Array.isArray(response)) {
      throw new Error("GitHub returned invalid deployed revision evidence.");
    }
    addCommitOids({
      values: response,
      commitOids,
      errorMessage: "GitHub returned invalid deployed revision evidence.",
    });
    if (response.length < 100) {
      return commitOids;
    }
  }
}

async function gatherComparisonCommitOids({
  github,
  precedingOid,
  deployedOid,
}: {
  github: GitHubRepositoryContext;
  precedingOid: string;
  deployedOid: string;
}): Promise<Set<string>> {
  const commitOids = new Set<string>();
  let totalCommits: number | undefined;
  for (let page = 1; ; page += 1) {
    const response = record(
      await githubJson({
        token: github.token,
        path: `/repos/${github.owner}/${github.name}/compare/${precedingOid}...${deployedOid}?per_page=100&page=${page}`,
      }),
    );
    const pageTotal = response?.total_commits;
    const commits = response?.commits;
    if (!isInteger(pageTotal) || !Array.isArray(commits)) {
      throw new Error("GitHub returned invalid deployment comparison evidence.");
    }
    totalCommits ??= pageTotal;
    if (totalCommits !== pageTotal) {
      throw new Error("GitHub returned inconsistent deployment evidence.");
    }
    addCommitOids({
      values: commits,
      commitOids,
      errorMessage:
        "GitHub returned invalid deployment comparison evidence.",
    });
    if (commitOids.size >= totalCommits) {
      return commitOids;
    }
    if (commits.length === 0) {
      throw new Error("GitHub returned incomplete deployment evidence.");
    }
  }
}

async function gatherPullRequestCommitOids({
  github,
  pullRequestNumber,
}: {
  github: GitHubRepositoryContext;
  pullRequestNumber: number;
}): Promise<Set<string>> {
  const commitOids = new Set<string>();
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const response = await githubJson({
      token: github.token,
      path: "/graphql",
      method: "POST",
      body: {
        query: releaseCarrierCommitsQuery,
        variables: {
          owner: github.owner,
          name: github.name,
          number: pullRequestNumber,
          after: cursor,
        },
      },
    });
    const root = record(response);
    if (root === undefined || root.errors !== undefined) {
      throw new Error("GitHub rejected release-carrier evidence gathering.");
    }
    const connection = nestedRecord(root, [
      "data",
      "repository",
      "pullRequest",
      "commits",
    ]);
    const nodes = connection?.nodes;
    const pageInfo = nestedRecord(connection, ["pageInfo"]);
    const pageHasNext = pageInfo?.hasNextPage;
    const endCursor = pageInfo?.endCursor;
    if (
      !Array.isArray(nodes) ||
      typeof pageHasNext !== "boolean" ||
      (endCursor !== null && typeof endCursor !== "string")
    ) {
      throw new Error("GitHub returned invalid release-carrier evidence.");
    }
    for (const value of nodes) {
      const oid = nestedString(record(value), ["commit", "oid"]);
      if (oid === undefined) {
        throw new Error("GitHub returned invalid release-carrier evidence.");
      }
      commitOids.add(oid);
    }
    hasNextPage = pageHasNext;
    cursor = endCursor;
    if (hasNextPage && cursor === null) {
      throw new Error("GitHub returned incomplete release-carrier evidence.");
    }
  }
  return commitOids;
}

function addCommitOids({
  values,
  commitOids,
  errorMessage,
}: {
  values: unknown[];
  commitOids: Set<string>;
  errorMessage: string;
}): void {
  for (const value of values) {
    const oid = record(value)?.sha;
    if (typeof oid !== "string") {
      throw new Error(errorMessage);
    }
    commitOids.add(oid);
  }
}

async function gatherMergedPullRequests({
  github,
}: {
  github: GitHubRepositoryContext;
}): Promise<MergedPullRequest[]> {
  const pullRequests: MergedPullRequest[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const response = await githubJson({
      token: github.token,
      path: "/graphql",
      method: "POST",
      body: {
        query: mergedPullRequestsQuery,
        variables: {
          owner: github.owner,
          name: github.name,
          after: cursor,
        },
      },
    });
    const root = record(response);
    if (root === undefined || root.errors !== undefined) {
      throw new Error("GitHub rejected merged pull-request evidence gathering.");
    }
    const connection = nestedRecord(root, [
      "data",
      "repository",
      "pullRequests",
    ]);
    const nodes = connection?.nodes;
    const pageInfo = nestedRecord(connection, ["pageInfo"]);
    const pageHasNext = pageInfo?.hasNextPage;
    const endCursor = pageInfo?.endCursor;
    if (
      !Array.isArray(nodes) ||
      typeof pageHasNext !== "boolean" ||
      (endCursor !== null && typeof endCursor !== "string")
    ) {
      throw new Error("GitHub returned invalid merged pull-request evidence.");
    }
    pullRequests.push(...nodes.map(parseMergedPullRequest));
    hasNextPage = pageHasNext;
    cursor = endCursor;
    if (hasNextPage && cursor === null) {
      throw new Error("GitHub returned incomplete merged pull-request evidence.");
    }
  }
  return pullRequests;
}

function parseMergedPullRequest(value: unknown): MergedPullRequest {
  const pullRequest = record(value);
  const number = pullRequest?.number;
  const title = pullRequest?.title;
  const mergedAt = pullRequest?.mergedAt;
  const baseRefName = pullRequest?.baseRefName;
  const headRefName = pullRequest?.headRefName;
  const isDraft = pullRequest?.isDraft;
  const mergeCommitOid = nestedString(pullRequest, ["mergeCommit", "oid"]);
  const headRepositoryValue = pullRequest?.headRepository;
  const headRepository =
    headRepositoryValue === null
      ? null
      : nestedString(pullRequest, ["headRepository", "nameWithOwner"]);
  if (
    !isInteger(number) ||
    typeof title !== "string" ||
    typeof mergedAt !== "string" ||
    typeof baseRefName !== "string" ||
    typeof headRefName !== "string" ||
    typeof isDraft !== "boolean" ||
    mergeCommitOid === undefined ||
    (headRepository !== null && headRepository === undefined)
  ) {
    throw new Error("GitHub returned invalid merged pull-request evidence.");
  }
  return {
    mergeCommitOid,
    pullRequest: {
      state: "MERGED",
      mergedAt,
      number,
      title,
      baseRefName,
      headRefName,
      headRepository,
      labels: parseLabels(pullRequest?.labels),
      isDraft,
      headContainsMain: false,
      blockedBy: [],
      closingIssues: [],
    },
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
        state: "OPEN",
        mergedAt: null,
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

async function gatherRecentlyMergedPullRequests({
  github,
  windowStart,
}: {
  github: GitHubRepositoryContext;
  windowStart: Date;
}): Promise<PullRequestEvidence[]> {
  const pullRequests: PullRequestEvidence[] = [];
  for (let page = 1; ; page += 1) {
    const response = await githubJson({
      token: github.token,
      path: `/repos/${github.owner}/${github.name}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
    });
    if (!Array.isArray(response)) {
      throw new Error("GitHub returned invalid merged pull-request evidence.");
    }
    const candidates = response.map(parseRecentlyClosedPullRequest);
    for (const candidate of candidates) {
      if (candidate.pullRequest !== undefined) {
        pullRequests.push(candidate.pullRequest);
      }
    }
    const oldestUpdatedAt = candidates.at(-1)?.updatedAt;
    if (
      response.length < 100 ||
      (oldestUpdatedAt !== undefined && oldestUpdatedAt < windowStart)
    ) {
      return pullRequests;
    }
  }
}

function parseRecentlyClosedPullRequest(value: unknown): {
  updatedAt: Date;
  pullRequest: PullRequestEvidence | undefined;
} {
  const pullRequest = record(value);
  const number = pullRequest?.number;
  const title = pullRequest?.title;
  const updatedAtValue = pullRequest?.updated_at;
  const mergedAt = pullRequest?.merged_at;
  const baseRefName = nestedString(pullRequest, ["base", "ref"]);
  const headRefName = nestedString(pullRequest, ["head", "ref"]);
  const headRepositoryValue = nestedRecord(pullRequest, ["head"])?.repo;
  const headRepository =
    headRepositoryValue === null
      ? null
      : nestedString(pullRequest, ["head", "repo", "full_name"]);
  const isDraft = pullRequest?.draft;
  const updatedAt =
    typeof updatedAtValue === "string"
      ? new Date(updatedAtValue)
      : new Date(NaN);
  if (
    !isInteger(number) ||
    typeof title !== "string" ||
    Number.isNaN(updatedAt.getTime()) ||
    (mergedAt !== null && typeof mergedAt !== "string") ||
    baseRefName === undefined ||
    headRefName === undefined ||
    (headRepository !== null && headRepository === undefined) ||
    typeof isDraft !== "boolean"
  ) {
    throw new Error("GitHub returned invalid merged pull-request evidence.");
  }
  return {
    updatedAt,
    pullRequest:
      mergedAt === null
        ? undefined
        : {
            state: "MERGED",
            mergedAt,
            number,
            title,
            baseRefName,
            headRefName,
            headRepository,
            labels: [],
            isDraft,
            headContainsMain: false,
            blockedBy: [],
            closingIssues: [],
          },
  };
}

type ParsedPullRequest = Omit<
  PullRequestEvidence,
  "state" | "mergedAt" | "blockedBy" | "closingIssues" | "headContainsMain"
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
