import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  DiscoverPreview,
  DiscoverPreviewVideo,
  DiscoverWorkspace,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  DiscoverPreviewError,
  createDiscoverFollow,
  fetchDiscoverPreview,
  fetchDiscoverWorkspace,
  type DiscoverPreviewFailure,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: DiscoverPreview }
  | { status: "error"; failure: DiscoverPreviewFailure };

type WorkspaceState =
  | { status: "loading" }
  | { status: "ready"; workspace: DiscoverWorkspace }
  | { status: "error" };

export function DiscoverSurface() {
  const user = useCurrentUser();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    status: "loading",
  });
  const [showSetup, setShowSetup] = useState(true);
  const [followStatus, setFollowStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const workspaceRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = ++workspaceRequestId.current;
    void fetchDiscoverWorkspace(user)
      .then((workspace) => {
        if (!active || requestId !== workspaceRequestId.current) return;
        setWorkspaceState({ status: "ready", workspace });
        setShowSetup(workspace.follows.length === 0);
      })
      .catch(() => {
        if (active && requestId === workspaceRequestId.current) {
          setWorkspaceState({ status: "error" });
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

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

  const follow = async (preview: DiscoverPreview) => {
    setFollowStatus("loading");
    try {
      await createDiscoverFollow(user, { targetId: preview.targetId });
    } catch {
      setFollowStatus("error");
      return;
    }

    const requestId = ++workspaceRequestId.current;
    setUrl("");
    setState({ status: "idle" });
    setShowSetup(false);
    setFollowStatus("idle");
    setWorkspaceState({ status: "loading" });
    try {
      const workspace = await fetchDiscoverWorkspace(user);
      if (requestId === workspaceRequestId.current) {
        setWorkspaceState({ status: "ready", workspace });
      }
    } catch {
      if (requestId === workspaceRequestId.current) {
        setWorkspaceState({ status: "error" });
      }
    }
  };

  const beginAnotherFollow = () => {
    setUrl("");
    setState({ status: "idle" });
    setFollowStatus("idle");
    setShowSetup(true);
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

      {showSetup && (
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
      )}

      {showSetup && state.status === "loading" && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Resolving channel and gathering its latest videos…
        </p>
      )}
      {showSetup && state.status === "error" && (
        <PreviewFailure failure={state.failure} />
      )}
      {showSetup && state.status === "ready" && (
        <ChannelPreview
          preview={state.preview}
          followStatus={followStatus}
          onFollow={() => void follow(state.preview)}
        />
      )}
      {followStatus === "error" && (
        <Alert className="max-w-3xl p-4">
          This channel could not be followed. Try again.
        </Alert>
      )}
      {workspaceState.status === "loading" && (
        <p className="m-0 text-sm text-muted-foreground">
          Loading your Discover queue…
        </p>
      )}
      {workspaceState.status === "error" && (
        <Alert className="max-w-3xl p-4">
          Your Discover queue could not be loaded. Try again shortly.
        </Alert>
      )}
      {workspaceState.status === "ready" &&
        workspaceState.workspace.follows.length > 0 && (
          <CandidateQueue
            workspace={workspaceState.workspace}
            onFollowAnother={beginAnotherFollow}
          />
        )}
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

function ChannelPreview({
  preview,
  followStatus,
  onFollow,
}: {
  preview: DiscoverPreview;
  followStatus: "idle" | "loading" | "error";
  onFollow: () => void;
}) {
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
            <VideoCard key={video.externalId} video={video} />
          ))}
        </div>
      )}
      <div>
        <Button
          type="button"
          onClick={onFollow}
          disabled={followStatus === "loading"}
        >
          {followStatus === "loading" ? "Following…" : "Follow channel"}
        </Button>
      </div>
    </section>
  );
}

function CandidateQueue({
  workspace,
  onFollowAnother,
}: {
  workspace: DiscoverWorkspace;
  onFollowAnother: () => void;
}) {
  return (
    <section className="grid gap-4" aria-labelledby="candidate-queue-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Your intake
          </p>
          <h2
            id="candidate-queue-heading"
            className="m-0 font-serif text-2xl font-semibold"
          >
            Pending Candidates
          </h2>
        </div>
        <Button type="button" variant="secondary" onClick={onFollowAnother}>
          Follow another
        </Button>
      </div>
      {workspace.candidates.length === 0 ? (
        <p className="m-0 rounded-[var(--radius-panel)] border bg-card p-5 text-muted-foreground">
          No pending Candidates from your followed channels.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspace.candidates.map((candidate) => (
            <VideoCard key={candidate.id} video={candidate.video} />
          ))}
        </div>
      )}
    </section>
  );
}

function VideoCard({ video }: { video: DiscoverPreviewVideo }) {
  return (
    <article
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
