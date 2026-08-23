import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ITEM_TYPES,
  Type,
  type DiscoverCandidate,
  type DiscoverFollow,
  type DiscoverFollowId,
  type DiscoverPreview,
  type DiscoverPreviewVideo,
  type DiscoverWorkspace,
} from "@unshelf/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DiscoverCandidateDecisionError,
  DiscoverPreviewError,
  createDiscoverFollow,
  fetchDiscoverPreview,
  fetchDiscoverWorkspace,
  keepDiscoverCandidate,
  rejectDiscoverCandidate,
  unfollowDiscoverChannel,
  type DiscoverPreviewFailure,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { TYPE_LABELS } from "../items/presentation";

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
  const [selectedFollowId, setSelectedFollowId] =
    useState<DiscoverFollowId | null>(null);
  const [unfollowingFollowId, setUnfollowingFollowId] =
    useState<DiscoverFollowId | null>(null);
  const [unfollowError, setUnfollowError] = useState<string | null>(null);
  const [workspaceRefreshStatus, setWorkspaceRefreshStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [filtering, setFiltering] = useState(false);
  const [filterFailed, setFilterFailed] = useState(false);
  const [failedFilterId, setFailedFilterId] = useState<DiscoverFollowId | null>(
    null,
  );
  const workspaceRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = ++workspaceRequestId.current;
    setSelectedFollowId(null);
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
    setSelectedFollowId(null);
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

  const selectFollow = async (followId: DiscoverFollowId | null) => {
    const requestId = ++workspaceRequestId.current;
    setFiltering(true);
    setFilterFailed(false);
    setFailedFilterId(null);
    try {
      const workspace = await fetchDiscoverWorkspace(
        user,
        followId ?? undefined,
      );
      if (requestId === workspaceRequestId.current) {
        setSelectedFollowId(followId);
        setWorkspaceState({ status: "ready", workspace });
        setFiltering(false);
      }
    } catch {
      if (requestId === workspaceRequestId.current) {
        setFailedFilterId(followId);
        setFilterFailed(true);
        setFiltering(false);
      }
    }
  };

  const reconcileWorkspace = async (followId: DiscoverFollowId | null) => {
    const requestId = ++workspaceRequestId.current;
    setWorkspaceRefreshStatus("loading");
    try {
      const workspace = await fetchDiscoverWorkspace(
        user,
        followId ?? undefined,
      );
      if (requestId === workspaceRequestId.current) {
        setWorkspaceState({ status: "ready", workspace });
        setShowSetup(workspace.follows.length === 0);
        setWorkspaceRefreshStatus("idle");
      }
    } catch {
      if (requestId === workspaceRequestId.current) {
        setWorkspaceRefreshStatus("error");
      }
    }
  };

  const unfollow = async (follow: DiscoverFollow) => {
    const visibleWorkspace =
      workspaceState.status === "ready" ? workspaceState.workspace : null;
    setUnfollowingFollowId(follow.id);
    setUnfollowError(null);
    try {
      await unfollowDiscoverChannel(user, follow.id);
    } catch {
      setUnfollowingFollowId(null);
      setUnfollowError(
        `${follow.channel.title} could not be Unfollowed. Try again.`,
      );
      return;
    }

    const nextSelectedFollowId =
      selectedFollowId === follow.id ? null : selectedFollowId;
    if (visibleWorkspace) {
      const workspace = workspaceWithoutFollow(visibleWorkspace, follow);
      setWorkspaceState({ status: "ready", workspace });
      setShowSetup(workspace.follows.length === 0);
    }
    setUnfollowingFollowId(null);
    setSelectedFollowId(nextSelectedFollowId);
    await reconcileWorkspace(nextSelectedFollowId);
  };

  const removeResolvedCandidate = (candidateId: DiscoverCandidate["id"]) => {
    setWorkspaceState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            workspace: {
              ...current.workspace,
              candidates: current.workspace.candidates.filter(
                (candidate) => candidate.id !== candidateId,
              ),
            },
          }
        : current,
    );
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
      {workspaceRefreshStatus === "loading" && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Refreshing the remaining Discover queue…
        </p>
      )}
      {workspaceRefreshStatus === "error" && (
        <Alert className="flex max-w-3xl flex-wrap items-center justify-between gap-2 p-4">
          <span>The remaining Discover queue could not be refreshed.</span>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            onClick={() => void reconcileWorkspace(selectedFollowId)}
          >
            Retry Discover queue
          </Button>
        </Alert>
      )}
      {workspaceState.status === "ready" &&
        workspaceState.workspace.follows.length > 0 && (
          <CandidateQueue
            workspace={workspaceState.workspace}
            selectedFollowId={selectedFollowId}
            unfollowingFollowId={unfollowingFollowId}
            unfollowError={unfollowError}
            filtering={filtering}
            filterFailed={filterFailed}
            onFollowAnother={beginAnotherFollow}
            onSelectFollow={(followId) => void selectFollow(followId)}
            onRetryFilter={() => void selectFollow(failedFilterId)}
            onUnfollow={(follow) => void unfollow(follow)}
            onCandidateResolved={removeResolvedCandidate}
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
  selectedFollowId,
  unfollowingFollowId,
  unfollowError,
  filtering,
  filterFailed,
  onFollowAnother,
  onSelectFollow,
  onRetryFilter,
  onUnfollow,
  onCandidateResolved,
}: {
  workspace: DiscoverWorkspace;
  selectedFollowId: DiscoverFollowId | null;
  unfollowingFollowId: DiscoverFollowId | null;
  unfollowError: string | null;
  filtering: boolean;
  filterFailed: boolean;
  onFollowAnother: () => void;
  onSelectFollow: (followId: DiscoverFollowId | null) => void;
  onRetryFilter: () => void;
  onUnfollow: (follow: DiscoverFollow) => void;
  onCandidateResolved: (candidateId: DiscoverCandidate["id"]) => void;
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
      <section
        aria-label="Follow management"
        className="grid gap-4 rounded-[var(--radius-panel)] border bg-card p-4 lg:grid-cols-[minmax(14rem,20rem)_1fr] lg:items-start"
      >
        <Field>
          <FieldLabel htmlFor="candidate-channel">
            Candidate channel
          </FieldLabel>
          <Select
            disabled={filtering}
            value={selectedFollowId ?? "all"}
            onValueChange={(value) =>
              onSelectFollow(
                value === "all" ? null : (value as DiscoverFollowId),
              )
            }
          >
            <SelectTrigger
              id="candidate-channel"
              aria-label="Candidate channel"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All followed channels</SelectItem>
              {workspace.follows.map((follow) => (
                <SelectItem key={follow.id} value={follow.id}>
                  {follow.channel.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-2">
          <p className="m-0 text-sm font-medium">Followed channels</p>
          <ul
            aria-label="Followed channels"
            className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2"
          >
            {workspace.follows.map((follow) => (
              <li
                key={follow.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] bg-muted/50 px-3 py-2"
              >
                <a
                  className="min-w-0 truncate text-sm font-medium hover:underline"
                  href={follow.channel.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {follow.channel.title}
                </a>
                <Button
                  type="button"
                  size="compact"
                  variant="quiet-destructive"
                  loading={unfollowingFollowId === follow.id}
                  loadingLabel={`Unfollowing ${follow.channel.title}…`}
                  onClick={() => onUnfollow(follow)}
                >
                  Unfollow {follow.channel.title}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </section>
      {filtering && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Filtering pending Candidates…
        </p>
      )}
      {filterFailed && (
        <Alert className="flex flex-wrap items-center justify-between gap-2 p-4">
          <span>The channel filter could not be loaded.</span>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            onClick={onRetryFilter}
          >
            Retry channel filter
          </Button>
        </Alert>
      )}
      {unfollowError && <Alert className="p-4">{unfollowError}</Alert>}
      {workspace.candidates.length === 0 ? (
        <p className="m-0 rounded-[var(--radius-panel)] border bg-card p-5 text-muted-foreground">
          No pending Candidates from your followed channels.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspace.candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              onResolved={() => onCandidateResolved(candidate.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function workspaceWithoutFollow(
  workspace: DiscoverWorkspace,
  follow: DiscoverFollow,
): DiscoverWorkspace {
  return {
    follows: workspace.follows.filter(
      (currentFollow) => currentFollow.id !== follow.id,
    ),
    candidates: workspace.candidates.filter(
      (candidate) =>
        candidate.video.channelExternalId !== follow.channel.externalId,
    ),
  };
}

function VideoCard({ video }: { video: DiscoverPreviewVideo }) {
  return <VideoCardLayout video={video} />;
}

function VideoCardLayout({
  video,
  children,
}: {
  video: DiscoverPreviewVideo;
  children?: ReactNode;
}) {
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
        {children}
      </div>
    </article>
  );
}

function CandidateCard({
  candidate,
  onResolved,
}: {
  candidate: DiscoverCandidate;
  onResolved: () => void;
}) {
  const user = useCurrentUser();
  const video = candidate.video;
  const titleRef = useRef<HTMLInputElement>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [type, setType] = useState<Type>(Type.Video);
  const [titleError, setTitleError] = useState(false);
  const [candidateActionState, setCandidateActionState] = useState<
    "idle" | "keeping" | "rejecting" | "conflict" | "error"
  >("idle");

  const keep = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    setTitleError(false);
    setCandidateActionState("keeping");
    try {
      await keepDiscoverCandidate(user, {
        candidateId: candidate.id,
        title,
        type,
      });
      setKeepOpen(false);
      onResolved();
    } catch (error) {
      setCandidateActionState(candidateActionFailure(error));
    }
  };

  const reject = async () => {
    setCandidateActionState("rejecting");
    try {
      await rejectDiscoverCandidate(user, candidate.id);
      onResolved();
    } catch (error) {
      setCandidateActionState(candidateActionFailure(error));
    }
  };

  return (
    <VideoCardLayout video={video}>
        {candidate.libraryItem && (
          <p className="m-0 text-sm font-medium text-primary">
            Already in Library ·{" "}
            <a className="underline" href={`/items/${candidate.libraryItem.id}`}>
              {candidate.libraryItem.title}
            </a>
          </p>
        )}
        <CandidateActionAlert state={candidateActionState} action="Candidate" />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="compact"
            onClick={() => {
              setCandidateActionState("idle");
              setKeepOpen(true);
            }}
          >
            Keep {video.title}
          </Button>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            loading={candidateActionState === "rejecting"}
            loadingLabel={`Rejecting ${video.title}…`}
            onClick={() => void reject()}
          >
            Reject {video.title}
          </Button>
        </div>
      <Dialog open={keepOpen} onOpenChange={setKeepOpen}>
        <DialogContent aria-describedby={`keep-description-${candidate.id}`}>
          <DialogHeader>
            <DialogTitle>Keep Candidate</DialogTitle>
            <DialogDescription id={`keep-description-${candidate.id}`}>
              Confirm how this video should appear in your Library.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void keep(event)}>
            <Field>
              <FieldLabel htmlFor={`keep-title-${candidate.id}`}>
                Title
              </FieldLabel>
              <Input
                ref={titleRef}
                id={`keep-title-${candidate.id}`}
                value={title}
                aria-invalid={titleError}
                disabled={candidateActionState === "keeping"}
                onChange={(event) => setTitle(event.target.value)}
              />
              {titleError && <FieldError>Enter a title.</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`keep-type-${candidate.id}`}>Type</FieldLabel>
              <Select
                value={type}
                disabled={candidateActionState === "keeping"}
                onValueChange={(value) => setType(value as Type)}
              >
                <SelectTrigger id={`keep-type-${candidate.id}`} aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((itemType) => (
                    <SelectItem key={itemType} value={itemType}>
                      {TYPE_LABELS[itemType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <CandidateActionAlert state={candidateActionState} action="Keep" />
            <div>
              <Button
                type="submit"
                loading={candidateActionState === "keeping"}
                loadingLabel="Keeping Candidate…"
              >
                Keep in Library
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </VideoCardLayout>
  );
}

type CandidateActionFailure = "conflict" | "error";

function candidateActionFailure(error: unknown): CandidateActionFailure {
  return error instanceof DiscoverCandidateDecisionError &&
    error.kind === "conflict"
    ? "conflict"
    : "error";
}

function CandidateActionAlert({
  state,
  action,
}: {
  state: "idle" | "keeping" | "rejecting" | CandidateActionFailure;
  action: "Candidate" | "Keep";
}) {
  if (state !== "conflict" && state !== "error") return null;
  return (
    <Alert>
      {state === "conflict"
        ? "This Candidate was already resolved another way."
        : action === "Keep"
          ? "Keep could not be completed. Try again."
          : "The Candidate could not be resolved. Try again."}
    </Alert>
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
