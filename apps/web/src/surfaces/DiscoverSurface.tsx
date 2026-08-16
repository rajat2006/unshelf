import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ConfirmFollowFailure,
  AcquisitionOutcome,
  DiscoverWorkspace,
  DiscoverySummary,
  FollowPreview,
  FollowId,
  FollowLifecycle,
  FollowSummary,
  IdempotencyKey,
  PrepareFollowFailure,
} from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import {
  confirmFollow,
  fetchDiscoverWorkspace,
  prepareFollowPreview,
  refreshFollow,
  refreshWorkspace,
  setFollowLifecycle,
} from "../api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type ConfirmationFailure = ConfirmFollowFailure | "unknown_outcome";

type SetupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failure"; error: PrepareFollowFailure }
  | { kind: "resume"; follow: FollowSummary }
  | { kind: "preview"; preview: FollowPreview; expired: boolean }
  | {
      kind: "confirming";
      preview: FollowPreview;
      idempotencyKey: IdempotencyKey;
    }
  | {
      kind: "confirmation-failure";
      preview: FollowPreview;
      error: ConfirmationFailure;
      idempotencyKey: IdempotencyKey;
    };

type WorkspaceState =
  | { kind: "loading" }
  | { kind: "failure" }
  | { kind: "ready"; workspace: DiscoverWorkspace };

type RefreshState =
  | { kind: "idle" }
  | { kind: "pending"; followId: FollowId }
  | {
      kind: "result";
      followId: FollowId;
      outcome: AcquisitionOutcome;
      rejectedCount: number;
      rereadFailed: boolean;
    }
  | { kind: "failure"; followId: FollowId };

type WorkspaceRefreshState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "failure" }
  | { kind: "result"; affectedFollowIds: FollowId[]; rereadFailed: boolean };

type LifecycleState =
  | { kind: "idle" }
  | { kind: "pending"; followId: FollowId; lifecycle: FollowLifecycle }
  | { kind: "failure"; followId: FollowId };

