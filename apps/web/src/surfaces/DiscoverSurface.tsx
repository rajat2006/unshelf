import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { ITEM_TYPES, Type } from "@unshelf/shared";
import type {
  ConfirmFollowFailure,
  AcquisitionOutcome,
  DiscoverWorkspace,
  DiscoverHistoryCursor,
  DiscoveryHistoryEntry,
  DiscoveryId,
  DiscoverySummary,
  FollowPreview,
  FollowId,
  FollowLifecycle,
  FollowSummary,
  IdempotencyKey,
  KeepDiscoveryFailure,
  PrepareFollowFailure,
} from "@unshelf/shared";
import type { ItemBackgroundLocation } from "../items/item-route-state";
import { itemDetailRouteState } from "../items/item-route-state";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import {
  confirmFollow,
  decideDiscoveries,
  fetchDiscoverHistory,
  fetchDiscoverWorkspace,
  keepDiscovery,
  prepareFollowPreview,
  refreshFollow,
  refreshWorkspace,
  setFollowLifecycle,
} from "../api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type DecisionState =
  | { kind: "idle" }
  | {
      kind: "pending";
      discoveryIds: DiscoveryId[];
      decision: "seen" | "dismissed";
      idempotencyKey: IdempotencyKey;
    }
  | {
      kind: "failure";
      discoveryIds: DiscoveryId[];
      decision: "seen" | "dismissed";
      rereadFailed: boolean;
      idempotencyKey: IdempotencyKey;
    };

