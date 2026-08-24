import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Plus, Settings2, Video } from "lucide-react";
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
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: "idle",
  });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    status: "loading",
  });
  const [showSetup, setShowSetup] = useState(true);
  const [followStatus, setFollowStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [selectedFollowId, setSelectedFollowId] =
    useState<DiscoverFollowId | null>(null);
  const [candidateCounts, setCandidateCounts] = useState<
    Record<DiscoverFollowId, number>
  >({});
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
        setCandidateCounts(candidateCountsForWorkspace(workspace));
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
      setPreviewState({ status: "error", failure: "invalid" });
      return;
    }
    setPreviewState({ status: "loading" });
    try {
      const preview = await fetchDiscoverPreview(user, url);
      setPreviewState({ status: "ready", preview });
    } catch (error) {
      setPreviewState({
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
    setPreviewState({ status: "idle" });
    setShowSetup(false);
    setFollowStatus("idle");
    setSelectedFollowId(null);
    setWorkspaceState({ status: "loading" });
    try {
      const workspace = await fetchDiscoverWorkspace(user);
      if (requestId === workspaceRequestId.current) {
        setWorkspaceState({ status: "ready", workspace });
        setCandidateCounts(candidateCountsForWorkspace(workspace));
      }
    } catch {
      if (requestId === workspaceRequestId.current) {
        setWorkspaceState({ status: "error" });
      }
    }
  };

  const beginAnotherFollow = () => {
    setUrl("");
    setPreviewState({ status: "idle" });
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
        if (followId === null) {
          setCandidateCounts(candidateCountsForWorkspace(workspace));
        }
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
    setCandidateCounts((current) => {
      const next = { ...current };
      delete next[follow.id];
      return next;
    });
    setUnfollowingFollowId(null);
    setSelectedFollowId(nextSelectedFollowId);
    await reconcileWorkspace(nextSelectedFollowId);
  };

  const removeResolvedCandidate = (candidate: DiscoverCandidate) => {
    const matchingFollow =
      workspaceState.status === "ready"
        ? workspaceState.workspace.follows.find(
            (follow) =>
              follow.channel.externalId === candidate.video.channelExternalId,
          )
        : undefined;
    if (matchingFollow) {
      setCandidateCounts((current) => ({
        ...current,
        [matchingFollow.id]: Math.max(0, (current[matchingFollow.id] ?? 0) - 1),
      }));
    }
    setWorkspaceState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            workspace: {
              ...current.workspace,
              candidates: current.workspace.candidates.filter(
                (currentCandidate) => currentCandidate.id !== candidate.id,
              ),
            },
          }
        : current,
    );
  };
  const hasFollows =
    workspaceState.status === "ready" &&
    workspaceState.workspace.follows.length > 0;
  const setup = (
    <ChannelSetup
      url={url}
      previewState={previewState}
      followStatus={followStatus}
      onUrlChange={setUrl}
      onSubmit={submit}
      onFollow={(preview) => void follow(preview)}
    />
  );

  return (
    <section
      className="discover-surface mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-hidden"
      aria-labelledby="discover-heading"
    >
      <header className="shrink-0 space-y-1">
        <h1
          id="discover-heading"
          className="m-0 font-serif text-3xl leading-tight font-semibold tracking-tight"
        >
          Discover
        </h1>
        <p className="m-0 max-w-2xl text-sm text-muted-foreground">
          A calm intake of current videos from public YouTube channels you
          Follow.
        </p>
      </header>

      {showSetup && !hasFollows && setup}
      <Dialog
        open={showSetup && hasFollows}
        onOpenChange={(open) => {
          if (!open) setShowSetup(false);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Follow a public YouTube channel</DialogTitle>
            <DialogDescription>
              Preview recent videos before adding this channel to your combined
              intake.
            </DialogDescription>
          </DialogHeader>
          {setup}
        </DialogContent>
      </Dialog>
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
            candidateCounts={candidateCounts}
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

function ChannelSetup({
  url,
  previewState,
  followStatus,
  onUrlChange,
  onSubmit,
  onFollow,
}: {
  url: string;
  previewState: PreviewState;
  followStatus: "idle" | "loading" | "error";
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onFollow: (preview: DiscoverPreview) => void;
}) {
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 rounded-[var(--radius-panel)] border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field>
          <FieldLabel htmlFor="discover-channel-url">
            YouTube channel URL
          </FieldLabel>
          <Input
            id="discover-channel-url"
            type="url"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://youtube.com/@channel"
            autoComplete="url"
          />
          <FieldDescription>
            Use a channel ID or @handle URL. Playlists, videos, /user, and /c
            links are not supported.
          </FieldDescription>
        </Field>
        <Button type="submit" disabled={previewState.status === "loading"}>
          {previewState.status === "loading"
            ? "Resolving channel…"
            : "Preview channel"}
        </Button>
      </form>
      {previewState.status === "loading" && (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Resolving channel and gathering its latest videos…
        </p>
      )}
      {previewState.status === "error" && (
        <PreviewFailure failure={previewState.failure} />
      )}
      {previewState.status === "ready" && (
        <ChannelPreview
          preview={previewState.preview}
          followStatus={followStatus}
          onFollow={() => onFollow(previewState.preview)}
        />
      )}
      {followStatus === "error" && (
        <Alert className="p-4">
          This channel could not be followed. Try again.
        </Alert>
      )}
    </div>
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
            <VideoCardLayout key={video.externalId} video={video} />
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
  candidateCounts,
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
  candidateCounts: Record<DiscoverFollowId, number>;
  selectedFollowId: DiscoverFollowId | null;
  unfollowingFollowId: DiscoverFollowId | null;
  unfollowError: string | null;
  filtering: boolean;
  filterFailed: boolean;
  onFollowAnother: () => void;
  onSelectFollow: (followId: DiscoverFollowId | null) => void;
  onRetryFilter: () => void;
  onUnfollow: (follow: DiscoverFollow) => void;
  onCandidateResolved: (candidate: DiscoverCandidate) => void;
}) {
  const [managementOpen, setManagementOpen] = useState(false);
  const selectedFollow = workspace.follows.find(
    (follow) => follow.id === selectedFollowId,
  );
  const allCandidateCount = workspace.follows.reduce(
    (total, follow) => total + (candidateCounts[follow.id] ?? 0),
    0,
  );

  return (
    <section
      data-testid="discover-workspace"
      className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[19rem_minmax(0,1fr)] lg:grid-rows-1 lg:gap-5"
      aria-labelledby="candidate-queue-heading"
    >
      <aside
        aria-label="Follow management"
        className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-panel)] border bg-quiet-panel p-3 lg:h-full"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-1 pb-3">
          <div>
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Filter by Follow
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One combined queue by default
            </p>
          </div>
          <Button
            type="button"
            size="icon-compact"
            aria-label="Follow another"
            onClick={onFollowAnother}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <div
          data-testid="follow-filter-list"
          className="flex min-h-0 min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1"
        >
          <FollowFilterButton
            active={selectedFollowId === null}
            count={allCandidateCount}
            label="All Follows"
            meta="Everything that arrived"
            disabled={filtering}
            onClick={() => onSelectFollow(null)}
          />
          {workspace.follows.map((follow) => (
            <FollowFilterButton
              key={follow.id}
              active={selectedFollowId === follow.id}
              count={candidateCounts[follow.id] ?? 0}
              label={follow.channel.title}
              meta="Public channel · Active"
              disabled={filtering}
              onClick={() => onSelectFollow(follow.id)}
            />
          ))}
        </div>
        <Button
          type="button"
          className="mt-3 w-full justify-between"
          variant="quiet"
          aria-label="Manage Follows"
          onClick={() => setManagementOpen(true)}
        >
          <span className="flex items-center gap-2">
            <Settings2 aria-hidden="true" /> Manage Follows
          </span>
          <span className="rounded-full border px-2 py-0.5 text-xs">
            {workspace.follows.length}
          </span>
        </Button>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3 border-b pb-3">
          <div>
            <p className="m-0 text-xs font-semibold tracking-wider text-primary uppercase">
              Candidate intake
            </p>
            <h2
              id="candidate-queue-heading"
              className="mt-1 font-serif text-2xl font-semibold"
            >
              {selectedFollow?.channel.title ?? "All Follows"}
            </h2>
            <p className="m-0 text-sm text-muted-foreground">
              {workspace.candidates.length} to decide · Keep creates or links a
              Library Item
            </p>
          </div>
        </div>
        <div
          role="region"
          aria-label="Candidate feed"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-20"
        >
          {filtering && (
            <p role="status" className="mb-3 text-sm text-muted-foreground">
              Filtering pending Candidates…
            </p>
          )}
          {filterFailed && (
            <Alert className="mb-3 flex flex-wrap items-center justify-between gap-2 p-4">
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
          {unfollowError && <Alert className="mb-3 p-4">{unfollowError}</Alert>}
          {workspace.candidates.length === 0 ? (
            <p className="m-0 rounded-[var(--radius-panel)] border border-dashed bg-card p-8 text-center text-muted-foreground">
              No pending Candidates from your followed channels.
            </p>
          ) : (
            <div className="grid auto-rows-max gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {workspace.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  onResolved={() => onCandidateResolved(candidate)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={managementOpen} onOpenChange={setManagementOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Follows</DialogTitle>
            <DialogDescription>
              Review channel identity or stop future intake. Existing Library
              data is preserved.
            </DialogDescription>
          </DialogHeader>
          <ul
            aria-label="Followed channels"
            className="m-0 grid list-none gap-3 p-0"
          >
            {workspace.follows.map((follow) => (
              <li
                key={follow.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3"
              >
                <div className="min-w-0">
                  <a
                    className="block truncate font-medium hover:underline"
                    href={follow.channel.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {follow.channel.title}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    Public channel · Active
                  </p>
                </div>
                <Button
                  type="button"
                  size="compact"
                  variant="quiet-destructive"
                  loading={unfollowingFollowId === follow.id}
                  loadingLabel={`Unfollowing ${follow.channel.title}…`}
                  onClick={() => {
                    setManagementOpen(false);
                    onUnfollow(follow);
                  }}
                >
                  Unfollow {follow.channel.title}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FollowFilterButton({
  active,
  count,
  label,
  meta,
  disabled,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  meta: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="quiet"
      className={`h-auto min-w-60 justify-start rounded-lg border px-3 py-3 text-left transition-colors lg:w-full lg:min-w-0 ${
        active
          ? "border-primary/50 bg-accent text-accent-foreground"
          : "border-transparent bg-card hover:border-border hover:bg-accent/60"
      }`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex items-start gap-2">
        <Video
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {meta}
          </span>
        </span>
        <span className="rounded-full border px-2 py-0.5 text-xs">{count}</span>
      </span>
    </Button>
  );
}

function candidateCountsForWorkspace(
  workspace: DiscoverWorkspace,
): Record<DiscoverFollowId, number> {
  return Object.fromEntries(
    workspace.follows.map((follow) => [
      follow.id,
      workspace.candidates.filter(
        (candidate) =>
          candidate.video.channelExternalId === follow.channel.externalId,
      ).length,
    ]),
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

function VideoCardLayout({
  video,
  children,
  compact = false,
}: {
  video: DiscoverPreviewVideo;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <article
      aria-label={video.title}
      className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border bg-card"
    >
      {video.thumbnailUrl ? (
        <img
          className={
            compact
              ? "aspect-[16/6] w-full object-cover"
              : "aspect-video w-full object-cover"
          }
          src={video.thumbnailUrl}
          alt={video.title}
        />
      ) : (
        <div
          className={`grid place-items-center bg-muted text-muted-foreground ${compact ? "aspect-[16/6]" : "aspect-video"}`}
        >
          {compact ? (
            <Video className="size-8 opacity-50" aria-hidden="true" />
          ) : (
            <span className="text-sm">No thumbnail</span>
          )}
        </div>
      )}
      <div className={`flex flex-1 flex-col ${compact ? "p-3" : "p-4"}`}>
        {compact && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-primary/40 bg-accent px-2 py-0.5 text-accent-foreground">
              new
            </span>
            <span className="truncate">{video.channelTitle}</span>
          </div>
        )}
        <a
          className={
            compact
              ? "line-clamp-2 min-h-10 text-sm leading-snug font-semibold hover:underline"
              : "font-serif text-lg font-semibold hover:underline"
          }
          href={video.source}
          target="_blank"
          rel="noreferrer"
        >
          {video.title}
        </a>
        {!compact && (
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            {video.channelTitle}
          </p>
        )}
        <p
          className={`m-0 flex flex-wrap gap-x-2 text-xs text-muted-foreground ${compact ? "mt-1" : "mt-2"}`}
        >
          <time dateTime={video.publishedAt}>
            {formatPublishedAt(video.publishedAt)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(video.durationSeconds)}</span>
        </p>
        <div className={compact ? "mt-auto pt-3" : "mt-3"}>{children}</div>
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
    <VideoCardLayout video={video} compact>
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
          variant="quiet"
          aria-label={
            candidateActionState === "rejecting"
              ? `Rejecting ${video.title}…`
              : `Reject ${video.title}`
          }
          loading={candidateActionState === "rejecting"}
          loadingLabel="Rejecting…"
          onClick={() => void reject()}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="compact"
          aria-label={`Keep ${video.title}`}
          onClick={() => {
            setCandidateActionState("idle");
            setKeepOpen(true);
          }}
        >
          Keep
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
              <FieldLabel htmlFor={`keep-type-${candidate.id}`}>
                Type
              </FieldLabel>
              <Select
                value={type}
                disabled={candidateActionState === "keeping"}
                onValueChange={(value) => setType(value as Type)}
              >
                <SelectTrigger
                  id={`keep-type-${candidate.id}`}
                  aria-label="Type"
                >
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
