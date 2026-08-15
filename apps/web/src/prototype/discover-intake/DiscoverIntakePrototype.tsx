import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CirclePause,
  Clock3,
  History,
  Library,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// Three Discover-room compositions, switchable via ?variant=, on a throwaway route.

type DiscoveryState = "new" | "seen" | "kept" | "dismissed";
type FollowState = "active" | "paused" | "failed" | "authorization-expired";
type StressFrame =
  "representative" | "loading" | "empty" | "partial" | "expired";
type VariantKey = "A" | "B" | "C";

interface Discovery {
  id: string;
  title: string;
  publisher: string;
  followId: string;
  published: string;
  duration: string;
  state: DiscoveryState;
  type: "video" | "playlist";
  history?: string;
  alreadyInLibrary?: boolean;
}

interface Follow {
  id: string;
  name: string;
  detail: string;
  targetKind: "Public channel" | "Recurring search" | "Private playlist";
  state: FollowState;
  newCount: number;
  lastChecked: string;
}

interface PrototypeState {
  discoveries: Discovery[];
  follows: Follow[];
  selectedIds: string[];
  events: string[];
}

const variants: { key: VariantKey; name: string }[] = [
  { key: "A", name: "Filter rail + deck" },
  { key: "B", name: "Queue + focus" },
  { key: "C", name: "Follow sessions" },
];

const initialFollows: Follow[] = [
  {
    id: "jack",
    name: "Jack Herrington",
    detail: "youtube.com/@jherr",
    targetKind: "Public channel",
    state: "active",
    newCount: 3,
    lastChecked: "Just now",
  },
  {
    id: "rsc-search",
    name: "React Server Components",
    detail: "Query · newest first · videos only",
    targetKind: "Recurring search",
    state: "active",
    newCount: 2,
    lastChecked: "Just now",
  },
  {
    id: "bytebytego",
    name: "ByteByteGo",
    detail: "youtube.com/@ByteByteGo",
    targetKind: "Public channel",
    state: "failed",
    newCount: 1,
    lastChecked: "Partial result · 10:42",
  },
  {
    id: "mit",
    name: "MIT OpenCourseWare",
    detail: "youtube.com/@mitocw",
    targetKind: "Public channel",
    state: "paused",
    newCount: 0,
    lastChecked: "Paused 9 Aug",
  },
  {
    id: "private-playlist",
    name: "Private systems queue",
    detail: "Credentialed YouTube playlist",
    targetKind: "Private playlist",
    state: "authorization-expired",
    newCount: 0,
    lastChecked: "Authorization expired",
  },
];

const initialDiscoveries: Discovery[] = [
  {
    id: "react-compiler",
    title: "React Compiler in practice",
    publisher: "Jack Herrington",
    followId: "jack",
    published: "Today · 09:18",
    duration: "18 min",
    state: "new",
    type: "video",
  },
  {
    id: "dns",
    title: "How DNS works",
    publisher: "ByteByteGo",
    followId: "bytebytego",
    published: "Today · 08:02",
    duration: "9 min",
    state: "new",
    type: "video",
    alreadyInLibrary: true,
    history: "Captured manually on 2 Aug",
  },
  {
    id: "rsc-cache",
    title: "Caching data with React Server Components",
    publisher: "Lee Robinson",
    followId: "rsc-search",
    published: "Yesterday",
    duration: "12 min",
    state: "new",
    type: "video",
  },
  {
    id: "distributed",
    title: "Distributed Systems lecture 1",
    publisher: "MIT OpenCourseWare",
    followId: "mit",
    published: "Yesterday",
    duration: "49 min",
    state: "new",
    type: "video",
    history: "Previously dismissed · 18 Jul",
  },
  {
    id: "rsc-security",
    title: "RSC security: what actually crosses the wire",
    publisher: "Theo Browne",
    followId: "rsc-search",
    published: "13 Aug",
    duration: "22 min",
    state: "new",
    type: "video",
  },
  {
    id: "react-19",
    title: "React 19 patterns I would use again",
    publisher: "Jack Herrington",
    followId: "jack",
    published: "12 Aug",
    duration: "16 min",
    state: "seen",
    type: "video",
  },
  {
    id: "frontend-architecture",
    title: "Frontend architecture after the honeymoon",
    publisher: "Jack Herrington",
    followId: "jack",
    published: "8 Aug",
    duration: "24 min",
    state: "kept",
    type: "video",
    history: "Kept to Library · 9 Aug",
  },
  {
    id: "system-design",
    title: "System design interview traps",
    publisher: "ByteByteGo",
    followId: "bytebytego",
    published: "6 Aug",
    duration: "11 min",
    state: "dismissed",
    type: "video",
    history: "Dismissed · 7 Aug",
  },
];

