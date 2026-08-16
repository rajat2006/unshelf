import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ConfirmFollowFailure,
  DiscoverWorkspace,
  DiscoverySummary,
  FollowPreview,
  IdempotencyKey,
  PrepareFollowFailure,
} from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import {
  confirmFollow,
  fetchDiscoverWorkspace,
  prepareFollowPreview,
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

export function DiscoverSurface() {
  const user = useCurrentUser();
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    kind: "loading",
  });
  const [url, setUrl] = useState("");
  const [setupState, setSetupState] = useState<SetupState>({ kind: "idle" });
  const [announcement, setAnnouncement] = useState<string | null>(null);
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
        setSetupState({ kind: "idle" });
        setAnnouncement(
          result.outcome === "already_following"
            ? `${result.follow.name ?? "This channel"} is already being followed.`
            : `${result.follow.name ?? "This channel"} is paused. Resume controls are coming next.`,
        );
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
    setWorkspaceState({
      kind: "ready",
      workspace: {
        follows: [result.follow],
        discoveries: result.discoveries,
      },
    });
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
        <Workspace workspace={workspaceState.workspace} />
      )}

      {setupState.kind === "preview" ? (
        <Preview
          preview={setupState.preview}
          expired={setupState.expired}
          onCancel={reset}
          onConfirm={() => void confirmPreview(setupState.preview)}
        />
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

function Workspace({ workspace }: { workspace: DiscoverWorkspace }) {
  return (
    <section className="space-y-4" aria-labelledby="discover-intake-heading">
      <div className="flex items-end justify-between gap-4 border-b pb-3">
        <div>
          <h2 id="discover-intake-heading" className="text-xl font-semibold">
            Intake
          </h2>
          <p className="text-sm text-muted-foreground">
            {workspace.discoveries.length} new
          </p>
        </div>
      </div>
      {workspace.discoveries.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed p-8 text-center text-muted-foreground">
          You’re caught up. New Discoveries will appear here.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspace.discoveries.map((discovery) => (
            <DiscoveryCard key={discovery.id} discovery={discovery} />
          ))}
        </ul>
      )}
    </section>
  );
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
              {confirming ? "Following…" : "Follow channel"}
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
