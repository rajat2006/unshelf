import { useEffect, useRef, useState, type FormEvent } from "react";
import type { FollowPreview, PrepareFollowFailure } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { prepareFollowPreview } from "../api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type SetupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failure"; error: PrepareFollowFailure }
  | { kind: "preview"; preview: FollowPreview; expired: boolean };

export function DiscoverSurface() {
  const user = useCurrentUser();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<SetupState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const previewExpiresAt =
    state.kind === "preview" ? state.preview.expiresAt : null;

  useEffect(() => {
    if (state.kind === "failure") alertRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (previewExpiresAt === null) return;
    const delay = Date.parse(previewExpiresAt) - Date.now();
    if (delay <= 0) {
      setState((current) =>
        current.kind === "preview" ? { ...current, expired: true } : current,
      );
      return;
    }
    const timer = window.setTimeout(
      () =>
        setState((current) =>
          current.kind === "preview" ? { ...current, expired: true } : current,
        ),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [previewExpiresAt]);

  const runPreview = async () => {
    setState({ kind: "loading" });
    try {
      const result = await prepareFollowPreview(user, url);
      setState(
        result.ok
          ? {
              kind: "preview",
              preview: result.preview,
              expired: Date.parse(result.preview.expiresAt) <= Date.now(),
            }
          : { kind: "failure", error: result.error },
      );
    } catch {
      setState({ kind: "failure", error: "provider_unavailable" });
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runPreview();
  };

  const reset = () => {
    setState({ kind: "idle" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <section
      className="mx-auto max-w-4xl space-y-8"
      aria-labelledby="discover-heading"
    >
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Discover</p>
        <h1
          id="discover-heading"
          className="text-3xl font-semibold tracking-tight"
        >
          Preview a channel
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          See up to ten eligible videos from the last 30 days before choosing
          whether to Follow.
        </p>
      </header>

      <form
        className="rounded-[var(--radius-card)] border bg-card p-5 shadow-sm"
        onSubmit={submit}
      >
        <Field>
          <FieldLabel htmlFor="youtube-channel-url">
            Public YouTube channel URL
          </FieldLabel>
          <FieldDescription>
            Paste a youtube.com channel, handle, or legacy user URL.
          </FieldDescription>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={inputRef}
              id="youtube-channel-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => void runPreview()}
          >
            Retry preview
          </Button>
        </Alert>
      ) : null}

      {state.kind === "preview" ? (
        <Preview
          preview={state.preview}
          expired={state.expired}
          onCancel={reset}
        />
      ) : null}
    </section>
  );
}

function Preview({
  preview,
  expired,
  onCancel,
}: {
  preview: FollowPreview;
  expired: boolean;
  onCancel: () => void;
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
        <Button type="button" variant="secondary" onClick={onCancel}>
          {expired ? "Start over" : "Cancel preview"}
        </Button>
      </div>

      {preview.outcome === "partial" ? (
        <p
          role="status"
          className="rounded-[var(--radius-card)] border border-amber-500/30 bg-amber-500/8 p-3 text-sm"
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
                  Video
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

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