function createInitialState(): PrototypeState {
  return {
    discoveries: structuredClone(initialDiscoveries),
    follows: structuredClone(initialFollows),
    selectedIds: [],
    events: ["Application opened · active Follows refreshed"],
  };
}

export function DiscoverIntakePrototype() {
  const [state, setState] = useState(createInitialState);
  const [frame, setFrame] = useState<StressFrame>("representative");
  const [setupOpen, setSetupOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFollowId, setActiveFollowId] = useState("all");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [searchParams] = useSearchParams();
  const variant = normalizeVariant(searchParams.get("variant"));

  const visibleDiscoveries = useMemo(() => {
    const discoveries =
      frame === "empty"
        ? state.discoveries.filter(
            (discovery) =>
              discovery.state === "kept" || discovery.state === "dismissed",
          )
        : state.discoveries;
    return activeFollowId === "all"
      ? discoveries
      : discoveries.filter(
          (discovery) => discovery.followId === activeFollowId,
        );
  }, [activeFollowId, frame, state.discoveries]);

  const actions = {
    setDiscovery(id: string, next: DiscoveryState) {
      setState((current) => ({
        ...current,
        discoveries: current.discoveries.map((discovery) =>
          discovery.id === id ? { ...discovery, state: next } : discovery,
        ),
        selectedIds: current.selectedIds.filter((selected) => selected !== id),
        events: [`${nextLabel(next)} · ${id}`, ...current.events].slice(0, 8),
      }));
    },
    toggleSelected(id: string) {
      setState((current) => ({
        ...current,
        selectedIds: current.selectedIds.includes(id)
          ? current.selectedIds.filter((selected) => selected !== id)
          : [...current.selectedIds, id],
      }));
    },
    bulk(next: "seen" | "dismissed", discoveryIds?: string[]) {
      setState((current) => {
        const targets =
          discoveryIds ??
          (current.selectedIds.length > 0
            ? current.selectedIds
            : current.discoveries
                .filter((discovery) => discovery.state === "new")
                .map((discovery) => discovery.id));
        return {
          ...current,
          discoveries: current.discoveries.map((discovery) =>
            targets.includes(discovery.id)
              ? { ...discovery, state: next }
              : discovery,
          ),
          selectedIds: [],
          events: [
            `${next === "seen" ? "Acknowledged" : "Dismissed"} ${targets.length} Discoveries`,
            ...current.events,
          ].slice(0, 8),
        };
      });
    },
    toggleFollow(id: string) {
      setState((current) => ({
        ...current,
        follows: current.follows.map((follow) =>
          follow.id === id
            ? {
                ...follow,
                state: follow.state === "paused" ? "active" : "paused",
                lastChecked:
                  follow.state === "paused"
                    ? "Resumed · checks current results"
                    : "Paused now",
              }
            : follow,
        ),
        events: [`Changed Follow lifecycle · ${id}`, ...current.events].slice(
          0,
          8,
        ),
      }));
    },
    removeFollow(id: string) {
      setState((current) => ({
        ...current,
        follows: current.follows.filter((follow) => follow.id !== id),
        events: [
          `Removed Follow · ${id} · existing Discoveries preserved`,
          ...current.events,
        ].slice(0, 8),
      }));
    },
    reconnect(id: string) {
      setState((current) => ({
        ...current,
        follows: current.follows.map((follow) =>
          follow.id === id
            ? {
                ...follow,
                state: "active",
                lastChecked: "Reconnected · just now",
              }
            : follow,
        ),
        events: [`Reauthorized Follow · ${id}`, ...current.events].slice(0, 8),
      }));
    },
  };

  function refresh() {
    setRefreshing(true);
    setState((current) => ({
      ...current,
      events: ["Manual refresh started", ...current.events].slice(0, 8),
    }));
    window.setTimeout(() => {
      setRefreshing(false);
      setState((current) => ({
        ...current,
        events: [
          "Manual refresh finished · 4 succeeded · 1 partial",
          ...current.events,
        ].slice(0, 8),
      }));
    }, 700);
  }

  const shared = {
    state,
    discoveries: visibleDiscoveries,
    frame,
    refreshing,
    actions,
    onRefresh: refresh,
    onSetup: () => setSetupOpen(true),
    onHealth: () => setHealthOpen(true),
    onHistory: () => setHistoryOpen(true),
    activeFollowId,
    reviewIndex,
    onFollowFilter: (followId: string) => {
      setActiveFollowId(followId);
      setReviewIndex(0);
    },
    onReviewIndex: setReviewIndex,
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <PrototypeTopBar />
      <StressBar
        frame={frame}
        onFrame={setFrame}
        onReset={() => {
          setState(createInitialState());
          setFrame("representative");
          setActiveFollowId("all");
          setReviewIndex(0);
        }}
      />
      {variant === "A" && <IntakeFirst {...shared} />}
      {variant === "B" && <FollowsAndIntake {...shared} />}
      {variant === "C" && <ReviewBatches {...shared} />}

      <FollowHealthDialog
        actions={actions}
        follows={state.follows}
        open={healthOpen}
        onOpenChange={setHealthOpen}
      />
      <HistoryDialog
        discoveries={state.discoveries}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
      <SetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onConfirm={(follow) => {
          setState((current) => ({
            ...current,
            follows: [follow, ...current.follows],
            events: [
              `Confirmed Follow · one-month preview accepted`,
              ...current.events,
            ].slice(0, 8),
          }));
          setSetupOpen(false);
        }}
      />
      <StateLens
        open={stateOpen}
        onOpenChange={setStateOpen}
        state={{ ...state, frame, activeFollowId, reviewIndex }}
      />
      <PrototypeSwitcher current={variant} />
    </div>
  );
}

