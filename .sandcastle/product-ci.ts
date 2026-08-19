const PRODUCT_WORKFLOW = "CI";
const PRODUCT_JOB = "Product";
const MAX_DIAGNOSTIC_CHARACTERS = 8_000;
export const MAX_RECOVERY_ACTIONS = 2;

export interface ProductCiCandidate {
  readonly headSha: string;
  readonly baseSha: string;
}

export interface ProductCiPullRequest extends ProductCiCandidate {
  readonly number: number;
  readonly state: "OPEN" | "CLOSED" | "MERGED";
  readonly draft: boolean;
  readonly headRef: string;
  readonly baseRef: string;
  readonly headRepository: string;
  readonly repository: string;
}

export interface ProductCiRunPullRequest extends ProductCiCandidate {
  readonly number: number;
}

export interface ProductCiRun {
  readonly id: number;
  readonly attempt: number;
  readonly workflowName: string;
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly url: string;
  readonly createdAt: string;
  readonly pullRequests: readonly ProductCiRunPullRequest[];
}

export interface ProductCiJob {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly url: string;
}

/** The true-external GitHub boundary. Tests use a deterministic fake. */
export interface ProductCiGitHub {
  getPullRequest(prNumber: number): Promise<ProductCiPullRequest>;
  listWorkflowRuns(): Promise<readonly ProductCiRun[]>;
  listRunJobs(runId: number): Promise<readonly ProductCiJob[]>;
  getJobLog(jobId: number): Promise<string>;
  rerunFailedJobs(runId: number): Promise<void>;
}

export interface ProductCiProof extends ProductCiCandidate {
  readonly prNumber: number;
  readonly headSha: string;
  readonly baseSha: string;
  readonly runId: number;
  readonly runAttempt: number;
  readonly runUrl: string;
  readonly jobUrl: string;
}

export type ProductCiFailureStatus =
  | "missing"
  | "pending"
  | "failed"
  | "cancelled"
  | "malformed"
  | "unreadable"
  | "timed-out";

export type ProductCiVerdict =
  | { readonly ok: true; readonly proof: ProductCiProof }
  | {
      readonly ok: false;
      readonly status: ProductCiFailureStatus;
      readonly reason: string;
      readonly run?: ProductCiRun;
      readonly diagnostics: string;
    };

export type RecoveryAction = "repair-push" | "rerun";

export interface RecoveryState {
  readonly actions: readonly RecoveryAction[];
}

export type RecoveryResult =
  | { readonly ok: true; readonly state: RecoveryState }
  | { readonly ok: false; readonly reason: string };

