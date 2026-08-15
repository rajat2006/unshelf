/**
 * PROTOTYPE — throw away after issue #378 is resolved.
 *
 * Three variants of the simplified Daily Planning interaction, switchable with
 * `?prototype=daily-planning&variant=A`, on the existing `/today` route.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  History,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type VariantKey = "A" | "B" | "C";
type ScenarioKey = "empty" | "sparse" | "typical" | "crowded";
type Signal = "unfinished" | "target" | "capture";
type ItemStatus = "not started" | "in progress" | "done";

interface PrototypeItem {
  id: string;
  title: string;
  type: "Article" | "Book" | "Course" | "Video";
  status: ItemStatus;
  origin: string;
}

interface Candidate {
  item: PrototypeItem;
  signal: Signal;
  rank: number;
  explanation: string;
  alsoQualifiesFor?: Signal[];
}

interface Scenario {
  label: string;
  focus: PrototypeItem[];
  candidates: Candidate[];
  library: PrototypeItem[];
  reviewNote: string;
}

interface PrototypeState {
  focus: PrototypeItem[];
  suggestions: Candidate[];
  dismissedIds: string[];
  query: string;
  searchResults: PrototypeItem[];
  announcement: string;
}

interface VariantProps extends PrototypeState {
  onAdd: (item: PrototypeItem) => void;
  onDismiss: (item: PrototypeItem) => void;
  onQueryChange: (query: string) => void;
}

const signalOrder: Signal[] = ["unfinished", "target", "capture"];

const signalLabels: Record<Signal, string> = {
  unfinished: "From yesterday",
  target: "Target date",
  capture: "Recently Captured",
};

const variantNames: Record<VariantKey, string> = {
  A: "Quiet sidecar",
  B: "Planning table",
  C: "One daily ledger",
};

const allItems: Record<string, PrototypeItem> = {
  dataIntensive: {
    id: "data-intensive",
    title: "Designing Data-Intensive Applications",
    type: "Book",
    status: "in progress",
    origin: "Systems Learning Plan",
  },
  practicalAccessibility: {
    id: "practical-accessibility",
    title: "Practical accessibility for teams",
    type: "Course",
    status: "not started",
    origin: "Library",
  },
  browserRendering: {
    id: "browser-rendering",
    title: "How browsers render a page",
    type: "Article",
    status: "done",
    origin: "Web foundations",
  },
  systemsPerformance: {
    id: "systems-performance",
    title: "Systems Performance",
    type: "Book",
    status: "in progress",
    origin: "Library",
  },
  distributedSystems: {
    id: "distributed-systems",
    title: "Distributed systems lecture 8",
    type: "Video",
    status: "not started",
    origin: "Systems Learning Plan",
  },
  shapeUp: {
    id: "shape-up",
    title: "Shape Up",
    type: "Book",
    status: "not started",
    origin: "Library",
  },
  designingEverydayThings: {
    id: "design-everyday-things",
    title: "The Design of Everyday Things",
    type: "Book",
    status: "not started",
    origin: "Product craft",
  },
  localFirst: {
    id: "local-first",
    title: "Local-first software",
    type: "Article",
    status: "not started",
    origin: "Library",
  },
  domainModeling: {
    id: "domain-modeling",
    title: "Domain Modeling Made Functional",
    type: "Book",
    status: "not started",
    origin: "Library",
  },
  resilientManagement: {
    id: "resilient-management",
    title: "The Manager's Path",
    type: "Book",
    status: "in progress",
    origin: "Leadership Learning Plan",
  },
  cssLayouts: {
    id: "css-layouts",
    title: "Intrinsic web design",
    type: "Video",
    status: "not started",
    origin: "Library",
  },
  thinkingSystems: {
    id: "thinking-systems",
    title: "Thinking in Systems",
    type: "Book",
    status: "not started",
    origin: "Library",
  },
};

const candidates: Record<string, Candidate> = {
  systemsPerformance: {
    item: allItems.systemsPerformance,
    signal: "unfinished",
    rank: 1,
    explanation: "Still unfinished from yesterday.",
  },
  distributedSystems: {
    item: allItems.distributedSystems,
    signal: "unfinished",
    rank: 2,
    explanation: "Still unfinished from yesterday.",
  },
  shapeUp: {
    item: allItems.shapeUp,
    signal: "target",
    rank: 1,
    explanation: "Its Target date is today.",
    alsoQualifiesFor: ["capture"],
  },
  designingEverydayThings: {
    item: allItems.designingEverydayThings,
    signal: "target",
    rank: 2,
    explanation: "Its Target date was 2 days ago.",
  },
  localFirst: {
    item: allItems.localFirst,
    signal: "capture",
    rank: 1,
    explanation: "Captured 2 days ago.",
  },
  domainModeling: {
    item: allItems.domainModeling,
    signal: "capture",
    rank: 2,
    explanation: "Captured 4 days ago.",
  },
  resilientManagement: {
    item: allItems.resilientManagement,
    signal: "target",
    rank: 3,
    explanation: "Its Target date is in 4 days.",
  },
  cssLayouts: {
    item: allItems.cssLayouts,
    signal: "capture",
    rank: 3,
    explanation: "Captured 6 days ago.",
  },
};

const sharedLibrary = Object.values(allItems);

const scenarios: Record<ScenarioKey, Scenario> = {
  empty: {
    label: "Empty",
    focus: [],
    candidates: [],
    library: sharedLibrary,
    reviewNote:
      "No Daily Focus and no eligible Suggestions. Exact Library search remains available.",
  },
  sparse: {
    label: "Sparse",
    focus: [allItems.dataIntensive],
    candidates: [candidates.localFirst],
    library: sharedLibrary,
    reviewNote:
      "The shortlist has one truthful Suggestion. The three-item budget is a ceiling, not a quota.",
  },
  typical: {
    label: "Typical",
    focus: [allItems.dataIntensive, allItems.practicalAccessibility],
    candidates: [
      candidates.systemsPerformance,
      candidates.shapeUp,
      candidates.localFirst,
      candidates.domainModeling,
    ],
    library: sharedLibrary,
    reviewNote:
      "Each present signal receives one slot. Add or Not today immediately replenishes the shortlist.",
  },
  crowded: {
    label: "Crowded",
    focus: [
      allItems.dataIntensive,
      allItems.practicalAccessibility,
      allItems.browserRendering,
      allItems.thinkingSystems,
      allItems.resilientManagement,
      allItems.cssLayouts,
    ],
    candidates: [
      candidates.systemsPerformance,
      candidates.distributedSystems,
      candidates.shapeUp,
      candidates.designingEverydayThings,
      candidates.resilientManagement,
      candidates.localFirst,
      candidates.domainModeling,
      candidates.cssLayouts,
    ],
    library: sharedLibrary,
    reviewNote:
      "A long Daily Focus and a deep candidate pool still show only three Suggestions. Shape Up has two signals but one primary explanation.",
  },
};

export function TodayPlanningPrototype() {
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = readVariant(searchParams.get("variant"));
  const scenarioKey = readScenario(searchParams.get("state"));
  const scenario = scenarios[scenarioKey];
  const [focus, setFocus] = useState(scenario.focus);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    setFocus(scenario.focus);
    setDismissedIds([]);
    setQuery("");
    setAnnouncement("");
  }, [scenario]);

  const eligibleCandidates = useMemo(() => {
    const focusIds = new Set(focus.map((item) => item.id));
    const dismissed = new Set(dismissedIds);
    return scenario.candidates.filter(
      (candidate) =>
        !focusIds.has(candidate.item.id) && !dismissed.has(candidate.item.id),
    );
  }, [dismissedIds, focus, scenario.candidates]);

  const suggestions = buildShortlist(eligibleCandidates);
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const focusIds = new Set(focus.map((item) => item.id));
    return scenario.library.filter(
      (item) =>
        item.title.toLocaleLowerCase() === normalized && !focusIds.has(item.id),
    );
  }, [focus, query, scenario.library]);

  const add = (item: PrototypeItem) => {
    setFocus((current) => [...current, item]);
    setQuery("");
    setAnnouncement(`Added ${item.title} to Daily Focus.`);
  };

  const dismiss = (item: PrototypeItem) => {
    setDismissedIds((current) => [...current, item.id]);
    setAnnouncement(`Set Not today for ${item.title}.`);
  };

  const reset = () => {
    setFocus(scenario.focus);
    setDismissedIds([]);
    setQuery("");
    setAnnouncement("Prototype state reset.");
  };

  const changeRouteState = (next: {
    variant?: VariantKey;
    scenario?: ScenarioKey;
  }) => {
    const updated = new URLSearchParams(searchParams);
    updated.set("prototype", "daily-planning");
    if (next.variant) updated.set("variant", next.variant);
    if (next.scenario) updated.set("state", next.scenario);
    setSearchParams(updated, { replace: true });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isTypingTarget(event.target)) return;
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      changeRouteState({ variant: adjacentVariant(variant, direction) });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const props: VariantProps = {
    focus,
    suggestions,
    dismissedIds,
    query,
    searchResults,
    announcement,
    onAdd: add,
    onDismiss: dismiss,
    onQueryChange: setQuery,
  };

  return (
    <>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {variant === "A" && <VariantA {...props} />}
      {variant === "B" && <VariantB {...props} />}
      {variant === "C" && <VariantC {...props} />}
      <PrototypeSwitcher
        variant={variant}
        scenarioKey={scenarioKey}
        scenario={scenario}
        state={props}
        remainingCandidateCount={eligibleCandidates.length}
        onVariantChange={(nextVariant) =>
          changeRouteState({ variant: nextVariant })
        }
        onScenarioChange={(nextScenario) =>
          changeRouteState({ scenario: nextScenario })
        }
        onReset={reset}
      />
    </>
  );
}

function VariantA(props: VariantProps) {
  return (
    <section
      className="mx-auto grid w-full max-w-7xl min-w-0 gap-6 pb-44"
      aria-labelledby="prototype-a-heading"
    >
      <TodayHeader id="prototype-a-heading" focus={props.focus} />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.72fr)] lg:items-start">
        <section
          className="grid min-w-0 gap-4 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-6"
          aria-label="Today's Daily Focus"
        >
          <SectionHeading
            eyebrow="Saturday · 15 August"
            title="Today's Daily Focus"
            trailing={
              <Button type="button" variant="quiet" size="compact">
                <History aria-hidden="true" />
                Browse yesterday
              </Button>
            }
          />
          <FocusList items={props.focus} presentation="cards" />
        </section>

        <aside
          className="grid min-w-0 gap-5 rounded-[var(--radius-panel)] border bg-quiet-panel p-4 sm:p-5"
          aria-label="Daily Planning"
        >
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
              Daily Planning
            </p>
            <h2 className="mt-1 mb-0 font-serif text-2xl font-medium">
              Add only what fits
            </h2>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
              Search for one known Item or consider this small shortlist. Only
              Add changes Daily Focus.
            </p>
          </div>
          <ExactLibrarySearch {...pickSearchProps(props)} />
          <section
            className="grid gap-3 border-t pt-5"
            aria-label="Suggestions"
          >
            <SuggestionHeading count={props.suggestions.length} />
            <SuggestionList {...pickSuggestionProps(props)} compact />
          </section>
        </aside>
      </div>
    </section>
  );
}

function VariantB(props: VariantProps) {
  return (
    <section
      className="mx-auto grid w-full max-w-7xl min-w-0 gap-7 pb-44"
      aria-labelledby="prototype-b-heading"
    >
      <TodayHeader id="prototype-b-heading" focus={props.focus} condensed />
      <section
        className="grid gap-5 border-y py-5 lg:grid-cols-[minmax(17rem,0.65fr)_minmax(0,1.5fr)] lg:items-start"
        aria-label="Daily Planning"
      >
        <div className="grid gap-4 lg:border-r lg:pr-6">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
              Exact Library search
            </p>
            <h2 className="mt-1 mb-0 font-serif text-xl font-medium">
              Know what you want?
            </h2>
          </div>
          <ExactLibrarySearch {...pickSearchProps(props)} hideHeading />
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            Search does not use or change the shortlist. A date-scoped Not today
            choice remains searchable.
          </p>
        </div>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                Suggestions · up to three
              </p>
              <h2 className="mt-1 mb-0 font-serif text-xl font-medium">
                A short planning table
              </h2>
            </div>
            <p className="m-0 max-w-md text-sm text-muted-foreground">
              Ordered by yesterday, Target date, then recent Capture.
            </p>
          </div>
          <SuggestionTable {...pickSuggestionProps(props)} />
        </div>
      </section>

      <section className="grid gap-4" aria-label="Today's Daily Focus">
        <SectionHeading
          eyebrow="Saturday · 15 August"
          title="Today's Daily Focus"
          trailing={
            <Button type="button" variant="secondary" size="compact">
              <History aria-hidden="true" />
              Yesterday
            </Button>
          }
        />
        <FocusList items={props.focus} presentation="rows" />
      </section>
    </section>
  );
}

function VariantC(props: VariantProps) {
  return (
    <section
      className="mx-auto grid w-full max-w-5xl min-w-0 gap-6 pb-44"
      aria-labelledby="prototype-c-heading"
    >
      <TodayHeader id="prototype-c-heading" focus={props.focus} condensed />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.55fr)] lg:items-start">
        <section
          className="overflow-hidden rounded-[var(--radius-panel)] border bg-card"
          aria-label="Today's Daily Focus and Suggestions"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-6">
            <div>
              <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                Saturday · 15 August
              </p>
              <h2 className="mt-1 mb-0 font-serif text-2xl font-medium">
                One daily ledger
              </h2>
              <p className="mt-2 mb-0 text-sm text-muted-foreground">
                Chosen Items first. Suggestions continue below, but remain
                outside Daily Focus until Add.
              </p>
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon-compact"
              aria-label="Browse yesterday"
            >
              <History aria-hidden="true" />
            </Button>
          </div>
          <LedgerFocus items={props.focus} />
          <div className="border-t-2 border-dashed bg-quiet-panel/55 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                  Not in Daily Focus
                </p>
                <h3 className="mt-1 mb-0 font-serif text-xl font-medium">
                  Consider next
                </h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {props.suggestions.length} of 3 visible
              </span>
            </div>
            <LedgerSuggestions {...pickSuggestionProps(props)} />
          </div>
        </section>
        <aside className="grid gap-4 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-5">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <BookOpen className="size-4" aria-hidden="true" />
              <p className="m-0 text-xs font-semibold tracking-[0.1em] uppercase">
                Library
              </p>
            </div>
            <h2 className="mt-2 mb-0 font-serif text-xl font-medium">
              Add a known Item
            </h2>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
              Exact search is the deliberate path around Suggestions.
            </p>
          </div>
          <ExactLibrarySearch {...pickSearchProps(props)} hideHeading />
          <p className="m-0 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Only Add changes Daily Focus. Not today applies only to Suggestions
            on this date.
          </p>
        </aside>
      </div>
    </section>
  );
}

function TodayHeader({
  id,
  focus,
  condensed = false,
}: {
  id: string;
  focus: PrototypeItem[];
  condensed?: boolean;
}) {
  const done = focus.filter((item) => item.status === "done").length;
  const percentage =
    focus.length === 0 ? 0 : Math.round((done / focus.length) * 100);
  return (
    <header
      className={cn(
        "grid gap-5 border-b pb-6",
        !condensed &&
          "sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] sm:items-end",
      )}
    >
      <div className="grid gap-2">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
          Daily attention
        </p>
        <h1
          id={id}
          className="m-0 font-serif text-4xl leading-none font-medium tracking-[-0.025em] sm:text-5xl"
        >
          Today
        </h1>
        <p className="m-0 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Choose a small working set. Suggestions can help, but only you add an
          Item to Daily Focus.
        </p>
      </div>
      {!condensed && (
        <div className="grid gap-2" aria-label="Today progress">
          <div className="flex items-baseline justify-between gap-3">
            <strong className="font-serif text-3xl font-medium">
              {percentage}%
            </strong>
            <span className="text-sm font-semibold">
              {done} of {focus.length} done
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Derived from shared Item Status.
          </p>
        </div>
      )}
    </header>
  );
}

function SectionHeading({
  eyebrow,
  title,
  trailing,
}: {
  eyebrow: string;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 mb-0 font-serif text-2xl font-medium">{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

function FocusList({
  items,
  presentation,
}: {
  items: PrototypeItem[];
  presentation: "cards" | "rows";
}) {
  if (items.length === 0) return <FocusEmpty />;
  return (
    <ol
      className={cn(
        "grid list-none p-0",
        presentation === "cards"
          ? "overflow-hidden border-t"
          : "gap-3 md:grid-cols-2",
      )}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            presentation === "cards"
              ? "border-b last:border-b-0"
              : "rounded-[var(--radius-card)] border bg-card p-4",
          )}
        >
          <article className="flex min-w-0 items-center gap-3 py-3">
            <span className="w-7 shrink-0 font-serif text-lg text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <StatusDot status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-semibold">{item.title}</p>
              <p className="mt-1 mb-0 text-xs text-muted-foreground">
                {item.type} · {item.origin} · {item.status}
              </p>
            </div>
            <Button type="button" variant="quiet" size="compact">
              <Check aria-hidden="true" />
              Done
            </Button>
          </article>
        </li>
      ))}
    </ol>
  );
}

function FocusEmpty() {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed bg-background/60 p-8 text-center">
      <p className="m-0 font-serif text-xl font-medium">
        Choose what deserves your attention.
      </p>
      <p className="mt-2 mb-0 text-sm text-muted-foreground">
        Use exact Library search or consider a Suggestion below.
      </p>
    </div>
  );
}

function StatusDot({ status }: { status: ItemStatus }) {
  return (
    <>
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full border",
          status === "done" && "border-status-completed bg-status-completed",
          status === "in progress" &&
            "border-status-progress bg-status-progress",
          status === "not started" && "border-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{status}</span>
    </>
  );
}

function ExactLibrarySearch({
  query,
  searchResults,
  onQueryChange,
  onAdd,
  hideHeading = false,
}: Pick<VariantProps, "query" | "searchResults" | "onQueryChange" | "onAdd"> & {
  hideHeading?: boolean;
}) {
  return (
    <section className="grid gap-3" aria-label="Exact Library search">
      {!hideHeading && (
        <h3 className="m-0 text-sm font-semibold">Exact Library search</h3>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Try: Shape Up"
          aria-label="Search exact Library Item title"
          className="pr-10 pl-9"
        />
        {query && (
          <Button
            type="button"
            variant="quiet"
            size="icon-compact"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => onQueryChange("")}
            aria-label="Clear exact Library search"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      {query.trim() && searchResults.length === 0 && (
        <p className="m-0 rounded-[var(--radius-card)] border border-dashed p-3 text-sm text-muted-foreground">
          No unselected Item has that exact title.
        </p>
      )}
      {searchResults.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 flex-wrap items-center gap-3 rounded-[var(--radius-card)] border bg-background p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-semibold">{item.title}</p>
            <p className="mt-1 mb-0 text-xs text-muted-foreground">
              {item.type} · {item.origin}
            </p>
          </div>
          <AddButton item={item} onAdd={onAdd} />
        </div>
      ))}
    </section>
  );
}

function SuggestionHeading({ count }: { count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="m-0 text-sm font-semibold">Suggestions</h3>
      <span className="text-xs text-muted-foreground">
        {count} of 3 visible
      </span>
    </div>
  );
}

function SuggestionList({
  suggestions,
  onAdd,
  onDismiss,
  compact = false,
}: Pick<VariantProps, "suggestions" | "onAdd" | "onDismiss"> & {
  compact?: boolean;
}) {
  if (suggestions.length === 0) return <SuggestionsEmpty />;
  return (
    <ol className="grid list-none overflow-hidden rounded-[var(--radius-card)] border bg-background p-0">
      {suggestions.map((candidate, index) => (
        <li key={candidate.item.id} className="border-b p-3 last:border-b-0">
          <article className="grid gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="font-serif text-lg text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold">{candidate.item.title}</p>
                {!compact && (
                  <p className="mt-1 mb-0 text-xs text-muted-foreground">
                    {candidate.item.type} · {candidate.item.origin}
                  </p>
                )}
              </div>
            </div>
            <SignalExplanation candidate={candidate} />
            <SuggestionActions
              item={candidate.item}
              onAdd={onAdd}
              onDismiss={onDismiss}
            />
          </article>
        </li>
      ))}
    </ol>
  );
}

function SuggestionTable({
  suggestions,
  onAdd,
  onDismiss,
}: Pick<VariantProps, "suggestions" | "onAdd" | "onDismiss">) {
  if (suggestions.length === 0) return <SuggestionsEmpty />;
  return (
    <ol className="grid list-none divide-y overflow-hidden rounded-[var(--radius-card)] border bg-card p-0">
      {suggestions.map((candidate, index) => (
        <li key={candidate.item.id}>
          <article className="grid gap-3 p-4 md:grid-cols-[2rem_minmax(0,1fr)_minmax(10rem,0.75fr)_auto] md:items-center">
            <span className="font-serif text-xl text-muted-foreground">
              0{index + 1}
            </span>
            <div className="min-w-0">
              <p className="m-0 font-semibold">{candidate.item.title}</p>
              <p className="mt-1 mb-0 text-xs text-muted-foreground">
                {candidate.item.type} · {candidate.item.origin}
              </p>
            </div>
            <SignalExplanation candidate={candidate} />
            <SuggestionActions
              item={candidate.item}
              onAdd={onAdd}
              onDismiss={onDismiss}
              iconsOnly
            />
          </article>
        </li>
      ))}
    </ol>
  );
}

function LedgerFocus({ items }: { items: PrototypeItem[] }) {
  if (items.length === 0)
    return (
      <div className="p-4 sm:p-6">
        <FocusEmpty />
      </div>
    );
  return (
    <ol className="grid list-none p-0">
      {items.map((item, index) => (
        <li key={item.id} className="border-b last:border-b-0">
          <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
            <span className="w-8 font-serif text-xl text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <StatusDot status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="m-0 font-semibold">{item.title}</p>
              <p className="mt-1 mb-0 text-xs text-muted-foreground">
                In Daily Focus · {item.status}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LedgerSuggestions({
  suggestions,
  onAdd,
  onDismiss,
}: Pick<VariantProps, "suggestions" | "onAdd" | "onDismiss">) {
  if (suggestions.length === 0) return <SuggestionsEmpty />;
  return (
    <ol className="grid list-none gap-1 p-0">
      {suggestions.map((candidate, index) => (
        <li key={candidate.item.id}>
          <article className="grid gap-3 rounded-[var(--radius-card)] px-2 py-3 hover:bg-background sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="font-serif text-lg text-muted-foreground">
              +{index + 1}
            </span>
            <div className="min-w-0">
              <p className="m-0 font-semibold">{candidate.item.title}</p>
              <SignalExplanation candidate={candidate} inline />
            </div>
            <SuggestionActions
              item={candidate.item}
              onAdd={onAdd}
              onDismiss={onDismiss}
              iconsOnly
            />
          </article>
        </li>
      ))}
    </ol>
  );
}

function SuggestionsEmpty() {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed p-4 text-sm text-muted-foreground">
      Nothing needs your attention here. Exact Library search is still
      available.
    </div>
  );
}

function SignalExplanation({
  candidate,
  inline = false,
}: {
  candidate: Candidate;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0",
        inline && "mt-1 flex flex-wrap items-baseline gap-2",
      )}
    >
      <span className="inline-flex rounded-full border border-primary/25 bg-accent px-2 py-0.5 text-[0.68rem] font-semibold text-accent-foreground">
        {signalLabels[candidate.signal]}
      </span>
      <p
        className={cn(
          "mb-0 text-xs leading-relaxed text-muted-foreground",
          inline ? "mt-0" : "mt-1.5",
        )}
      >
        {candidate.explanation}
      </p>
    </div>
  );
}

function SuggestionActions({
  item,
  onAdd,
  onDismiss,
  iconsOnly = false,
}: {
  item: PrototypeItem;
  onAdd: (item: PrototypeItem) => void;
  onDismiss: (item: PrototypeItem) => void;
  iconsOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size={iconsOnly ? "icon-compact" : "compact"}
        className={cn(!iconsOnly && "min-h-11 flex-1 sm:min-h-8")}
        onClick={() => onAdd(item)}
        aria-label={`Add ${item.title} to Daily Focus`}
      >
        <Plus aria-hidden="true" />
        {!iconsOnly && "Add"}
      </Button>
      <Button
        type="button"
        variant="quiet"
        size={iconsOnly ? "icon-compact" : "compact"}
        className={cn(!iconsOnly && "min-h-11 flex-1 sm:min-h-8")}
        onClick={() => onDismiss(item)}
        aria-label={`Not today for ${item.title}`}
      >
        <X aria-hidden="true" />
        {!iconsOnly && "Not today"}
      </Button>
    </div>
  );
}

function AddButton({
  item,
  onAdd,
}: {
  item: PrototypeItem;
  onAdd: (item: PrototypeItem) => void;
}) {
  return (
    <Button
      type="button"
      size="compact"
      className="min-h-11 sm:min-h-8"
      onClick={() => onAdd(item)}
      aria-label={`Add ${item.title} to Daily Focus`}
    >
      <Plus aria-hidden="true" />
      Add
    </Button>
  );
}

function PrototypeSwitcher({
  variant,
  scenarioKey,
  scenario,
  state,
  remainingCandidateCount,
  onVariantChange,
  onScenarioChange,
  onReset,
}: {
  variant: VariantKey;
  scenarioKey: ScenarioKey;
  scenario: Scenario;
  state: PrototypeState;
  remainingCandidateCount: number;
  onVariantChange: (variant: VariantKey) => void;
  onScenarioChange: (scenario: ScenarioKey) => void;
  onReset: () => void;
}) {
  return (
    <aside className="fixed right-3 bottom-3 left-3 z-50 mx-auto max-w-5xl rounded-[var(--radius-panel)] border border-white/15 bg-foreground p-3 text-background shadow-[var(--shadow-floating)] sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon-compact"
            onClick={() => onVariantChange(adjacentVariant(variant, -1))}
            aria-label="Previous prototype variant"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="min-w-36 text-center">
            <p className="m-0 text-xs font-semibold tracking-[0.1em] uppercase opacity-65">
              Prototype
            </p>
            <p className="m-0 text-sm font-semibold">
              {variant} — {variantNames[variant]}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-compact"
            onClick={() => onVariantChange(adjacentVariant(variant, 1))}
            aria-label="Next prototype variant"
          >
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label="Prototype state"
        >
          {(Object.keys(scenarios) as ScenarioKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={cn(
                "min-h-9 rounded-[var(--radius-control)] px-3 text-xs font-semibold",
                key === scenarioKey
                  ? "bg-background text-foreground"
                  : "text-background/75 hover:bg-background/10 hover:text-background",
              )}
              onClick={() => onScenarioChange(key)}
              aria-pressed={key === scenarioKey}
            >
              {scenarios[key].label}
            </button>
          ))}
          <button
            type="button"
            className="ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-xs font-semibold text-background/75 hover:bg-background/10 hover:text-background"
            onClick={onReset}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
      <details className="mt-2 border-t border-white/15 pt-2 text-xs">
        <summary className="cursor-pointer font-semibold text-background/75">
          Review note and full state
        </summary>
        <div className="mt-2 grid gap-2 text-background/75 sm:grid-cols-2">
          <p className="m-0 leading-relaxed">{scenario.reviewNote}</p>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <dt className="font-semibold text-background">Daily Focus</dt>
            <dd className="m-0">
              {state.focus.map((item) => item.title).join(", ") || "empty"}
            </dd>
            <dt className="font-semibold text-background">Visible</dt>
            <dd className="m-0">
              {state.suggestions
                .map((candidate) => candidate.item.title)
                .join(", ") || "none"}
            </dd>
            <dt className="font-semibold text-background">Eligible pool</dt>
            <dd className="m-0">{remainingCandidateCount}</dd>
            <dt className="font-semibold text-background">Not today</dt>
            <dd className="m-0">{state.dismissedIds.join(", ") || "none"}</dd>
          </dl>
        </div>
      </details>
    </aside>
  );
}

function buildShortlist(eligibleCandidates: Candidate[]): Candidate[] {
  const grouped = new Map<Signal, Candidate[]>(
    signalOrder.map((signal) => [
      signal,
      eligibleCandidates
        .filter((candidate) => candidate.signal === signal)
        .sort((left, right) => left.rank - right.rank),
    ]),
  );
  const selected: Candidate[] = [];
  for (const signal of signalOrder) {
    const first = grouped.get(signal)?.shift();
    if (first) selected.push(first);
  }
  while (selected.length < 3) {
    const next = signalOrder
      .map((signal) => grouped.get(signal)?.[0])
      .find((candidate): candidate is Candidate => candidate !== undefined);
    if (!next) break;
    selected.push(next);
    grouped.get(next.signal)?.shift();
  }
  return selected.sort(
    (left, right) =>
      signalOrder.indexOf(left.signal) - signalOrder.indexOf(right.signal) ||
      left.rank - right.rank,
  );
}

function pickSearchProps(props: VariantProps) {
  return {
    query: props.query,
    searchResults: props.searchResults,
    onQueryChange: props.onQueryChange,
    onAdd: props.onAdd,
  };
}

function pickSuggestionProps(props: VariantProps) {
  return {
    suggestions: props.suggestions,
    onAdd: props.onAdd,
    onDismiss: props.onDismiss,
  };
}

function readVariant(value: string | null): VariantKey {
  return value === "B" || value === "C" ? value : "A";
}

function readScenario(value: string | null): ScenarioKey {
  return value === "empty" || value === "sparse" || value === "crowded"
    ? value
    : "typical";
}

function adjacentVariant(variant: VariantKey, direction: -1 | 1): VariantKey {
  const variants: VariantKey[] = ["A", "B", "C"];
  const currentIndex = variants.indexOf(variant);
  return variants[
    (currentIndex + direction + variants.length) % variants.length
  ];
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}