interface VariantProps {
  state: PrototypeState;
  discoveries: Discovery[];
  frame: StressFrame;
  refreshing: boolean;
  actions: {
    setDiscovery: (id: string, next: DiscoveryState) => void;
    toggleSelected: (id: string) => void;
    bulk: (next: "seen" | "dismissed", discoveryIds?: string[]) => void;
    toggleFollow: (id: string) => void;
    removeFollow: (id: string) => void;
    reconnect: (id: string) => void;
  };
  onRefresh: () => void;
  onSetup: () => void;
  onHealth: () => void;
  onHistory: () => void;
  activeFollowId: string;
  reviewIndex: number;
  onFollowFilter: (followId: string) => void;
  onReviewIndex: (index: number) => void;
}

function IntakeFirst(props: VariantProps) {
  const unresolved = unresolvedDiscoveries(props.discoveries);
  const current = currentDiscovery(unresolved, props.reviewIndex);
  return (
    <main className="mx-auto max-w-[78rem] px-4 py-7 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Variant A · Filter rail + deck
          </p>
          <h1 className="font-serif text-4xl">Discover</h1>
          <p className="mt-2 text-muted-foreground">
            Every Follow lands in one queue. Filter only when you want to narrow
            it.
          </p>
        </div>
        <RefreshAndHistory {...props} />
      </header>
      <StatusFrame frame={props.frame} follows={props.state.follows} />
      <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <FollowFilterRail {...props} />
        <section className="min-w-0">
          <QueueHeading props={props} unresolved={unresolved} />
          {props.frame === "loading" || props.refreshing ? (
            <LoadingFeed />
          ) : current ? (
            <CandidateFocusCard
              discovery={current}
              position={reviewPosition(unresolved, props.reviewIndex)}
              total={unresolved.length}
              actions={props.actions}
              onPrevious={() => moveReview(props, unresolved, -1)}
              onNext={() => moveReview(props, unresolved, 1)}
            />
          ) : (
            <FilteredEmptyState props={props} />
          )}
          <FilteredBulkBar props={props} unresolved={unresolved} />
        </section>
      </div>
    </main>
  );
}