export function DiscoverSurface({
  backgroundLocation,
}: {
  backgroundLocation?: ItemBackgroundLocation;
} = {}) {
  const user = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [decisionState, setDecisionState] = useState<DecisionState>({
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

  const runDecision = async (
    discoveryIds: DiscoveryId[],
    decision: "seen" | "dismissed",
    idempotencyKey: IdempotencyKey = crypto.randomUUID() as IdempotencyKey,
  ) => {
    setDecisionState({
      kind: "pending",
      discoveryIds,
      decision,
      idempotencyKey,
    });
    try {
      const result = await decideDiscoveries(user, {
        discoveryIds,
        decision,
        idempotencyKey,
      });
      if (!result.ok) {
        setDecisionState({
          kind: "failure",
          discoveryIds,
          decision,
          rereadFailed: false,
          idempotencyKey,
        });
        return;
      }
      try {
        await loadWorkspace();
        setDecisionState({ kind: "idle" });
        setAnnouncement(
          `${discoveryIds.length} ${
            discoveryIds.length === 1 ? "Discovery" : "Discoveries"
          } ${decision === "seen" ? "acknowledged" : "dismissed"}.`,
        );
      } catch {
        setDecisionState({
          kind: "failure",
          discoveryIds,
          decision,
          rereadFailed: true,
          idempotencyKey,
        });
      }
    } catch {
      setDecisionState({
        kind: "failure",
        discoveryIds,
        decision,
        rereadFailed: false,
        idempotencyKey,
      });
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
            decisionState={decisionState}
            onRefresh={(follow) => void runFollowRefresh(follow)}
            onRefreshWorkspace={() => void runWorkspaceRefresh()}
            onLifecycleChange={(follow, lifecycle) =>
              void runLifecycleChange(follow, lifecycle)
            }
            onDecision={(discoveryIds, decision, idempotencyKey) =>
              void runDecision(discoveryIds, decision, idempotencyKey)
            }
            selectedFollowId={selectedFollowIdFromLocation({
              workspace: workspaceState.workspace,
              location: backgroundLocation ?? location,
            })}
            onSelectFollow={(followId) => {
              if (backgroundLocation) return;
              const search = new URLSearchParams(location.search);
              if (followId === null) search.delete("follow");
              else search.set("follow", followId);
              void navigate(
                {
                  pathname: "/discover",
                  search: search.size > 0 ? `?${search.toString()}` : "",
                },
                { replace: true },
              );
            }}
            itemBackgroundLocation={backgroundLocation ?? location}
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
  decisionState,
  onRefresh,
  onRefreshWorkspace,
  onLifecycleChange,
  onDecision,
  selectedFollowId,
  onSelectFollow,
  itemBackgroundLocation,
}: {
  workspace: DiscoverWorkspace;
  refreshState: RefreshState;
  workspaceRefreshState: WorkspaceRefreshState;
  lifecycleState: LifecycleState;
  decisionState: DecisionState;
  onRefresh: (follow: FollowSummary) => void;
  onRefreshWorkspace: () => void;
  onLifecycleChange: (
    follow: FollowSummary,
    lifecycle: FollowLifecycle,
  ) => void;
  onDecision: (
    discoveryIds: DiscoveryId[],
    decision: "seen" | "dismissed",
    idempotencyKey?: IdempotencyKey,
  ) => void;
  selectedFollowId: FollowId | null;
  onSelectFollow: (followId: FollowId | null) => void;
  itemBackgroundLocation: ItemBackgroundLocation;
}) {
  const filteredDiscoveries =
    selectedFollowId === null
      ? workspace.discoveries
      : workspace.discoveries.filter(
          ({ followId }) => followId === selectedFollowId,
        );
  const selectedFollow = workspace.follows.find(
    ({ id }) => id === selectedFollowId,
  );
  const filteredDiscoveryIds = filteredDiscoveries.map(({ id }) => id);
  const bulkPending = decisionState.kind === "pending";
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
          onClick={() => onSelectFollow(null)}
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
                  onClick={() => onSelectFollow(follow.id)}
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
        <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-3">
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
          <div
            className="flex flex-wrap gap-2"
            aria-label="Filtered intake actions"
          >
            <HistoryDialog />
            <Button
              type="button"
              size="touch"
              variant="secondary"
              disabled={filteredDiscoveryIds.length === 0 || bulkPending}
              onClick={() => onDecision(filteredDiscoveryIds, "seen")}
            >
              {bulkPending && decisionState.decision === "seen"
                ? `Acknowledging ${decisionState.discoveryIds.length}…`
                : `Acknowledge ${filteredDiscoveryIds.length}`}
            </Button>
            <Button
              type="button"
              size="touch"
              variant="quiet"
              disabled={filteredDiscoveryIds.length === 0 || bulkPending}
              onClick={() => onDecision(filteredDiscoveryIds, "dismissed")}
            >
              {bulkPending && decisionState.decision === "dismissed"
                ? `Dismissing ${decisionState.discoveryIds.length}…`
                : `Dismiss ${filteredDiscoveryIds.length}`}
            </Button>
          </div>
        </div>
        {workspaceRefreshState.kind === "failure" ? (
          <Alert>Workspace Refresh failed. Stored intake is unchanged.</Alert>
        ) : null}
        {decisionState.kind === "failure" ? (
          <Alert className="space-y-2">
            <p>
              {decisionState.rereadFailed
                ? "The decision was saved, but intake could not reload. Reload Discover to see the authoritative queue."
                : "The decision could not be saved. Your current intake remains available."}
            </p>
            {!decisionState.rereadFailed ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  onDecision(
                    decisionState.discoveryIds,
                    decisionState.decision,
                    decisionState.idempotencyKey,
                  )
                }
              >
                Retry decision
              </Button>
            ) : null}
          </Alert>
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
                onClick={() => onSelectFollow(null)}
              >
                Return to All Follows
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDiscoveries.map((discovery) => (
              <DiscoveryCard
                key={discovery.id}
                discovery={discovery}
                disabled={bulkPending}
                pending={
                  decisionState.kind === "pending" &&
                  decisionState.discoveryIds.includes(discovery.id)
                }
                pendingDecision={
                  decisionState.kind === "pending"
                    ? decisionState.decision
                    : null
                }
                onDecision={onDecision}
                itemBackgroundLocation={itemBackgroundLocation}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type HistoryState =
  | { kind: "idle" }
  | { kind: "loading"; discoveries: DiscoveryHistoryEntry[] }
  | {
      kind: "ready";
      discoveries: DiscoveryHistoryEntry[];
      nextCursor: DiscoverHistoryCursor | null;
    }
  | {
      kind: "failure";
      discoveries: DiscoveryHistoryEntry[];
      cursor: DiscoverHistoryCursor | undefined;
    };

function HistoryDialog() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HistoryState>({ kind: "idle" });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const loadHistory = async (cursor?: DiscoverHistoryCursor) => {
    const currentDiscoveries =
      state.kind === "ready" || state.kind === "failure"
        ? state.discoveries
        : [];
    setState({ kind: "loading", discoveries: currentDiscoveries });
    try {
      const page = await fetchDiscoverHistory(user, cursor);
      setState({
        kind: "ready",
        discoveries:
          cursor === undefined
            ? page.discoveries
            : [...currentDiscoveries, ...page.discoveries],
        nextCursor: page.nextCursor,
      });
    } catch {
      setState({
        kind: "failure",
        discoveries: currentDiscoveries,
        cursor,
      });
    }
  };

  const setDialogOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };

  const discoveries = state.kind === "idle" ? [] : state.discoveries;
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="touch"
        variant="quiet"
        onClick={() => {
          setOpen(true);
          void loadHistory();
        }}
      >
        History
      </Button>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discovery history</DialogTitle>
            <DialogDescription>
              Prior Keep and Dismiss decisions. Provider details reflect what is
              currently available.
            </DialogDescription>
          </DialogHeader>
          {state.kind === "loading" && discoveries.length === 0 ? (
            <p role="status" aria-live="polite">
              Loading history…
            </p>
          ) : null}
          {discoveries.length === 0 && state.kind === "ready" ? (
            <p className="text-sm text-muted-foreground">
              No kept or dismissed Discoveries yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {discoveries.map((discovery) => (
                <li
                  key={discovery.id}
                  className="space-y-1 rounded-[var(--radius-card)] border p-3"
                >
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {discovery.state === "kept" ? "Kept" : "Dismissed"}
                    </span>
                    <time dateTime={discovery.decidedAt}>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(discovery.decidedAt))}
                    </time>
                  </div>
                  <p className="font-medium">
                    {discovery.title ?? "Provider details unavailable"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {discovery.publisher ??
                      discovery.followName ??
                      "Follow unavailable"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {state.kind === "failure" ? (
            <Alert className="space-y-2">
              <p>History could not load. Existing entries remain available.</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadHistory(state.cursor)}
              >
                Retry history
              </Button>
            </Alert>
          ) : null}
          {state.kind === "ready" && state.nextCursor ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadHistory(state.nextCursor!)}
            >
              Load more history
            </Button>
          ) : null}
          {state.kind === "loading" && discoveries.length > 0 ? (
            <p role="status" aria-live="polite">
              Loading more history…
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
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

function DiscoveryCard({
  discovery,
  disabled,
  pending,
  pendingDecision,
  onDecision,
  itemBackgroundLocation,
}: {
  discovery: DiscoverySummary;
  disabled: boolean;
  pending: boolean;
  pendingDecision: "seen" | "dismissed" | null;
  onDecision: (
    discoveryIds: DiscoveryId[],
    decision: "seen" | "dismissed",
  ) => void;
  itemBackgroundLocation: ItemBackgroundLocation;
}) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const keepTriggerRef = useRef<HTMLButtonElement>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const [keepTitle, setKeepTitle] = useState(discovery.title ?? "");
  const [keepType, setKeepType] = useState<Type>(discovery.type ?? Type.Video);
  const [keepPending, setKeepPending] = useState(false);
  const [keepFailure, setKeepFailure] = useState<string | null>(null);
  const [keepIdempotencyKey, setKeepIdempotencyKey] =
    useState<IdempotencyKey | null>(null);
  const metadataAvailable =
    discovery.title !== null &&
    discovery.source !== null &&
    discovery.type !== null;

  const openKeep = () => {
    if (!metadataAvailable || discovery.itemId !== null) return;
    setKeepTitle(discovery.title!);
    setKeepType(discovery.type!);
    setKeepFailure(null);
    setKeepIdempotencyKey(crypto.randomUUID() as IdempotencyKey);
    setKeepOpen(true);
  };

  const submitKeep = async (event: FormEvent) => {
    event.preventDefault();
    if (
      keepPending ||
      keepTitle.trim().length === 0 ||
      discovery.source === null ||
      keepIdempotencyKey === null
    ) {
      return;
    }
    setKeepPending(true);
    setKeepFailure(null);
    try {
      const result = await keepDiscovery(user, {
        discoveryId: discovery.id,
        title: keepTitle,
        type: keepType,
        source: discovery.source,
        idempotencyKey: keepIdempotencyKey,
      });
      if (!result.ok) {
        setKeepFailure(keepFailureMessage(result.error));
        return;
      }
      void navigate(`/items/${result.item.id}`, {
        state: itemDetailRouteState(itemBackgroundLocation),
      });
    } catch {
      setKeepFailure(
        "Keep may have completed, but its response was lost. Retry safely.",
      );
    } finally {
      setKeepPending(false);
    }
  };

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
        {discovery.priorDecisions.kept > 0 ||
        discovery.priorDecisions.dismissed > 0 ? (
          <p className="text-xs text-muted-foreground">
            Prior history: {discovery.priorDecisions.kept} kept ·{" "}
            {discovery.priorDecisions.dismissed} dismissed
          </p>
        ) : null}
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
        {discovery.itemId !== null ? (
          <p className="text-sm font-medium text-primary">Already in Library</p>
        ) : !metadataAvailable ? (
          <p className="text-sm text-muted-foreground">
            Keep unavailable. Retry this Follow to restore current details.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {discovery.itemId === null && metadataAvailable ? (
            <Button
              ref={keepTriggerRef}
              type="button"
              size="touch"
              disabled={disabled}
              onClick={openKeep}
            >
              Keep
            </Button>
          ) : null}
          <Button
            type="button"
            size="touch"
            variant="secondary"
            disabled={disabled}
            onClick={() => onDecision([discovery.id], "seen")}
          >
            {pending && pendingDecision === "seen" ? "Saving Later…" : "Later"}
          </Button>
          <Button
            type="button"
            size="touch"
            variant="quiet"
            disabled={disabled}
            onClick={() => onDecision([discovery.id], "dismissed")}
          >
            {pending && pendingDecision === "dismissed"
              ? "Dismissing…"
              : "Dismiss"}
          </Button>
        </div>
      </div>
      <Dialog open={keepOpen} onOpenChange={setKeepOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            keepTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Keep in Library</DialogTitle>
            <DialogDescription>
              Confirm the Item fields that will become your durable Library
              record.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => void submitKeep(event)}
          >
            <Field>
              <FieldLabel htmlFor={`keep-title-${discovery.id}`}>
                Item title
              </FieldLabel>
              <Input
                id={`keep-title-${discovery.id}`}
                value={keepTitle}
                required
                disabled={keepPending}
                onChange={(event) => setKeepTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`keep-type-${discovery.id}`}>
                Type
              </FieldLabel>
              <Select
                value={keepType}
                disabled={keepPending}
                onValueChange={(value) => setKeepType(value as Type)}
              >
                <SelectTrigger
                  id={`keep-type-${discovery.id}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Source</FieldLabel>
              <p className="break-all text-sm text-muted-foreground">
                {discovery.source}
              </p>
            </Field>
            {keepPending ? (
              <p role="status" aria-live="polite" className="sr-only">
                Keeping this Discovery in your Library.
              </p>
            ) : null}
            {keepFailure ? <Alert>{keepFailure}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="quiet"
                disabled={keepPending}
                onClick={() => setKeepOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={keepPending || keepTitle.trim().length === 0}
              >
                {keepPending
                  ? "Keeping…"
                  : keepFailure
                    ? "Retry Keep"
                    : "Keep in Library"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function selectedFollowIdFromLocation({
  workspace,
  location,
}: {
  workspace: DiscoverWorkspace;
  location: ItemBackgroundLocation;
}): FollowId | null {
  const requested = new URLSearchParams(location.search).get("follow");
  return workspace.follows.some(({ id }) => id === requested)
    ? (requested as FollowId)
    : null;
}

function keepFailureMessage(error: KeepDiscoveryFailure): string {
  return {
    discovery_missing: "This Discovery is no longer available.",
    decision_conflict: "This Discovery was already decided.",
    already_in_library: "This Candidate is already in your Library.",
    keep_metadata_unavailable:
      "Current YouTube details are unavailable. Retry the Follow before keeping.",
    idempotency_conflict: "This Keep conflicted with an earlier request.",
  }[error];
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
