import { useState, type FormEvent } from "react";
import type { DiscoverPreview } from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DiscoverPreviewError,
  fetchDiscoverPreview,
  type DiscoverPreviewFailure,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: DiscoverPreview }
  | { status: "error"; failure: DiscoverPreviewFailure };

export function DiscoverSurface() {
  const user = useCurrentUser();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<PreviewState>({ status: "idle" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) {
      setState({ status: "error", failure: "invalid" });
      return;
    }
    setState({ status: "loading" });
    try {
      const preview = await fetchDiscoverPreview(user, url);
      setState({ status: "ready", preview });
    } catch (error) {
      setState({
        status: "error",
        failure:
          error instanceof DiscoverPreviewError ? error.kind : "temporary",
      });
    }
  };

  return (
    <section
      className="mx-auto grid w-full max-w-6xl gap-6"
      aria-labelledby="discover-heading"
    >
      <header className="grid gap-2 border-b pb-6">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          Trusted channels
        </p>
        <h1
          id="discover-heading"
          className="m-0 font-serif text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
        >
          Discover
        </h1>
        <p className="m-0 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Preview a public YouTube channel before you choose to Follow it.
        </p>
      </header>

      <form
        className="grid max-w-3xl gap-3 rounded-[var(--radius-panel)] border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => void submit(event)}
      >
        <Field>
          <FieldLabel htmlFor="discover-channel-url">
            YouTube channel URL
          </FieldLabel>
          <Input
            id="discover-channel-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://youtube.com/@channel"
            autoComplete="url"
          />
          <FieldDescription>
            Use a channel ID or @handle URL. Playlists, videos, /user, and /c
            links are not supported.
          </FieldDescription>
        </Field>
        <Button type="submit" disabled={state.status === "loading"}>
          {state.status === "loading"
            ? "Resolving channel…"
            : "Preview channel"}
        </Button>
      </form>

      {state.status === "loading" && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Resolving channel and gathering its latest videos…
        </p>
      )}
      {state.status === "error" && <PreviewFailure failure={state.failure} />}
      {state.status === "ready" && <ChannelPreview preview={state.preview} />}
    </section>
  );
}

function PreviewFailure({ failure }: { failure: DiscoverPreviewFailure }) {
  const messages: Record<DiscoverPreviewFailure, string> = {
    invalid: "Enter a supported YouTube /channel/ or /@handle URL.",
    not_found:
      "That public YouTube channel could not be found. Check the URL and try again.",
    throttled:
      "YouTube is limiting requests right now. Wait a little, then try again.",
    temporary:
      "YouTube could not provide this preview right now. Try again shortly.",
  };
  return <Alert className="max-w-3xl p-4">{messages[failure]}</Alert>;
}

function ChannelPreview({ preview }: { preview: DiscoverPreview }) {
  return (
    <section className="grid gap-4" aria-labelledby="preview-channel-heading">
      <div className="flex items-center gap-3">
        {preview.channel.thumbnailUrl ? (
          <img
            className="size-12 rounded-full object-cover"
            src={preview.channel.thumbnailUrl}
            alt=""
          />
        ) : (
          <div
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-full bg-muted font-serif text-xl"
          >
            {preview.channel.title.slice(0, 1)}
          </div>
        )}
        <div>
          <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Channel preview
          </p>
          <h2
            id="preview-channel-heading"
            className="m-0 font-serif text-2xl font-semibold"
          >
            {preview.channel.title}
          </h2>
        </div>
      </div>
      {preview.videos.length === 0 ? (
        <p className="m-0 rounded-[var(--radius-panel)] border bg-card p-5 text-muted-foreground">
          No eligible videos are available to preview.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {preview.videos.map((video) => (
            <article
              key={video.externalId}
              aria-label={video.title}
              className="grid overflow-hidden rounded-[var(--radius-panel)] border bg-card"
            >
              {video.thumbnailUrl ? (
                <img
                  className="aspect-video w-full object-cover"
                  src={video.thumbnailUrl}
                  alt={video.title}
                />
              ) : (
                <div className="grid aspect-video place-items-center bg-muted text-sm text-muted-foreground">
                  No thumbnail
                </div>
              )}
              <div className="grid content-start gap-2 p-4">
                <a
                  className="font-serif text-lg font-semibold hover:underline"
                  href={video.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  {video.title}
                </a>
                <p className="m-0 text-sm text-muted-foreground">
                  {video.channelTitle}
                </p>
                <p className="m-0 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <time dateTime={video.publishedAt}>
                    {formatPublishedAt(video.publishedAt)}
                  </time>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(video.durationSeconds)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