function FollowsAndIntake(props: VariantProps) {
  const unresolved = unresolvedDiscoveries(props.discoveries);
  const current = currentDiscovery(unresolved, props.reviewIndex);
  return (
    <main className="mx-auto max-w-[80rem] px-4 py-7 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Variant B · Queue + focus
          </p>
          <h1 className="font-serif text-4xl">Discover</h1>
          <p className="mt-2 text-muted-foreground">
            Pick a Follow on the left, scan its queue, then decide one Discovery
            in focus.
          </p>
        </div>
        <RefreshAndHistory {...props} />
      </header>
      <StatusFrame frame={props.frame} follows={props.state.follows} />
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <FollowFilterRail {...props} dense />
        <section className="min-w-0">
          <QueueHeading props={props} unresolved={unresolved} />
          {props.frame === "loading" || props.refreshing ? (
            <LoadingFeed />
          ) : current ? (
            <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
              <CandidateQueue
                discoveries={unresolved}
                currentId={current.id}
                onSelect={(index) => props.onReviewIndex(index)}
              />
              <CandidateFocusCard
                discovery={current}
                position={reviewPosition(unresolved, props.reviewIndex)}
                total={unresolved.length}
                actions={props.actions}
                compact
                onPrevious={() => moveReview(props, unresolved, -1)}
                onNext={() => moveReview(props, unresolved, 1)}
              />
            </div>
          ) : (
            <FilteredEmptyState props={props} />
          )}
          <div className="mt-4 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
            The list is only the current intake queue—not the Library. Keep
            resolves one Discovery into an Item; Dismiss removes it from this
            queue while preserving history.
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewBatches(props: VariantProps) {
  const unresolved = unresolvedDiscoveries(props.discoveries);
  const current = currentDiscovery(unresolved, props.reviewIndex);
  const selectedFollow = props.state.follows.find(
    (follow) => follow.id === props.activeFollowId,
  );
  return (
    <main className="mx-auto max-w-[78rem] px-4 py-7 md:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Variant C · Follow sessions
          </p>
          <h1 className="font-serif text-4xl">Discover</h1>
          <p className="mt-2 text-muted-foreground">
            All Follows still combine by default; choosing one turns the same
            queue into a bounded review session.
          </p>
        </div>
        <RefreshAndHistory {...props} />
      </header>
      <StatusFrame frame={props.frame} follows={props.state.follows} />
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <FollowFilterRail {...props} sessionStyle />
        <section className="min-w-0 overflow-hidden rounded-2xl bg-quiet-panel p-4 md:p-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {selectedFollow ? "Reviewing one Follow" : "Combined review"}
              </p>
              <h2 className="mt-1 font-serif text-3xl">
                {selectedFollow?.name ?? "Everything that arrived"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {unresolved.length} unresolved Discoveries in this session
              </p>
            </div>
            <FilteredBulkMenu props={props} unresolved={unresolved} />
          </div>
          {props.frame === "loading" || props.refreshing ? (
            <LoadingFeed />
          ) : current ? (
            <div className="relative mx-auto max-w-3xl pb-7">
              <div className="absolute inset-x-8 top-5 bottom-2 rounded-2xl border bg-card/40" />
              <div className="absolute inset-x-4 top-2 bottom-4 rounded-2xl border bg-card/70" />
              <div className="relative">
                <CandidateFocusCard
                  discovery={current}
                  position={reviewPosition(unresolved, props.reviewIndex)}
                  total={unresolved.length}
                  actions={props.actions}
                  onPrevious={() => moveReview(props, unresolved, -1)}
                  onNext={() => moveReview(props, unresolved, 1)}
                />
              </div>
            </div>
          ) : (
            <FilteredEmptyState props={props} />
          )}
        </section>
      </div>
    </main>
  );
}

function FollowFilterRail({
  dense = false,
  sessionStyle = false,
  ...props
}: VariantProps & { dense?: boolean; sessionStyle?: boolean }) {
  const allCount = unresolvedDiscoveries(props.state.discoveries).length;
  return (
    <aside
      className={`h-fit rounded-xl border p-3 lg:sticky lg:top-24 ${sessionStyle ? "bg-card" : "bg-quiet-panel"}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filter by Follow
          </p>
          {!dense && (
            <p className="mt-1 text-sm text-muted-foreground">
              One combined queue by default
            </p>
          )}
        </div>
        <Button
          size="icon-compact"
          onClick={props.onSetup}
          aria-label="New Follow"
        >
          <Plus />
        </Button>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
        <FollowFilterButton
          active={props.activeFollowId === "all"}
          count={allCount}
          label="All Follows"
          meta="Everything that arrived"
          onClick={() => props.onFollowFilter("all")}
        />
        {props.state.follows.map((follow) => (
          <FollowFilterButton
            active={props.activeFollowId === follow.id}
            count={
              unresolvedDiscoveries(props.state.discoveries).filter(
                (discovery) => discovery.followId === follow.id,
              ).length
            }
            followState={follow.state}
            key={follow.id}
            label={follow.name}
            meta={follow.targetKind}
            onClick={() => props.onFollowFilter(follow.id)}
          />
        ))}
      </div>
      <Button
        className="mt-3 w-full justify-between"
        variant="quiet"
        onClick={props.onHealth}
      >
        <span className="flex items-center gap-2">
          <Settings2 /> Manage Follow health
        </span>
        <Badge
          variant={
            props.state.follows.some(
              (follow) =>
                follow.state === "failed" ||
                follow.state === "authorization-expired",
            )
              ? "past"
              : "neutral"
          }
        >
          {
            props.state.follows.filter(
              (follow) =>
                follow.state === "failed" ||
                follow.state === "authorization-expired",
            ).length
          }
        </Badge>
      </Button>
    </aside>
  );
}

function FollowFilterButton({
  active,
  count,
  followState,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  count: number;
  followState?: FollowState;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-w-60 rounded-lg border px-3 py-3 text-left transition-colors lg:w-full lg:min-w-0 ${
        active
          ? "border-primary/50 bg-accent text-accent-foreground"
          : "border-transparent bg-card hover:border-border hover:bg-accent/60"
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="flex items-start gap-2">
        <Video className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {meta}
          </span>
          {followState && (
            <span
              className={`mt-1 flex items-center gap-1 text-xs ${
                followState === "failed" ||
                followState === "authorization-expired"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {followState === "active" ? (
                <Check className="size-3" />
              ) : followState === "paused" ? (
                <CirclePause className="size-3" />
              ) : (
                <AlertCircle className="size-3" />
              )}
              {followStateLabel(followState)}
            </span>
          )}
        </span>
        <Badge variant={active ? "current" : "neutral"}>{count}</Badge>
      </span>
    </button>
  );
}

function QueueHeading({
  props,
  unresolved,
}: {
  props: VariantProps;
  unresolved: Discovery[];
}) {
  const follow = props.state.follows.find(
    (candidate) => candidate.id === props.activeFollowId,
  );
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Candidate intake
        </p>
        <h2 className="mt-1 font-serif text-2xl">
          {follow ? follow.name : "All Follows"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {unresolved.length} unresolved · one Discovery at a time
        </p>
      </div>
      <FilteredBulkMenu props={props} unresolved={unresolved} />
    </div>
  );
}

function CandidateFocusCard({
  actions,
  compact = false,
  discovery,
  onNext,
  onPrevious,
  position,
  total,
}: {
  actions: VariantProps["actions"];
  compact?: boolean;
  discovery: Discovery;
  onNext: () => void;
  onPrevious: () => void;
  position: number;
  total: number;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div
        className={`grid place-items-center bg-muted ${compact ? "aspect-[16/7]" : "aspect-video"}`}
      >
        <Video className="size-16 text-muted-foreground/50" />
      </div>
      <div className={compact ? "p-5" : "p-5 md:p-7"}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={discovery.state === "new" ? "current" : "neutral"}>
              {discovery.state}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {position} of {total}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon-compact"
              variant="quiet"
              onClick={onPrevious}
              aria-label="Previous Discovery"
            >
              <ArrowLeft />
            </Button>
            <Button
              size="icon-compact"
              variant="quiet"
              onClick={onNext}
              aria-label="Next Discovery"
            >
              <ArrowRight />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {discovery.publisher} · {discovery.published} · {discovery.duration}
        </p>
        <h3 className="mt-2 font-serif text-3xl leading-tight">
          {discovery.title}
        </h3>
        <DiscoveryHistory discovery={discovery} />
        <div className="mt-7 grid gap-2 sm:grid-cols-3">
          <Button
            variant="secondary"
            onClick={() => actions.setDiscovery(discovery.id, "dismissed")}
          >
            Dismiss
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              actions.setDiscovery(discovery.id, "seen");
              onNext();
            }}
          >
            Seen, decide later
          </Button>
          <Button
            onClick={() => actions.setDiscovery(discovery.id, "kept")}
            disabled={discovery.alreadyInLibrary}
          >
            <Library />
            {discovery.alreadyInLibrary ? "Already in Library" : "Keep"}
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Use the arrows like a swipe. The active Follow filter stays in place.
        </p>
      </div>
    </article>
  );
}

function CandidateQueue({
  currentId,
  discoveries,
  onSelect,
}: {
  currentId: string;
  discoveries: Discovery[];
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="max-h-[40rem] overflow-y-auto rounded-xl border bg-quiet-panel p-2">
      <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Queue
      </p>
      <div className="space-y-1">
        {discoveries.map((discovery, index) => (
          <button
            className={`w-full rounded-lg px-3 py-3 text-left ${
              discovery.id === currentId
                ? "bg-accent text-accent-foreground"
                : "hover:bg-card"
            }`}
            key={discovery.id}
            onClick={() => onSelect(index)}
          >
            <span className="block line-clamp-2 text-sm font-semibold">
              {discovery.title}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {discovery.publisher} · {discovery.state}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function FilteredBulkMenu({
  props,
  unresolved,
}: {
  props: VariantProps;
  unresolved: Discovery[];
}) {
  const ids = unresolved.map((discovery) => discovery.id);
  return (
    <div className="flex flex-wrap gap-1">
      <Button
        size="compact"
        variant="quiet"
        disabled={ids.length === 0}
        onClick={() => props.actions.bulk("seen", ids)}
      >
        <Check /> Acknowledge {ids.length}
      </Button>
      <Button
        size="compact"
        variant="quiet"
        disabled={ids.length === 0}
        onClick={() => props.actions.bulk("dismissed", ids)}
      >
        Dismiss {ids.length}
      </Button>
    </div>
  );
}

function FilteredBulkBar({
  props,
  unresolved,
}: {
  props: VariantProps;
  unresolved: Discovery[];
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border bg-quiet-panel px-4 py-3 text-sm">
      <span className="mr-auto text-muted-foreground">
        Clear only the current{" "}
        {props.activeFollowId === "all" ? "combined" : "filtered"} queue
      </span>
      <FilteredBulkMenu props={props} unresolved={unresolved} />
    </div>
  );
}

function FilteredEmptyState({ props }: { props: VariantProps }) {
  const filtered = props.activeFollowId !== "all";
  return (
    <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed bg-card p-8 text-center">
      <div>
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent">
          <Check />
        </span>
        <h2 className="font-serif text-2xl">
          {filtered ? "This Follow is clear" : "Discover is clear"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          {filtered
            ? "No unresolved Discoveries from this Follow. The combined queue may still have arrivals from others."
            : "No new or seen Discoveries are waiting. Resolved history remains available."}
        </p>
        {filtered ? (
          <Button
            className="mt-5"
            variant="secondary"
            onClick={() => props.onFollowFilter("all")}
          >
            Show all Follows
          </Button>
        ) : (
          <Button className="mt-5" variant="secondary" onClick={props.onSetup}>
            <Plus /> New Follow
          </Button>
        )}
      </div>
    </div>
  );
}

function unresolvedDiscoveries(discoveries: Discovery[]) {
  return discoveries.filter(
    (discovery) => discovery.state === "new" || discovery.state === "seen",
  );
}

function currentDiscovery(discoveries: Discovery[], reviewIndex: number) {
  if (discoveries.length === 0) return undefined;
  return discoveries[reviewIndex % discoveries.length];
}

function reviewPosition(discoveries: Discovery[], reviewIndex: number) {
  return discoveries.length === 0 ? 0 : (reviewIndex % discoveries.length) + 1;
}

function moveReview(
  props: VariantProps,
  discoveries: Discovery[],
  delta: number,
) {
  if (discoveries.length === 0) return;
  props.onReviewIndex(
    (props.reviewIndex + delta + discoveries.length) % discoveries.length,
  );
}

function followStateLabel(state: FollowState) {
  if (state === "authorization-expired") return "Authorization expired";
  if (state === "failed") return "Partial failure";
  if (state === "paused") return "Paused";
  return "Active";
}

function PrototypeTopBar() {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex min-h-16 max-w-[80rem] flex-wrap items-center gap-3 px-4 py-2 md:px-6">
        <span className="font-serif text-xl font-semibold">unshelf</span>
        <nav
          className="order-3 flex w-full gap-1 overflow-x-auto border-t pt-2 text-sm md:order-none md:w-auto md:border-0 md:pt-0"
          aria-label="Rooms"
        >
          {["Today", "Discover", "Library", "Plans"].map((room) => (
            <button
              key={room}
              className={`h-10 rounded-md px-3 font-medium ${room === "Discover" ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
              aria-current={room === "Discover" ? "page" : undefined}
            >
              {room}
            </button>
          ))}
        </nav>
        <Button className="ml-auto">
          <Plus /> <span className="hidden sm:inline">Capture</span>
        </Button>
        <span className="grid size-10 place-items-center rounded-full bg-secondary font-medium">
          RG
        </span>
      </div>
    </header>
  );
}

function StressBar({
  frame,
  onFrame,
  onReset,
}: {
  frame: StressFrame;
  onFrame: (frame: StressFrame) => void;
  onReset: () => void;
}) {
  return (
    <div className="border-b bg-quiet-panel">
      <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-2 px-4 py-2 text-sm md:px-6">
        <span className="font-semibold">Stress frame</span>
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={frame}
          onChange={(event) => onFrame(event.target.value as StressFrame)}
          aria-label="Stress frame"
        >
          <option value="representative">Representative corpus</option>
          <option value="loading">Loading refresh</option>
          <option value="empty">No unresolved Discoveries</option>
          <option value="partial">Partial Provider failure</option>
          <option value="expired">Expired authorization</option>
        </select>
        <Button size="compact" variant="quiet" onClick={onReset}>
          <RotateCcw /> Reset corpus
        </Button>
        <span className="ml-auto hidden text-muted-foreground md:inline">
          PROTOTYPE · in-memory only
        </span>
      </div>
    </div>
  );
}

function StatusFrame({
  frame,
  follows,
}: {
  frame: StressFrame;
  follows: Follow[];
}) {
  const failed = follows.find((follow) => follow.state === "failed");
  const expired = follows.find(
    (follow) => follow.state === "authorization-expired",
  );
  if (frame === "partial" && failed) {
    return (
      <Alert className="mb-6">
        <AlertCircle />
        <AlertTitle>Refresh partly completed</AlertTitle>
        <AlertDescription>
          {failed.name} returned only part of its results. Other Follows are
          current; retry just this Follow or review what arrived.
        </AlertDescription>
      </Alert>
    );
  }
  if (frame === "expired" && expired) {
    return (
      <Alert className="mb-6">
        <AlertCircle />
        <AlertTitle>Authorization expired</AlertTitle>
        <AlertDescription>
          {expired.name} is not refreshing. Existing Discoveries and history are
          safe; reconnect to resume current results without backfilling the gap.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function RefreshAndHistory(props: VariantProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={props.onHistory}>
        <History /> History
      </Button>
      <Button
        variant="secondary"
        onClick={props.onRefresh}
        disabled={props.refreshing}
      >
        <RefreshCw className={props.refreshing ? "animate-spin" : ""} />{" "}
        {props.refreshing ? "Refreshing" : "Refresh"}
      </Button>
    </div>
  );
}

function DiscoveryHistory({ discovery }: { discovery: Discovery }) {
  if (!discovery.history && !discovery.alreadyInLibrary) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary">
      {discovery.alreadyInLibrary ? (
        <Library className="size-4" />
      ) : (
        <History className="size-4" />
      )}
      {discovery.alreadyInLibrary ? "Already in Library" : discovery.history}
      {discovery.alreadyInLibrary && discovery.history
        ? ` · ${discovery.history}`
        : ""}
    </p>
  );
}

function FollowList({
  follows,
  actions,
  compact = false,
}: {
  follows: Follow[];
  actions: VariantProps["actions"];
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      {follows.map((follow) => (
        <div className="rounded-lg border bg-card p-3" key={follow.id}>
          <div className="flex items-start gap-2">
            <Video className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{follow.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {follow.targetKind} · {follow.lastChecked}
              </p>
            </div>
            {follow.newCount > 0 && (
              <Badge variant="neutral">{follow.newCount}</Badge>
            )}
          </div>
          <FollowStateBadge state={follow.state} />
          {!compact && (
            <p className="mt-2 text-sm text-muted-foreground">
              {follow.detail}
            </p>
          )}
          <div className="mt-2 flex gap-1">
            {follow.state === "authorization-expired" ? (
              <Button
                size="compact"
                variant="secondary"
                onClick={() => actions.reconnect(follow.id)}
              >
                Reconnect
              </Button>
            ) : (
              <Button
                size="compact"
                variant="quiet"
                onClick={() => actions.toggleFollow(follow.id)}
              >
                {follow.state === "paused" ? <Play /> : <Pause />}
                {follow.state === "paused" ? "Resume" : "Pause"}
              </Button>
            )}
            <Button
              size="icon-compact"
              variant="quiet"
              onClick={() => actions.removeFollow(follow.id)}
              aria-label={`Remove ${follow.name}`}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FollowStateBadge({ state }: { state: FollowState }) {
  const labels: Record<FollowState, string> = {
    active: "Active",
    paused: "Paused",
    failed: "Partial failure",
    "authorization-expired": "Authorization expired",
  };
  return (
    <p
      className={`mt-2 flex items-center gap-1 text-xs ${state === "failed" || state === "authorization-expired" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {state === "active" ? (
        <Check className="size-3" />
      ) : state === "paused" ? (
        <CirclePause className="size-3" />
      ) : (
        <AlertCircle className="size-3" />
      )}
      {labels[state]}
    </p>
  );
}

function FollowHealthDialog({
  follows,
  actions,
  open,
  onOpenChange,
}: {
  follows: Follow[];
  actions: VariantProps["actions"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Follow health
          </DialogTitle>
          <DialogDescription>
            Pause or remove future discovery without resolving existing
            Discoveries or deleting history.
          </DialogDescription>
        </DialogHeader>
        <FollowList follows={follows} actions={actions} />
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  discoveries,
  open,
  onOpenChange,
}: {
  discoveries: Discovery[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const history = discoveries.filter(
    (item) => item.state === "kept" || item.state === "dismissed",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Discovery history
          </DialogTitle>
          <DialogDescription>
            Resolved intake remains durable provenance, separate from the
            Library.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {history.map((item) => (
            <div
              className="flex items-center gap-3 rounded-lg border p-3"
              key={item.id}
            >
              <Badge variant="neutral">{item.state}</Badge>
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.history}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SetupDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (follow: Follow) => void;
}) {
  const [mode, setMode] = useState<"public" | "credentialed">("public");
  const [target, setTarget] = useState("https://youtube.com/@Fireship");
  const [previewed, setPreviewed] = useState(false);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!open) {
      setPreviewed(false);
      setConnected(false);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Create a Follow
          </DialogTitle>
          <DialogDescription>
            Provider-specific setup; Unshelf previews a bounded one-month
            lookback before anything is confirmed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            variant={mode === "public" ? "primary" : "quiet"}
            onClick={() => {
              setMode("public");
              setTarget("https://youtube.com/@Fireship");
              setPreviewed(false);
            }}
          >
            Public target
          </Button>
          <Button
            variant={mode === "credentialed" ? "primary" : "quiet"}
            onClick={() => {
              setMode("credentialed");
              setTarget("Private systems queue");
              setPreviewed(false);
            }}
          >
            Credentialed target
          </Button>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {mode === "public"
              ? "YouTube channel or recurring search"
              : "Private playlist"}
          </label>
          <Input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </div>
        {mode === "credentialed" && !connected && (
          <Alert>
            <AlertCircle />
            <AlertTitle>YouTube authorization required</AlertTitle>
            <AlertDescription>
              Connect read-only access to inspect the private target. Unshelf
              stores the Follow, not your playlist content.
            </AlertDescription>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => setConnected(true)}
            >
              Connect YouTube
            </Button>
          </Alert>
        )}
        {(mode === "public" || connected) && (
          <Button variant="secondary" onClick={() => setPreviewed(true)}>
            <Search /> Preview the last month
          </Button>
        )}
        {previewed && (
          <div className="rounded-xl border bg-quiet-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-semibold">One-month setup preview</p>
                <p className="text-sm text-muted-foreground">
                  15 Jul–15 Aug · 6 likely Discoveries
                </p>
              </div>
              <Badge>Preview only</Badge>
            </div>
            <div className="space-y-2">
              {[
                "The cost of clever abstractions",
                "Web performance in 100 seconds",
                "Why every app becomes a database",
              ].map((title) => (
                <div
                  className="flex items-center gap-2 rounded-md bg-card p-2 text-sm"
                  key={title}
                >
                  <Video className="size-4 text-primary" />
                  <span>{title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    video
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Confirming creates one independent Follow. These results enter
              Discover as new; nothing enters the Library automatically.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!previewed}
            onClick={() =>
              onConfirm({
                id: `follow-${Date.now()}`,
                name: mode === "public" ? "Fireship" : "Private systems queue",
                detail: target,
                targetKind:
                  mode === "public" ? "Public channel" : "Private playlist",
                state: "active",
                newCount: 6,
                lastChecked: "Preview confirmed · just now",
              })
            }
          >
            Confirm Follow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingFeed() {
  return (
    <div className="space-y-3" aria-label="Loading Discoveries">
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <LoaderCircle className="animate-spin" /> Checking active Follows…
      </div>
      {[1, 2, 3].map((key) => (
        <div className="rounded-xl border bg-card p-5" key={key}>
          <Skeleton className="mb-3 h-4 w-40" />
          <Skeleton className="mb-2 h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function StateLens({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: object;
}) {
  return (
    <>
      <Button
        className="fixed bottom-5 right-4 z-50 shadow-lg md:right-6"
        variant="secondary"
        onClick={() => onOpenChange(!open)}
      >
        <Clock3 /> State lens
      </Button>
      {open && (
        <aside className="fixed inset-x-4 bottom-20 z-50 max-h-[60vh] overflow-auto rounded-xl border bg-popover p-4 shadow-2xl md:left-auto md:right-6 md:w-[32rem]">
          <div className="mb-3 flex items-center justify-between">
            <strong>Full prototype state</strong>
            <Button
              size="compact"
              variant="quiet"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-xs">
            {JSON.stringify(state, null, 2)}
          </pre>
        </aside>
      )}
    </>
  );
}

function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const [, setSearchParams] = useSearchParams();
  const index = variants.findIndex((variant) => variant.key === current);
  function move(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    setSearchParams({ variant: next.key });
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]"))
        return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (import.meta.env.PROD) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground p-1 text-background shadow-2xl">
      <button
        className="grid size-10 place-items-center rounded-full hover:bg-background/15"
        onClick={() => move(-1)}
        aria-label="Previous variant"
      >
        <ArrowLeft />
      </button>
      <span className="min-w-36 px-2 text-center text-sm font-semibold">
        {current} — {variants[index].name}
      </span>
      <button
        className="grid size-10 place-items-center rounded-full hover:bg-background/15"
        onClick={() => move(1)}
        aria-label="Next variant"
      >
        <ArrowRight />
      </button>
    </div>
  );
}

function normalizeVariant(value: string | null): VariantKey {
  return value === "B" || value === "C" ? value : "A";
}
function nextLabel(state: DiscoveryState) {
  return state === "seen"
    ? "Acknowledged Discovery"
    : state === "kept"
      ? "Kept Discovery to Library"
      : state === "dismissed"
        ? "Dismissed Discovery"
        : "Reset Discovery";
}

function AlertTitle({ children }: { children: ReactNode }) {
  return <p className="font-semibold">{children}</p>;
}

function AlertDescription({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-sm">{children}</div>;
}