export async function inspectProductCi({
  github,
  prNumber,
}: {
  github: ProductCiGitHub;
  prNumber: number;
}): Promise<ProductCiVerdict> {
  try {
    const pullRequest = await github.getPullRequest(prNumber);
    if (
      pullRequest.number !== prNumber ||
      pullRequest.state !== "OPEN" ||
      pullRequest.repository !== pullRequest.headRepository
    ) {
      return failure(
        "malformed",
        "The subject is not an open same-repository pull request.",
      );
    }

    const runs = await github.listWorkflowRuns();
    const relevant = runs
      .filter((candidate) => isCurrentRun({ candidate, pullRequest }))
      .sort((left, right) => compareRunsNewestFirst({ left, right }));
    const current = relevant[0];
    if (!current) {
      return failure(
        "missing",
        `No ${PRODUCT_WORKFLOW} pull-request run matches PR #${prNumber} at ` +
          `${pullRequest.headSha}/${pullRequest.baseSha}.`,
      );
    }

    const jobs = await github.listRunJobs(current.id);
    const productJobs = jobs.filter((candidate) => candidate.name === PRODUCT_JOB);
    if (current.status !== "completed" && productJobs.length === 0) {
      return failure(
        "pending",
        `Product CI run ${current.id} is waiting for its Product job.`,
        current,
      );
    }
    if (productJobs.length !== 1) {
      return failure(
        "malformed",
        `Run ${current.id} has ${productJobs.length} ${PRODUCT_JOB} jobs; expected exactly one.`,
        current,
      );
    }

    const productJob = productJobs[0];
    if (!productJob) {
      return failure("malformed", "Product job disappeared.", current);
    }
    if (current.status !== "completed" || productJob.status !== "completed") {
      return failure(
        "pending",
        `Product CI run ${current.id} is still pending.`,
        current,
      );
    }
    if (
      current.conclusion === "cancelled" ||
      productJob.conclusion === "cancelled"
    ) {
      return await failureWithDiagnostics({
        github,
        status: "cancelled",
        reason: `Product CI run ${current.id} was cancelled.`,
        run: current,
        job: productJob,
      });
    }
    if (
      current.conclusion !== "success" ||
      productJob.conclusion !== "success"
    ) {
      return await failureWithDiagnostics({
        github,
        status: "failed",
        reason: `Product CI run ${current.id} did not succeed.`,
        run: current,
        job: productJob,
      });
    }

    return {
      ok: true,
      proof: {
        prNumber,
        headSha: pullRequest.headSha,
        baseSha: pullRequest.baseSha,
        runId: current.id,
        runAttempt: current.attempt,
        runUrl: current.url,
        jobUrl: productJob.url,
      },
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return failure(
      "unreadable",
      `Product CI evidence could not be read: ${detail}`,
    );
  }
}

export async function waitForProductCi({
  github,
  prNumber,
  timeoutMs,
  pollIntervalMs,
  now = Date.now,
  sleep = defaultSleep,
  progress = console.log,
}: {
  github: ProductCiGitHub;
  prNumber: number;
  timeoutMs: number;
  pollIntervalMs: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  progress?: (message: string) => void;
}): Promise<ProductCiVerdict> {
  const deadline = now() + timeoutMs;
  let last: ProductCiVerdict;

  do {
    last = await inspectProductCi({ github, prNumber });
    if (last.ok || !["missing", "pending"].includes(last.status)) return last;
    progress(`Product CI ${last.status}; waiting for the current candidate…`);
    if (now() >= deadline) break;
    await sleep(pollIntervalMs);
  } while (true);

  return failure(
    "timed-out",
    `Timed out waiting for Product CI on PR #${prNumber}. Last state: ${last.reason}`,
    last.ok ? undefined : last.run,
  );
}

export function recordRecoveryAction({
  state,
  action,
}: {
  state: RecoveryState;
  action: RecoveryAction;
}): RecoveryResult {
  if (state.actions.length >= MAX_RECOVERY_ACTIONS) {
    return {
      ok: false,
      reason: "The two permitted Product CI recovery actions are already exhausted.",
    };
  }
  return { ok: true, state: { actions: [...state.actions, action] } };
}

export async function publishProductCiCandidate({
  branch,
  mode,
  state,
  push,
}: {
  branch: string;
  mode: "initial" | "repair";
  state: RecoveryState;
  push: (branch: string) => Promise<unknown>;
}): Promise<RecoveryResult> {
  const accounted =
    mode === "repair"
      ? recordRecoveryAction({ state, action: "repair-push" })
      : { ok: true as const, state };
  if (!accounted.ok) return accounted;

  try {
    await push(branch);
    return accounted;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Candidate push failed: ${detail}` };
  }
}

export async function requestProductCiRerun({
  github,
  prNumber,
  runId,
  state,
}: {
  github: ProductCiGitHub;
  prNumber: number;
  runId: number;
  state: RecoveryState;
}): Promise<RecoveryResult> {
  const accounted = recordRecoveryAction({ state, action: "rerun" });
  if (!accounted.ok) return accounted;

  const verdict = await inspectProductCi({ github, prNumber });
  if (
    verdict.ok ||
    verdict.run?.id !== runId ||
    !["failed", "cancelled"].includes(verdict.status)
  ) {
    return {
      ok: false,
      reason:
        "The requested run is not the current failed Product CI candidate; refusing to rerun stale evidence.",
    };
  }

  try {
    await github.rerunFailedJobs(runId);
    return accounted;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `GitHub rejected the Product CI rerun: ${detail}` };
  }
}

function isCurrentRun({
  candidate,
  pullRequest,
}: {
  candidate: ProductCiRun;
  pullRequest: ProductCiPullRequest;
}) {
  if (
    candidate.workflowName !== PRODUCT_WORKFLOW ||
    candidate.event !== "pull_request"
  ) {
    return false;
  }
  return candidate.pullRequests.some(
    (subject) =>
      subject.number === pullRequest.number &&
      subject.headSha === pullRequest.headSha &&
      subject.baseSha === pullRequest.baseSha,
  );
}

function compareRunsNewestFirst({
  left,
  right,
}: {
  left: ProductCiRun;
  right: ProductCiRun;
}) {
  const byCreatedAt = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (byCreatedAt !== 0) return byCreatedAt;
  if (right.attempt !== left.attempt) return right.attempt - left.attempt;
  return right.id - left.id;
}

async function failureWithDiagnostics({
  github,
  status,
  reason,
  run,
  job,
}: {
  github: ProductCiGitHub;
  status: "failed" | "cancelled";
  reason: string;
  run: ProductCiRun;
  job: ProductCiJob;
}): Promise<ProductCiVerdict> {
  let log = "";
  try {
    log = await github.getJobLog(job.id);
  } catch (error: unknown) {
    log = `(Product job log unavailable: ${error instanceof Error ? error.message : String(error)})`;
  }
  const diagnostics = [
    reason,
    `Run: ${run.url}`,
    `Product job: ${job.url}`,
    log.slice(-MAX_DIAGNOSTIC_CHARACTERS),
  ]
    .filter(Boolean)
    .join("\n");
  return { ok: false, status, reason, run, diagnostics };
}

function failure(
  status: ProductCiFailureStatus,
  reason: string,
  run?: ProductCiRun,
): ProductCiVerdict {
  return { ok: false, status, reason, run, diagnostics: reason };
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