export function DiscoverSurface() {
  const user = useCurrentUser();
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    kind: "loading",
  });
  const [url, setUrl] = useState("");
  const [setupState, setSetupState] = useState<SetupState>({ kind: "idle" });
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>({
    kind: "idle",
  });
  const [workspaceRefreshState, setWorkspaceRefreshState] =
    useState<WorkspaceRefreshState>({ kind: "idle" });
  const [lifecycleState, setLifecycleState] = useState<LifecycleState>({
    kind: "idle",
  });
  const [showSetup, setShowSetup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const previewExpiresAt =
    setupState.kind === "preview" ? setupState.preview.expiresAt : null;

  const loadWorkspace = async () => {
    const workspace = await fetchDiscoverWorkspace(user);
    setWorkspaceState({ kind: "ready", workspace });
    return workspace;
  };

  useEffect(() => {
    let active = true;
    void fetchDiscoverWorkspace(user)
      .then((workspace) => {
        if (active) setWorkspaceState({ kind: "ready", workspace });
      })
      .catch(() => {
        if (active) setWorkspaceState({ kind: "failure" });
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (
      setupState.kind === "failure" ||
      setupState.kind === "confirmation-failure"
    ) {
      alertRef.current?.focus();
    }
  }, [setupState]);

  useEffect(() => {
    if (previewExpiresAt === null) return;
    const delay = Date.parse(previewExpiresAt) - Date.now();
    if (delay <= 0) {
      setSetupState((current) =>
        current.kind === "preview" ? { ...current, expired: true } : current,
      );
      return;
    }
    const timer = window.setTimeout(
      () =>
        setSetupState((current) =>
          current.kind === "preview" ? { ...current, expired: true } : current,
        ),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [previewExpiresAt]);

  const runPreview = async () => {
    setSetupState({ kind: "loading" });
    setAnnouncement(null);
    try {
      const result = await prepareFollowPreview(user, url);
      if (!result.ok) {
        setSetupState({ kind: "failure", error: result.error });
      } else if ("preview" in result) {
        setSetupState({
          kind: "preview",
          preview: result.preview,
          expired: Date.parse(result.preview.expiresAt) <= Date.now(),
        });
      } else {
        await loadWorkspace();
        if (result.outcome === "resume_available") {
          setSetupState({ kind: "resume", follow: result.follow });
        } else {
          setSetupState({ kind: "idle" });
          setAnnouncement(
            `${result.follow.name ?? "This channel"} is already being followed.`,
          );
        }
      }
    } catch {
      setSetupState({ kind: "failure", error: "provider_unavailable" });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runPreview();
  };

  const reset = () => {
    setSetupState({ kind: "idle" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const runFollowRefresh = async (follow: FollowSummary) => {
    setRefreshState({ kind: "pending", followId: follow.id });
    try {
      const result = await refreshFollow(user, follow.id);
      if (!result.ok) {
        setRefreshState({ kind: "failure", followId: follow.id });
        return;
      }
      setRefreshState({
        kind: "result",
        followId: follow.id,
        outcome: result.acquisition.outcome,
        rejectedCount: result.acquisition.rejectedCount,
        rereadFailed: false,
      });
      if (
        result.acquisition.outcome === "complete" ||
        result.acquisition.outcome === "partial"
      ) {
        try {
          await loadWorkspace();
        } catch {
          setRefreshState({
            kind: "result",
            followId: follow.id,
            outcome: result.acquisition.outcome,
            rejectedCount: result.acquisition.rejectedCount,
            rereadFailed: true,
          });
        }
      }
    } catch {
      setRefreshState({ kind: "failure", followId: follow.id });
    }
  };

  const runWorkspaceRefresh = async () => {
    setWorkspaceRefreshState({ kind: "pending" });
    try {
      const result = await refreshWorkspace(user);
      const affectedFollowIds = result.acquisitions
        .filter(({ outcome }) => outcome !== "complete" && outcome !== "joined")
        .map(({ followId }) => followId);
      try {
        await loadWorkspace();
        setWorkspaceRefreshState({
          kind: "result",
          affectedFollowIds,
          rereadFailed: false,
        });
      } catch {
        setWorkspaceRefreshState({
          kind: "result",
          affectedFollowIds,
          rereadFailed: true,
        });
      }
    } catch {
      setWorkspaceRefreshState({ kind: "failure" });
    }
  };

  const runLifecycleChange = async (
    follow: FollowSummary,
    lifecycle: FollowLifecycle,
  ) => {
    setLifecycleState({ kind: "pending", followId: follow.id, lifecycle });
    try {
      const result = await setFollowLifecycle(user, {
        followId: follow.id,
        lifecycle,
        idempotencyKey: crypto.randomUUID() as IdempotencyKey,
      });
      if (!result.ok) {
        setLifecycleState({ kind: "failure", followId: follow.id });
        return;
      }
      setWorkspaceState((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              workspace: {
                ...current.workspace,
                follows: current.workspace.follows.map((entry) =>
                  entry.id === result.follow.id ? result.follow : entry,
                ),
              },
            }
          : current,
      );
      setLifecycleState({ kind: "idle" });
      if (lifecycle === "active") setSetupState({ kind: "idle" });
      await loadWorkspace();
    } catch {
      setLifecycleState({ kind: "failure", followId: follow.id });
    }
  };

  const confirmPreview = async (
    preview: FollowPreview,
    idempotencyKey: IdempotencyKey = crypto.randomUUID() as IdempotencyKey,
  ) => {
    setSetupState({ kind: "confirming", preview, idempotencyKey });
    let result;
    try {
      result = await confirmFollow(user, {
        previewId: preview.previewId,
        idempotencyKey,
      });
    } catch {
      setSetupState({
        kind: "confirmation-failure",
        preview,
        error: "unknown_outcome",
        idempotencyKey,
      });
      return;
    }
    if (!result.ok) {
      setSetupState({
        kind: "confirmation-failure",
        preview,
        error: result.error,
        idempotencyKey,
      });
      return;
    }

    const followName = result.follow.name ?? "This channel";
    setWorkspaceState((current) => ({
      kind: "ready",
      workspace:
        current.kind === "ready"
          ? {
              follows: [
                ...current.workspace.follows.filter(
                  ({ id }) => id !== result.follow.id,
                ),
                result.follow,
              ],
              discoveries: [
                ...current.workspace.discoveries,
                ...result.discoveries,
              ],
            }
          : { follows: [result.follow], discoveries: result.discoveries },
    }));
    setShowSetup(false);
    setSetupState({ kind: "idle" });
    setAnnouncement(`${followName} is now in Discover.`);
    try {
      await loadWorkspace();
    } catch {
      setAnnouncement(
        `${followName} was confirmed, but the intake could not refresh. Reload Discover to retry.`,
      );
    }
  };

  if (workspaceState.kind === "loading") {
    return <DiscoverSkeleton />;
  }

  if (workspaceState.kind === "failure") {
    return (
      <section
        className="mx-auto max-w-6xl space-y-6"
        aria-labelledby="discover-heading"
      >
        <DiscoverHeader />
        <Alert className="space-y-3">
          <p>Discover could not load. Your stored intake is unchanged.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setWorkspaceState({ kind: "loading" });
              void loadWorkspace().catch(() =>
                setWorkspaceState({ kind: "failure" }),
              );
            }}
          >
            Retry
          </Button>
        </Alert>
      </section>
    );
  }

  const hasFollow = workspaceState.workspace.follows.length > 0;
  return (
    <section
      className="mx-auto max-w-6xl space-y-6"
      aria-labelledby="discover-heading"
    >
      <DiscoverHeader />
      {announcement ? (
        <p role="status" aria-live="polite" className="text-sm text-primary">
          {announcement}
        </p>
      ) : null}

      {!hasFollow ? (
        <SetupForm
          url={url}
          state={setupState}
          inputRef={inputRef}
          alertRef={alertRef}
          onUrlChange={setUrl}
          onSubmit={submit}
          onRetry={() => void runPreview()}
        />
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              type="button"
              size="touch"
              variant="quiet"
              onClick={() => setShowSetup((visible) => !visible)}
            >
              {showSetup ? "Close Follow setup" : "Follow another channel"}
            </Button>
          </div>
          {showSetup ? (
            <SetupForm
              url={url}
              state={setupState}
              inputRef={inputRef}
              alertRef={alertRef}
              onUrlChange={setUrl}
              onSubmit={submit}
              onRetry={() => void runPreview()}
            />
          ) : null}
          <Workspace
            workspace={workspaceState.workspace}
            refreshState={refreshState}
            workspaceRefreshState={workspaceRefreshState}
            lifecycleState={lifecycleState}
            onRefresh={(follow) => void runFollowRefresh(follow)}
            onRefreshWorkspace={() => void runWorkspaceRefresh()}
            onLifecycleChange={(follow, lifecycle) =>
              void runLifecycleChange(follow, lifecycle)
            }
          />
        </>
      )}

      {setupState.kind === "preview" ? (
        <Preview
          preview={setupState.preview}
          expired={setupState.expired}
          onCancel={reset}
          onConfirm={() => void confirmPreview(setupState.preview)}
        />
      ) : null}
      {setupState.kind === "resume" ? (
        <Alert className="flex flex-wrap items-center justify-between gap-3">
          <p>{setupState.follow.name ?? "This channel"} is paused.</p>
          <Button
            type="button"
            size="touch"
            variant="secondary"
            disabled={
              lifecycleState.kind === "pending" &&
              lifecycleState.followId === setupState.follow.id
            }
            onClick={() => void runLifecycleChange(setupState.follow, "active")}
          >
            Resume Follow
          </Button>
        </Alert>
      ) : null}
      {setupState.kind === "confirming" ? (
        <Preview
          preview={setupState.preview}
          expired={false}
          confirming
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      ) : null}
      {setupState.kind === "confirmation-failure" ? (
        <Alert ref={alertRef} tabIndex={-1} className="space-y-3">
          <p>{confirmationFailureMessage(setupState.error)}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void confirmPreview(
                  setupState.preview,
                  setupState.idempotencyKey,
                )
              }
            >
              Retry confirmation
            </Button>
            <Button type="button" variant="quiet" onClick={reset}>
              Start over
            </Button>
          </div>
        </Alert>
      ) : null}
    </section>
  );
}

function DiscoverHeader() {
  return (
    <header className="space-y-2">
      <p className="text-sm font-medium text-primary">Discover</p>
      <h1
        id="discover-heading"
        className="text-3xl font-semibold tracking-tight"
      >
        Discover
      </h1>
      <p className="max-w-2xl text-muted-foreground">
        A calm intake of current learning material from Providers you Follow.
      </p>
    </header>
  );
}

function DiscoverSkeleton() {
  return (
    <section
      className="mx-auto max-w-6xl space-y-6"
      aria-labelledby="discover-heading"
    >
      <DiscoverHeader />
      <div
        role="status"
        aria-live="polite"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <span className="sr-only">Loading Discover…</span>
        {[0, 1, 2].map((position) => (
          <div
            key={position}
            aria-hidden="true"
            className="h-56 animate-pulse rounded-[var(--radius-card)] border bg-muted"
          />
        ))}
      </div>
    </section>
  );
}

function SetupForm({
  url,
  state,
  inputRef,
  alertRef,
  onUrlChange,
  onSubmit,
  onRetry,
}: {
  url: string;
  state: SetupState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  alertRef: React.RefObject<HTMLDivElement | null>;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
  onRetry: () => void;
}) {
  return (
    <>
      <form
        className="rounded-[var(--radius-card)] border bg-card p-5 shadow-sm"
        onSubmit={onSubmit}
      >
        <Field>
          <FieldLabel htmlFor="youtube-channel-url">
            Public YouTube channel URL
          </FieldLabel>
          <FieldDescription>
            Preview up to ten eligible videos from the last 30 days before you
            Follow.
          </FieldDescription>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={inputRef}
              id="youtube-channel-url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              required
              disabled={state.kind === "loading"}
              aria-invalid={state.kind === "failure"}
            />
            <Button type="submit" disabled={state.kind === "loading"}>
              Preview channel
            </Button>
          </div>
        </Field>
      </form>
      {state.kind === "loading" ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          Resolving channel…
        </p>
      ) : null}
      {state.kind === "failure" ? (
        <Alert ref={alertRef} tabIndex={-1} className="space-y-3">
          <p>{failureMessage(state.error)}</p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry preview
          </Button>
        </Alert>
      ) : null}
    </>
  );
}

function Workspace({
  workspace,
  refreshState,
  workspaceRefreshState,
  lifecycleState,
  onRefresh,
  onRefreshWorkspace,
  onLifecycleChange,
}: {
  workspace: DiscoverWorkspace;
  refreshState: RefreshState;
  workspaceRefreshState: WorkspaceRefreshState;
  lifecycleState: LifecycleState;
  onRefresh: (follow: FollowSummary) => void;
  onRefreshWorkspace: () => void;
  onLifecycleChange: (
    follow: FollowSummary,
    lifecycle: FollowLifecycle,
  ) => void;
}) {
  const [selectedFollowId, setSelectedFollowId] = useState<FollowId | null>(
    null,
  );
  const filteredDiscoveries =
    selectedFollowId === null
      ? workspace.discoveries
      : workspace.discoveries.filter(
          ({ followId }) => followId === selectedFollowId,
        );
  const selectedFollow = workspace.follows.find(
    ({ id }) => id === selectedFollowId,
  );
  const refreshingFollowName =
    refreshState.kind === "idle"
      ? "this Follow"
      : (workspace.follows.find(({ id }) => id === refreshState.followId)
          ?.name ?? "this Follow");
  const affectedFollowIds =
    workspaceRefreshState.kind === "result"
      ? workspaceRefreshState.affectedFollowIds
      : (workspace.aggregateNotice?.affectedFollowIds ?? []);
  const affectedNames = affectedFollowIds.map(
    (followId) =>
      workspace.follows.find(({ id }) => id === followId)?.name ?? "One Follow",
  );
  return (
    <div
      data-testid="discover-workspace"
      className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <aside
        aria-label="Follows"
        className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Follows</h2>
          <Button
            type="button"
            size="touch"
            variant="secondary"
            disabled={workspaceRefreshState.kind === "pending"}
            onClick={onRefreshWorkspace}
          >
            {workspaceRefreshState.kind === "pending"
              ? "Refreshing all…"
              : "Refresh all"}
          </Button>
        </div>
        <Button
          type="button"
          size="touch"
          variant="quiet"
          aria-pressed={selectedFollowId === null}
          className="w-full justify-between"
          onClick={() => setSelectedFollowId(null)}
        >
          <span>All Follows</span>
          <span>{workspace.discoveries.length}</span>
        </Button>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {workspace.follows.map((follow) => {
            const followName = follow.name ?? "Follow unavailable";
            const unresolvedCount = workspace.discoveries.filter(
              ({ followId }) => followId === follow.id,
            ).length;
            const refreshForFollow =
              refreshState.kind !== "idle" &&
              refreshState.followId === follow.id
                ? refreshState
                : { kind: "idle" as const };
            const lifecycleForFollow =
              lifecycleState.kind !== "idle" &&
              lifecycleState.followId === follow.id
                ? lifecycleState
                : { kind: "idle" as const };
            const recoveryNeeded =
              refreshForFollow.kind === "failure" ||
              (refreshForFollow.kind === "result" &&
                (refreshForFollow.outcome !== "complete" ||
                  refreshForFollow.rereadFailed)) ||
              (refreshForFollow.kind === "idle" &&
                follow.health.latestAttemptOutcome !== null &&
                follow.health.latestAttemptOutcome !== "complete");
            return (
              <article
                key={follow.id}
                className="min-w-0 space-y-2 rounded-[var(--radius-card)] border bg-card p-3"
              >
                <Button
                  type="button"
                  size="touch"
                  variant="quiet"
                  aria-pressed={selectedFollowId === follow.id}
                  className="w-full justify-between px-0"
                  onClick={() => setSelectedFollowId(follow.id)}
                >
                  <span className="truncate">{followName}</span>
                  <span>{unresolvedCount}</span>
                </Button>
                <p className="text-xs capitalize text-muted-foreground">
                  {follow.lifecycle} ·{" "}
                  {follow.health.latestAttemptOutcome ?? "not checked"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Latest attempt:{" "}
                  {formatHealthTime(follow.health.latestAttemptAt)}
                  <br />
                  Latest complete:{" "}
                  {formatHealthTime(follow.health.latestCompleteAt)}
                  <br />
                  Verified since:{" "}
                  {formatHealthTime(follow.health.verifiedCoverageStartedAt)}
                  {follow.health.nextEligibleAt ? (
                    <>
                      <br />
                      Retry after:{" "}
                      {formatHealthTime(follow.health.nextEligibleAt)}
                    </>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-1">
                  {follow.lifecycle === "active" ? (
                    <>
                      <Button
                        type="button"
                        size="touch"
                        variant="secondary"
                        disabled={refreshForFollow.kind === "pending"}
                        onClick={() => onRefresh(follow)}
                      >
                        {refreshForFollow.kind === "pending"
                          ? `Refreshing ${followName}…`
                          : recoveryNeeded
                            ? `Retry ${followName}`
                            : `Refresh ${followName}`}
                      </Button>
                      <Button
                        type="button"
                        size="touch"
                        variant="quiet"
                        disabled={lifecycleForFollow.kind === "pending"}
                        onClick={() => onLifecycleChange(follow, "paused")}
                      >
                        {lifecycleForFollow.kind === "pending" &&
                        lifecycleForFollow.lifecycle === "paused"
                          ? `Pausing ${followName}`
                          : `Pause ${followName}`}
                      </Button>
                    </>
                  ) : follow.lifecycle === "paused" ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="secondary"
                      disabled={lifecycleForFollow.kind === "pending"}
                      onClick={() => onLifecycleChange(follow, "active")}
                    >
                      {lifecycleForFollow.kind === "pending" &&
                      lifecycleForFollow.lifecycle === "active"
                        ? `Resuming ${followName}`
                        : `Resume ${followName}`}
                    </Button>
                  ) : null}
                  {follow.lifecycle !== "removed" ? (
                    <Button
                      type="button"
                      size="touch"
                      variant="quiet"
                      disabled={lifecycleForFollow.kind === "pending"}
                      onClick={() => onLifecycleChange(follow, "removed")}
                    >
                      {lifecycleForFollow.kind === "pending" &&
                      lifecycleForFollow.lifecycle === "removed"
                        ? `Removing ${followName}`
                        : `Remove ${followName}`}
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </aside>
      <section
        className="min-w-0 space-y-4"
        aria-labelledby="discover-intake-heading"
      >
        <div className="flex items-end justify-between gap-4 border-b pb-3">
          <div>
            <h2 id="discover-intake-heading" className="text-xl font-semibold">
              Intake
            </h2>
            <p className="text-sm text-muted-foreground">
              {filteredDiscoveries.length} unresolved
              {selectedFollow
                ? ` from ${selectedFollow.name ?? "this Follow"}`
                : ""}
            </p>
          </div>
        </div>
        {workspaceRefreshState.kind === "failure" ? (
          <Alert>Workspace Refresh failed. Stored intake is unchanged.</Alert>
        ) : null}
        {affectedNames.length > 0 ? (
          <Alert>
            {affectedNames.join(", ")} could not refresh completely. Other
            Follow results remain available.
          </Alert>
        ) : null}
        {workspaceRefreshState.kind === "result" &&
        workspaceRefreshState.rereadFailed ? (
          <Alert>
            Refresh finished, but the intake could not reload. Stored cards
            remain available.
          </Alert>
        ) : null}
        {refreshState.kind === "pending" ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            Refreshing {refreshingFollowName}. Stored intake remains available.
          </p>
        ) : null}
        {refreshState.kind === "failure" ? (
          <Alert>
            Refresh failed for {refreshingFollowName}. Stored intake is
            unchanged; retry when ready.
          </Alert>
        ) : null}
        {refreshState.kind === "result" && refreshState.rereadFailed ? (
          <Alert>
            {refreshingFollowName}
            {refreshState.outcome === "partial"
              ? " partially refreshed"
              : " refreshed"}
            , but the intake could not reload. Stored cards remain available;
            retry when ready.
          </Alert>
        ) : null}
        {refreshState.kind === "result" &&
        !refreshState.rereadFailed &&
        refreshState.outcome === "partial" ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            Partial refresh for {refreshingFollowName}:{" "}
            {refreshState.rejectedCount} invalid or unavailable records were
            excluded. Stored intake was preserved.
          </p>
        ) : null}
        {refreshState.kind === "result" &&
        !refreshState.rereadFailed &&
        refreshState.outcome === "complete" ? (
          <p role="status" aria-live="polite" className="text-sm text-primary">
            {refreshingFollowName} refreshed.
          </p>
        ) : null}
        {refreshState.kind === "result" &&
        !refreshState.rereadFailed &&
        refreshState.outcome !== "complete" &&
        refreshState.outcome !== "partial" ? (
          <Alert>
            {refreshOutcomeMessage(refreshState.outcome, refreshingFollowName)}{" "}
            Stored intake is unchanged.
          </Alert>
        ) : null}
        {filteredDiscoveries.length === 0 ? (
          <div className="space-y-3 rounded-[var(--radius-card)] border border-dashed p-8 text-center text-muted-foreground">
            <p>
              {selectedFollow
                ? `${selectedFollow.name ?? "This Follow"} is clear.`
                : "You’re caught up. New Discoveries will appear here."}
            </p>
            {selectedFollow ? (
              <Button
                type="button"
                size="touch"
                variant="secondary"
                onClick={() => setSelectedFollowId(null)}
              >
                Return to All Follows
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDiscoveries.map((discovery) => (
              <DiscoveryCard key={discovery.id} discovery={discovery} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatHealthTime(value: string | null): string {
  return value === null
    ? "Never"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
}

function refreshOutcomeMessage(
  outcome: AcquisitionOutcome,
  followName: string,
): string {
  return {
    joined: `${followName} joined an acquisition already in progress.`,
    skipped: `${followName} already has a newer acquisition.`,
    complete: `${followName} refreshed.`,
    partial: `${followName} refreshed partially.`,
    failed: `Refresh failed for ${followName}.`,
    throttled: `${followName} cannot refresh yet.`,
    provider_unavailable: `YouTube is unavailable for ${followName}.`,
  }[outcome];
}

function DiscoveryCard({ discovery }: { discovery: DiscoverySummary }) {
  return (
    <li className="overflow-hidden rounded-[var(--radius-card)] border bg-card shadow-sm">
      {discovery.thumbnailUrl ? (
        <img
          src={discovery.thumbnailUrl}
          alt=""
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="grid aspect-video place-items-center bg-muted text-sm text-muted-foreground">
          Video preview unavailable
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{discovery.followName ?? "Follow unavailable"}</span>
          <span className="capitalize">{discovery.state}</span>
        </div>
        <h3 className="font-medium leading-snug">
          {discovery.title ?? "Video details unavailable"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {discovery.publisher ?? "Publisher unavailable"}
        </p>
        <p className="text-xs text-muted-foreground">
          {discovery.publishedAt
            ? new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
              }).format(new Date(discovery.publishedAt))
            : "Publication time unavailable"}
          {discovery.durationSeconds === null
            ? " · Duration unavailable"
            : ` · ${formatDuration(discovery.durationSeconds)}`}
        </p>
        {discovery.source ? (
          <a
            href={discovery.source}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Open on YouTube
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">
            Source unavailable
          </span>
        )}
      </div>
    </li>
  );
}

function Preview({
  preview,
  expired,
  confirming = false,
  onCancel,
  onConfirm,
}: {
  preview: FollowPreview;
  expired: boolean;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="space-y-4" aria-labelledby="channel-preview-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="channel-preview-heading" className="text-xl font-semibold">
            {preview.target.publisher}
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.videos.length} eligible{" "}
            {preview.videos.length === 1 ? "video" : "videos"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={confirming}
          >
            {expired ? "Start over" : "Cancel preview"}
          </Button>
          {!expired ? (
            <Button type="button" onClick={onConfirm} disabled={confirming}>
              {confirming
                ? preview.restoresFollowId
                  ? "Following again…"
                  : "Following…"
                : preview.restoresFollowId
                  ? "Follow again"
                  : "Follow channel"}
            </Button>
          ) : null}
        </div>
      </div>
      {preview.outcome === "partial" ? (
        <p
          role="status"
          className="rounded-[var(--radius-card)] border bg-muted p-3 text-sm text-muted-foreground"
        >
          Partial preview: {preview.rejectedCount} invalid or unavailable{" "}
          {preview.rejectedCount === 1 ? "record was" : "records were"}{" "}
          excluded.
        </p>
      ) : null}
      {expired ? (
        <Alert>
          Preview expired. Start over to inspect a fresh exact result.
        </Alert>
      ) : null}
      {preview.videos.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed p-6 text-center text-muted-foreground">
          No eligible videos in the last 30 days.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {preview.videos.map((video) => (
            <li
              key={video.providerIdentity}
              className="overflow-hidden rounded-[var(--radius-card)] border bg-card"
            >
              {video.thumbnailUrl ? (
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="grid aspect-video place-items-center bg-muted text-sm text-muted-foreground">
                  Video preview unavailable
                </div>
              )}
              <div className="space-y-1 p-4">
                <h3 className="font-medium leading-snug">{video.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {video.publisher}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(video.durationSeconds)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function failureMessage(error: PrepareFollowFailure): string {
  return {
    invalid_target: "Enter a valid public YouTube channel URL.",
    unsupported_target: "Only public YouTube channel URLs are supported.",
    provider_unavailable: "YouTube is unavailable. Retry the preview.",
    quota_exceeded:
      "YouTube preview capacity is temporarily exhausted. Retry later.",
    unverifiable:
      "YouTube could not provide a verifiable preview. Retry later.",
  }[error];
}

function confirmationFailureMessage(error: ConfirmationFailure): string {
  return {
    preview_missing: "That preview is no longer available. Start over.",
    preview_expired:
      "That preview expired. Start over to inspect a fresh result.",
    preview_consumed: "That preview was already confirmed. Reload Discover.",
    preview_unverifiable:
      "That exact preview can no longer be verified. Start over.",
    idempotency_conflict:
      "This confirmation conflicted with an earlier request. Start over.",
    unknown_outcome:
      "Confirmation may have completed, but its response was lost. Retry safely with the same request key.",
  }[error];
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
