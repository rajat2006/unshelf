import { useCallback, useEffect, useRef, useState } from "react";
import {
  deriveItemCompletion,
  Status,
  type DailyFocus,
  type DailyPlanning,
  type Item,
  type LearningPlan,
  type LearningPlanId,
} from "@unshelf/shared";
import {
  Check,
  ChevronDown,
  History,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addItemToToday,
  fetchDailyPlanning,
  fetchLearningPlans,
  fetchToday,
  removeItemFromToday,
  suppressDailyPlanningItem,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { completionPercentage } from "../presentation/progress";
import type { CurrentUser } from "../application-auth/types";
import { planItemBackgroundLocation } from "../items/item-route-state";
import { ItemSummary } from "../items/ItemSummary";
import { STATUS_LABELS } from "../items/presentation";
import { useItemStatusMutation } from "../items/useItemStatusMutation";
import { useCaptureListener } from "../shell/useCaptureListener";

type TodayState =
  | { status: "loading" }
  | {
      status: "focus-error";
      planning: DailyPlanning;
      plans: LearningPlan[];
    }
  | {
      status: "ready";
      focus: DailyFocus;
      planning: DailyPlanning;
      plans: LearningPlan[];
    };

/** The current editable Daily Focus and its explicit Library selection seam. */
export function TodaySurface() {
  const user = useCurrentUser();
  const location = useLocation();
  const [state, setState] = useState<TodayState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [intention, setIntention] = useState("");
  const [learningPlanId, setLearningPlanId] = useState<
    LearningPlanId | undefined
  >();
  const [mutationError, setMutationError] = useState(false);
  const [planningError, setPlanningError] = useState(false);
  const [focusRetrying, setFocusRetrying] = useState(false);
  const [planningRetrying, setPlanningRetrying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const skipPlanningRefresh = useRef(false);
  const [pendingAction, setPendingAction] = useState<{
    kind: "add" | "remove" | "suppress";
    itemId: Item["id"];
  }>();

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const [focus, planning, plans] = await Promise.allSettled([
      fetchToday(user),
      fetchDailyPlanning(user, {}),
      fetchLearningPlans(user),
    ]);
    skipPlanningRefresh.current = true;
    setPlanningError(
      planning.status === "rejected" || plans.status === "rejected",
    );
    const loadedPlanning =
      planning.status === "fulfilled"
        ? planning.value
        : { searchResults: [], suggestions: [] };
    const loadedPlans = plans.status === "fulfilled" ? plans.value : [];
    if (focus.status === "rejected") {
      setState({
        status: "focus-error",
        planning: loadedPlanning,
        plans: loadedPlans,
      });
      return;
    }
    setState({
      status: "ready",
      focus: focus.value,
      planning: loadedPlanning,
      plans: loadedPlans,
    });
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useCaptureListener(load);

  const retryFocus = useCallback(async () => {
    setFocusRetrying(true);
    try {
      const focus = await fetchToday(user);
      skipPlanningRefresh.current = true;
      setState((value) =>
        value.status === "focus-error"
          ? { ...value, status: "ready", focus }
          : value,
      );
    } catch {
      // The panel remains in its recoverable error state.
    } finally {
      setFocusRetrying(false);
    }
  }, [user]);

  const retryPlanning = useCallback(async () => {
    setPlanningRetrying(true);
    try {
      const [planning, plans] = await Promise.all([
        fetchDailyPlanning(user, {
          query: query.trim() || undefined,
          intention: intention.trim() || undefined,
          learningPlanId,
        }),
        fetchLearningPlans(user),
      ]);
      setState((value) =>
        value.status === "loading" ? value : { ...value, planning, plans },
      );
      setPlanningError(false);
    } catch {
      setPlanningError(true);
    } finally {
      setPlanningRetrying(false);
    }
  }, [intention, learningPlanId, query, user]);

  useEffect(() => {
    if (state.status === "loading") return;
    if (skipPlanningRefresh.current) {
      skipPlanningRefresh.current = false;
      if (
        query.trim() === "" &&
        intention.trim() === "" &&
        learningPlanId === undefined
      ) {
        return;
      }
    }
    let isActive = true;
    setPlanningError(false);
    void fetchDailyPlanning(user, {
      query: query.trim() || undefined,
      intention: intention.trim() || undefined,
      learningPlanId,
    })
      .then((planning) => {
        if (isActive) {
          setPlanningError(false);
          setState((value) =>
            value.status === "loading" ? value : { ...value, planning },
          );
        }
      })
      .catch(() => {
        if (isActive) setPlanningError(true);
      });
    return () => {
      isActive = false;
    };
  }, [intention, learningPlanId, query, state.status, user]);

  const add = async (
    item: Item,
    origin?: Parameters<typeof addItemToToday>[2],
  ) => {
    setMutationError(false);
    setAnnouncement("");
    setPendingAction({ kind: "add", itemId: item.id });
    try {
      const focus = await addItemToToday(user, item.id, origin);
      setState((current) =>
        current.status !== "loading"
          ? {
              ...current,
              status: "ready",
              focus,
              planning: removePlanningItem(current.planning, item.id),
            }
          : current,
      );
      setAnnouncement(`Added ${item.title} to Today`);
    } catch {
      setMutationError(true);
    } finally {
      setPendingAction(undefined);
    }
  };

  const suppress = async (item: Item) => {
    setMutationError(false);
    setAnnouncement("");
    setPendingAction({ kind: "suppress", itemId: item.id });
    try {
      await suppressDailyPlanningItem(user, item.id);
      setState((current) =>
        current.status !== "loading"
          ? {
              ...current,
              planning: removePlanningSuggestion(current.planning, item.id),
            }
          : current,
      );
      setAnnouncement(`Set Not today for ${item.title}`);
    } catch {
      setMutationError(true);
    } finally {
      setPendingAction(undefined);
    }
  };

  const remove = async (focus: DailyFocus, item: Item) => {
    setMutationError(false);
    setAnnouncement("");
    setPendingAction({ kind: "remove", itemId: item.id });
    try {
      const updated = await removeItemFromToday(user, focus.id, item.id);
      setState((current) =>
        current.status === "ready" ? { ...current, focus: updated } : current,
      );
      setAnnouncement(`Removed ${item.title} from Today`);
    } catch {
      setMutationError(true);
    } finally {
      setPendingAction(undefined);
    }
  };

  const replaceItem = (changed: Item) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      const entries = current.focus.entries.map((entry) =>
        entry.item.id === changed.id
          ? {
              ...entry,
              item: changed,
              snapshot: { ...entry.snapshot, status: changed.status },
            }
          : entry,
      );
      return {
        ...current,
        focus: {
          ...current.focus,
          entries,
          ...deriveItemCompletion(entries.map((entry) => entry.snapshot)),
        },
        planning: {
          searchResults: current.planning.searchResults.map((item) =>
            item.id === changed.id ? changed : item,
          ),
          suggestions: current.planning.suggestions.map((suggestion) =>
            suggestion.item.id === changed.id
              ? { ...suggestion, item: changed }
              : suggestion,
          ),
        },
      };
    });
    setAnnouncement(
      `${changed.title} Status changed to ${STATUS_LABELS[changed.status]}`,
    );
  };
  return (
    <section
      className="mx-auto grid w-full max-w-7xl min-w-0 gap-6"
      aria-labelledby="today-heading"
      aria-busy={state.status === "loading"}
    >
      <span
        className="sr-only"
        role="status"
        aria-label={announcement || undefined}
      >
        {announcement}
      </span>
      <header className="grid gap-5 border-b pb-6 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] sm:items-end">
        <div className="grid gap-2">
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Daily attention
          </p>
          <h1
            id="today-heading"
            className="m-0 font-serif text-4xl leading-none font-medium tracking-[-0.025em] sm:text-5xl"
          >
            Today
          </h1>
          <p className="m-0 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Choose a small working set, then let each Item&apos;s shared Status
            record your progress everywhere.
          </p>
        </div>
        {state.status === "ready" && (
          <div
            className="grid gap-2 rounded-[var(--radius-card)] border bg-card p-4"
            aria-label="Today progress"
          >
            <div className="flex items-baseline justify-between gap-3">
              <strong className="font-serif text-3xl font-medium">
                {Math.round(completionPercentage(state.focus))}%
              </strong>
              <span className="text-sm font-semibold">
                {state.focus.done} of {state.focus.total} done
              </span>
            </div>
            <Progress
              value={completionPercentage(state.focus)}
              aria-label={`${state.focus.done} of ${state.focus.total} Today Items done`}
            />
            <p className="m-0 text-xs leading-relaxed text-muted-foreground">
              Derived from shared Item Status.
            </p>
          </div>
        )}
      </header>

      {state.status === "loading" && <TodayLoading />}
      {state.status !== "loading" && (
        <>
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:items-start">
            <section
              className="grid min-w-0 gap-4 rounded-[var(--radius-panel)] border bg-quiet-panel p-4 sm:p-6"
              aria-label="Today's Daily Focus"
            >
              {state.status === "focus-error" ? (
                <Alert className="grid gap-3">
                  <div>
                    <p className="m-0 font-semibold">
                      Couldn&apos;t load today&apos;s Daily Focus
                    </p>
                    <p className="mt-1 mb-0 text-sm">
                      Daily Planning is still available. Try the focus request
                      again.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-w-24 w-fit"
                    disabled={focusRetrying}
                    onClick={() => void retryFocus()}
                  >
                    {focusRetrying ? "Retrying…" : "Retry"}
                  </Button>
                </Alert>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                        {state.focus.date}
                      </p>
                      <h2 className="mt-1 mb-0 font-serif text-2xl font-medium">
                        Today&apos;s Daily Focus
                      </h2>
                    </div>
                    <Button
                      asChild
                      variant="quiet"
                      size="compact"
                      className="min-h-11 sm:min-h-8"
                    >
                      <Link
                        to={{
                          pathname: `/today/${previousCalendarDate(state.focus.date)}`,
                          search: location.search,
                        }}
                      >
                        <History aria-hidden="true" />
                        Browse yesterday
                      </Link>
                    </Button>
                  </div>
                  {state.focus.entries.length === 0 ? (
                    <div className="rounded-[var(--radius-card)] border border-dashed bg-card p-8 text-center">
                      <p className="m-0 font-serif text-xl font-medium">
                        Choose what deserves your attention.
                      </p>
                      <p className="mt-2 mb-0 text-sm text-muted-foreground">
                        Use Daily Planning to build a small working set.
                      </p>
                    </div>
                  ) : (
                    <ol className="grid list-none gap-3 p-0">
                      {state.focus.entries.map(({ item, origin }) => (
                        <li key={item.id}>
                          <ItemSummary
                            item={item}
                            detailBackgroundLocation={
                              origin
                                ? planItemBackgroundLocation({
                                    learningPlanId: origin.learningPlan.id,
                                    ...(origin.stage
                                      ? { stageId: origin.stage.id }
                                      : {}),
                                  })
                                : undefined
                            }
                            actions={
                              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                                <p className="m-0 text-sm text-muted-foreground">
                                  {origin
                                    ? `From ${origin.learningPlan.name}${origin.stage ? ` · ${origin.stage.name}` : ""}`
                                    : "From Library"}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <TodayStatusButton
                                    item={item}
                                    user={user}
                                    onChanged={replaceItem}
                                  />
                                  <Button
                                    type="button"
                                    variant="quiet"
                                    size="compact"
                                    className="min-h-11 min-w-28 sm:min-h-8"
                                    disabled={
                                      pendingAction?.kind === "remove" &&
                                      pendingAction.itemId === item.id
                                    }
                                    onClick={() =>
                                      void remove(state.focus, item)
                                    }
                                    aria-label={`Remove ${item.title} from Today`}
                                  >
                                    <Trash2 aria-hidden="true" />
                                    {pendingAction?.kind === "remove" &&
                                    pendingAction.itemId === item.id
                                      ? "Removing…"
                                      : "Remove"}
                                  </Button>
                                </div>
                              </div>
                            }
                          />
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </section>

            <section
              className="grid min-w-0 gap-5 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-6"
              aria-label="Daily Planning"
            >
              <div className="grid gap-1">
                <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                  Search + suggestions
                </p>
                <h2
                  id="today-planning-heading"
                  className="m-0 font-serif text-2xl font-medium"
                >
                  Plan Today
                </h2>
                <p className="mt-1 mb-0 text-sm leading-relaxed text-muted-foreground">
                  Search the Library or refine deterministic suggestions. Only
                  Add changes Today.
                </p>
              </div>

              {planningError && (
                <Alert className="grid gap-3">
                  <div>
                    <p className="m-0 font-semibold">
                      Couldn&apos;t update Daily Planning
                    </p>
                    <p className="mt-1 mb-0 text-sm">
                      Today remains available. Try the planning request again.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-w-24 w-fit"
                    disabled={planningRetrying}
                    onClick={() => void retryPlanning()}
                  >
                    {planningRetrying ? "Retrying…" : "Retry"}
                  </Button>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="today-item-search">
                  Find an Item
                </FieldLabel>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="today-item-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search exact Item titles…"
                    className="pr-10 pl-9"
                  />
                  {query.length > 0 && (
                    <Button
                      type="button"
                      variant="quiet"
                      size="icon-compact"
                      className="absolute top-1/2 right-1 min-h-11 min-w-11 -translate-y-1/2 sm:min-h-8 sm:min-w-8"
                      onClick={() => setQuery("")}
                      aria-label="Clear Item search"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </Field>

              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 w-full justify-between sm:min-h-10"
                  >
                    Refine suggestions
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-4 pt-4">
                  <Field>
                    <FieldLabel htmlFor="today-intention">
                      Learning intention
                    </FieldLabel>
                    <Input
                      id="today-intention"
                      type="text"
                      value={intention}
                      onChange={(event) => setIntention(event.target.value)}
                      placeholder="What do you want to learn?"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Learning Plan lens</FieldLabel>
                    <Select
                      value={learningPlanId ?? "all"}
                      onValueChange={(value) =>
                        setLearningPlanId(
                          value === "all"
                            ? undefined
                            : (value as LearningPlanId),
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label="Learning Plan lens"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Learning Plans</SelectItem>
                        {state.plans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </CollapsibleContent>
              </Collapsible>

              {query.trim() && state.planning.searchResults.length === 0 && (
                <div className="rounded-[var(--radius-card)] border border-dashed p-4 text-sm text-muted-foreground">
                  No unselected Items match.
                </div>
              )}
              {state.planning.searchResults.length > 0 && (
                <section
                  className="grid gap-3"
                  aria-label="Item search results"
                >
                  <h3 className="m-0 text-sm font-semibold">Search results</h3>
                  <ul className="grid list-none gap-3 p-0">
                    {state.planning.searchResults.map((item) => (
                      <li key={item.id}>
                        <ItemSummary
                          item={item}
                          actions={
                            <PlanningAddButton
                              item={item}
                              pending={
                                pendingAction?.kind === "add" &&
                                pendingAction.itemId === item.id
                              }
                              onAdd={() => void add(item)}
                            />
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section
                className="grid gap-3 border-t pt-5"
                aria-label="Suggestions"
              >
                <div className="flex items-center gap-2">
                  <Sparkles
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="m-0 text-sm font-semibold">
                    Explained suggestions
                  </h3>
                </div>
                {state.planning.suggestions.length === 0 ? (
                  <div className="rounded-[var(--radius-card)] border border-dashed p-4 text-sm text-muted-foreground">
                    No suggestions for these inputs.
                  </div>
                ) : (
                  <ul className="grid list-none gap-3 p-0">
                    {state.planning.suggestions.map((suggestion) => (
                      <li key={suggestion.item.id}>
                        <ItemSummary
                          item={suggestion.item}
                          detailBackgroundLocation={
                            suggestion.origin
                              ? planItemBackgroundLocation({
                                  learningPlanId:
                                    suggestion.origin.learningPlan.id,
                                  ...(suggestion.origin.stage
                                    ? { stageId: suggestion.origin.stage.id }
                                    : {}),
                                })
                              : undefined
                          }
                          actions={
                            <div className="grid gap-3 border-t pt-3">
                              <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                                {suggestion.explanation}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <PlanningAddButton
                                  item={suggestion.item}
                                  pending={
                                    pendingAction?.kind === "add" &&
                                    pendingAction.itemId === suggestion.item.id
                                  }
                                  onAdd={() =>
                                    void add(
                                      suggestion.item,
                                      suggestion.origin
                                        ? {
                                            learningPlanId:
                                              suggestion.origin.learningPlan.id,
                                            ...(suggestion.origin.stage
                                              ? {
                                                  stageId:
                                                    suggestion.origin.stage.id,
                                                }
                                              : {}),
                                          }
                                        : undefined,
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="quiet"
                                  size="compact"
                                  className="min-h-11 min-w-28 sm:min-h-8"
                                  disabled={
                                    pendingAction?.kind === "suppress" &&
                                    pendingAction.itemId === suggestion.item.id
                                  }
                                  onClick={() => void suppress(suggestion.item)}
                                  aria-label={`Not today for ${suggestion.item.title}`}
                                >
                                  <X aria-hidden="true" />
                                  {pendingAction?.kind === "suppress" &&
                                  pendingAction.itemId === suggestion.item.id
                                    ? "Updating…"
                                    : "Not today"}
                                </Button>
                              </div>
                            </div>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </section>
          </div>
          {mutationError && (
            <Alert>
              Couldn&apos;t update Today. Your existing Daily Focus is
              unchanged; try again.
            </Alert>
          )}
        </>
      )}
    </section>
  );
}

function TodayLoading() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]"
      role="status"
      aria-label="Loading Today"
    >
      <div className="grid gap-4 rounded-[var(--radius-panel)] border bg-quiet-panel p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
      <div className="grid gap-4 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      <span className="sr-only">Loading Today…</span>
    </div>
  );
}

function PlanningAddButton({
  item,
  pending,
  onAdd,
}: {
  item: Item;
  pending: boolean;
  onAdd: () => void;
}) {
  return (
    <Button
      type="button"
      size="compact"
      className="min-h-11 min-w-24 sm:min-h-8"
      disabled={pending}
      onClick={onAdd}
      aria-label={`Add ${item.title} to Today`}
    >
      <Plus aria-hidden="true" />
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

function TodayStatusButton({
  item,
  user,
  onChanged,
}: {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
}) {
  const nextStatus =
    item.status === Status.Done ? Status.NotStarted : Status.Done;
  const { changeStatus, error, saving } = useItemStatusMutation({
    item,
    user,
    onChanged,
  });

  return (
    <>
      <Button
        type="button"
        variant={item.status === Status.Done ? "secondary" : "primary"}
        size="compact"
        className="min-h-11 min-w-28 sm:min-h-8"
        disabled={saving}
        onClick={() => void changeStatus(nextStatus)}
        aria-label={
          item.status === Status.Done
            ? `Reopen ${item.title}`
            : `Mark ${item.title} done`
        }
      >
        {item.status === Status.Done ? (
          <RotateCcw aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {saving ? "Saving…" : item.status === Status.Done ? "Reopen" : "Done"}
      </Button>
      {error && (
        <span className="sr-only" role="alert">
          Couldn&apos;t update Item status.
        </span>
      )}
    </>
  );
}

function removePlanningItem(
  planning: DailyPlanning,
  itemId: Item["id"],
): DailyPlanning {
  return {
    searchResults: planning.searchResults.filter((item) => item.id !== itemId),
    suggestions: planning.suggestions.filter(
      (suggestion) => suggestion.item.id !== itemId,
    ),
  };
}

function removePlanningSuggestion(
  planning: DailyPlanning,
  itemId: Item["id"],
): DailyPlanning {
  return {
    ...planning,
    suggestions: planning.suggestions.filter(
      (suggestion) => suggestion.item.id !== itemId,
    ),
  };
}

function previousCalendarDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
