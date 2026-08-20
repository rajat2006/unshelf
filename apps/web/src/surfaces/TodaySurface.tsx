import { useCallback, useEffect, useRef, useState } from "react";
import {
  deriveItemCompletion,
  Status,
  type DailyFocus,
  type DailyPlanning,
  type Item,
} from "@unshelf/shared";
import { BookOpen, History, Plus, Search, Trash2, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addItemToToday,
  fetchDailyPlanning,
  fetchToday,
  removeItemFromToday,
  suppressDailyPlanningItem,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { completionPercentage } from "../presentation/progress";
import {
  itemDetailRouteState,
  planItemBackgroundLocation,
} from "../items/item-route-state";
import { ItemDoneToggle } from "../items/ItemDoneToggle";
import { ItemSummary } from "../items/ItemSummary";
import { STATUS_LABELS } from "../items/presentation";
import { useCaptureListener } from "../shell/useCaptureListener";

type TodayState =
  | { status: "loading" }
  | {
      status: "focus-error";
      planning: DailyPlanning;
    }
  | {
      status: "ready";
      focus: DailyFocus;
      planning: DailyPlanning;
    };

type PendingActionKind = "add" | "remove" | "suppress";

function pendingActionKey({
  kind,
  itemId,
}: {
  kind: PendingActionKind;
  itemId: Item["id"];
}): string {
  return `${kind}:${itemId}`;
}

function mergeConfirmedAdd({
  current,
  confirmed,
  itemId,
}: {
  current: DailyFocus;
  confirmed: DailyFocus;
  itemId: Item["id"];
}): DailyFocus {
  if (current.entries.some((entry) => entry.item.id === itemId)) return current;
  const addedEntry = confirmed.entries.find(
    (entry) => entry.item.id === itemId,
  );
  if (!addedEntry) return current;
  const entries = [...current.entries, addedEntry];
  return {
    ...current,
    entries,
    ...deriveItemCompletion(entries.map((entry) => entry.item)),
  };
}

/** The current editable Daily Focus and its explicit Library selection seam. */
export function TodaySurface() {
  const user = useCurrentUser();
  const location = useLocation();
  const [state, setState] = useState<TodayState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [mutationError, setMutationError] = useState(false);
  const [planningError, setPlanningError] = useState(false);
  const [planningAvailable, setPlanningAvailable] = useState(false);
  const [focusRetrying, setFocusRetrying] = useState(false);
  const [planningRetrying, setPlanningRetrying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const skipPlanningRefresh = useRef(false);
  const queryRef = useRef(query);
  const planningRequestNumber = useRef(0);
  const [pendingActions, setPendingActions] = useState<Set<string>>(
    () => new Set(),
  );
  queryRef.current = query;

  // Search, retry, mutation replenishment, and full-load invalidation share one
  // request generation; only the latest request may publish planning data or
  // failure after newer intent has superseded it.
  const startPlanningRequest = useCallback(() => {
    const requestNumber = ++planningRequestNumber.current;
    return {
      request: fetchDailyPlanning(user, {
        query: queryRef.current.trim() || undefined,
      }),
      isCurrent: () => requestNumber === planningRequestNumber.current,
    };
  }, [user]);

  const updatePendingAction = ({
    kind,
    itemId,
    pending,
  }: {
    kind: PendingActionKind;
    itemId: Item["id"];
    pending: boolean;
  }) => {
    const key = pendingActionKey({ kind, itemId });
    setPendingActions((current) => {
      const updated = new Set(current);
      if (pending) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  };

  const isActionPending = ({
    kind,
    itemId,
  }: {
    kind: PendingActionKind;
    itemId: Item["id"];
  }) => pendingActions.has(pendingActionKey({ kind, itemId }));

  const applyPlanningReplenishment = ({
    planning,
    isCurrent,
  }: {
    planning: DailyPlanning;
    isCurrent: boolean;
  }) => {
    if (!isCurrent) return;
    setState((current) => {
      if (current.status === "loading") return current;
      return { ...current, planning };
    });
    setPlanningError(false);
    setPlanningAvailable(true);
  };

  const replenishPlanning = async (): Promise<void> => {
    const planningRequest = startPlanningRequest();
    try {
      const planning = await planningRequest.request;
      applyPlanningReplenishment({
        planning,
        isCurrent: planningRequest.isCurrent(),
      });
    } catch {
      if (planningRequest.isCurrent()) setPlanningError(true);
    }
  };

  const load = useCallback(async () => {
    planningRequestNumber.current += 1;
    setState({ status: "loading" });
    const [focus, planning] = await Promise.allSettled([
      fetchToday(user),
      fetchDailyPlanning(user, {}),
    ]);
    skipPlanningRefresh.current = true;
    setPlanningError(planning.status === "rejected");
    setPlanningAvailable(planning.status === "fulfilled");
    const loadedPlanning =
      planning.status === "fulfilled"
        ? planning.value
        : { searchResults: [], suggestions: [] };
    if (focus.status === "rejected") {
      setState({
        status: "focus-error",
        planning: loadedPlanning,
      });
      return;
    }
    setState({
      status: "ready",
      focus: focus.value,
      planning: loadedPlanning,
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
    const planningRequest = startPlanningRequest();
    try {
      const planning = await planningRequest.request;
      if (!planningRequest.isCurrent()) return;
      setState((value) =>
        value.status === "loading" ? value : { ...value, planning },
      );
      setPlanningError(false);
      setPlanningAvailable(true);
    } catch {
      if (planningRequest.isCurrent()) setPlanningError(true);
    } finally {
      setPlanningRetrying(false);
    }
  }, [startPlanningRequest]);

  useEffect(() => {
    if (state.status === "loading") return;
    if (skipPlanningRefresh.current) {
      skipPlanningRefresh.current = false;
      if (query.trim() === "") {
        return;
      }
    }
    let isActive = true;
    setPlanningError(false);
    const planningRequest = startPlanningRequest();
    void planningRequest.request
      .then((planning) => {
        if (isActive && planningRequest.isCurrent()) {
          setPlanningError(false);
          setState((value) =>
            value.status === "loading" ? value : { ...value, planning },
          );
          setPlanningAvailable(true);
        }
      })
      .catch(() => {
        if (isActive && planningRequest.isCurrent()) setPlanningError(true);
      });
    return () => {
      isActive = false;
    };
  }, [query, startPlanningRequest, state.status]);

  const add = async (
    item: Item,
    origin?: Parameters<typeof addItemToToday>[2],
  ) => {
    setMutationError(false);
    setAnnouncement("");
    updatePendingAction({ kind: "add", itemId: item.id, pending: true });
    try {
      const focus = await addItemToToday(user, item.id, origin);
      // Adds may resolve out of order. Merge this server-confirmed Item into the
      // current Daily Focus so an older response cannot erase another confirmed
      // Add.
      setState((current) =>
        current.status === "loading"
          ? current
          : {
              ...current,
              status: "ready",
              focus:
                current.status === "ready"
                  ? mergeConfirmedAdd({
                      current: current.focus,
                      confirmed: focus,
                      itemId: item.id,
                    })
                  : focus,
              planning: removePlanningItem(current.planning, item.id),
            },
      );
      setAnnouncement(`Added ${item.title} to Today`);
      await replenishPlanning();
    } catch {
      setMutationError(true);
    } finally {
      updatePendingAction({ kind: "add", itemId: item.id, pending: false });
    }
  };

  const suppress = async (item: Item) => {
    setMutationError(false);
    setAnnouncement("");
    updatePendingAction({ kind: "suppress", itemId: item.id, pending: true });
    try {
      await suppressDailyPlanningItem(user, item.id);
      setState((current) =>
        current.status === "loading"
          ? current
          : {
              ...current,
              planning: removePlanningSuggestion(current.planning, item.id),
            },
      );
      setAnnouncement(`Set Not today for ${item.title}`);
      await replenishPlanning();
    } catch {
      setMutationError(true);
    } finally {
      updatePendingAction({
        kind: "suppress",
        itemId: item.id,
        pending: false,
      });
    }
  };

  const remove = async (focus: DailyFocus, item: Item) => {
    setMutationError(false);
    setAnnouncement("");
    updatePendingAction({ kind: "remove", itemId: item.id, pending: true });
    try {
      const updated = await removeItemFromToday(user, focus.id, item.id);
      setState((current) =>
        current.status === "ready" ? { ...current, focus: updated } : current,
      );
      setAnnouncement(`Removed ${item.title} from Today`);
    } catch {
      setMutationError(true);
    } finally {
      updatePendingAction({ kind: "remove", itemId: item.id, pending: false });
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
      className="mx-auto grid w-full max-w-5xl min-w-0 gap-6"
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
          <p className="m-0 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Choose a small working set. Suggestions can help, but only you add
            an Item to Daily Focus.
          </p>
        </div>
        {state.status === "ready" && (
          <div className="grid gap-2" aria-label="Today progress">
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
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.55fr)] lg:items-start">
            <section
              className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border bg-card"
              aria-label="Today's daily ledger"
            >
              <section
                className="grid min-w-0 gap-4 p-4 sm:p-6"
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
                      loading={focusRetrying}
                      loadingLabel="Retrying…"
                      onClick={() => void retryFocus()}
                    >
                      Retry
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
                          Search the Library or consider a Suggestion below.
                        </p>
                      </div>
                    ) : (
                      <ol className="grid list-none overflow-hidden border-t p-0">
                        {state.focus.entries.map(({ item, origin }, index) => (
                          <li
                            key={item.id}
                            className="border-b last:border-b-0"
                          >
                            <article className="flex min-w-0 flex-wrap items-center gap-3 py-4 sm:flex-nowrap">
                              <span className="w-7 shrink-0 font-serif text-lg text-muted-foreground">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span
                                className={`size-2.5 shrink-0 rounded-full border ${item.status === Status.Done ? "border-status-completed bg-status-completed" : item.status === Status.InProgress ? "border-status-progress bg-status-progress" : "border-muted-foreground"}`}
                                aria-hidden="true"
                              />
                              <span className="sr-only">
                                {STATUS_LABELS[item.status]}
                              </span>
                              <div className="min-w-0 flex-1">
                                <Link
                                  className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                                  to={`/items/${item.id}`}
                                  state={itemDetailRouteState(
                                    origin
                                      ? planItemBackgroundLocation({
                                          learningPlanId:
                                            origin.learningPlan.id,
                                          ...(origin.stage
                                            ? { stageId: origin.stage.id }
                                            : {}),
                                        })
                                      : location,
                                  )}
                                >
                                  {item.title}
                                </Link>
                                <p className="mt-1 mb-0 text-xs text-muted-foreground">
                                  {origin
                                    ? `From ${origin.learningPlan.name}${origin.stage ? ` · ${origin.stage.name}` : ""}`
                                    : "From Library"}
                                </p>
                              </div>
                              <div className="ml-auto flex flex-wrap gap-2">
                                <ItemDoneToggle
                                  item={item}
                                  user={user}
                                  onChanged={replaceItem}
                                />
                                <Button
                                  type="button"
                                  variant="quiet"
                                  size="compact"
                                  className="min-h-11 min-w-28 sm:min-h-8"
                                  loading={isActionPending({
                                    kind: "remove",
                                    itemId: item.id,
                                  })}
                                  loadingLabel="Removing…"
                                  onClick={() => void remove(state.focus, item)}
                                  aria-label={`Remove ${item.title} from Today`}
                                >
                                  <Trash2 aria-hidden="true" />
                                  Remove
                                </Button>
                              </div>
                            </article>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </section>

              <section
                className="grid gap-4 border-t-2 border-dashed bg-quiet-panel/55 p-4 sm:p-6"
                aria-label="Suggestions"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="m-0 text-xs font-semibold tracking-[0.1em] text-primary uppercase">
                      Not in Daily Focus
                    </p>
                    <h2 className="mt-1 mb-0 font-serif text-xl font-medium">
                      Consider next
                    </h2>
                  </div>
                  {planningAvailable && (
                    <span className="text-xs text-muted-foreground">
                      {state.planning.suggestions.length} of 3 visible
                    </span>
                  )}
                </div>

                {!planningAvailable ? (
                  <div className="rounded-[var(--radius-card)] border border-dashed p-4 text-sm text-muted-foreground">
                    Suggestions unavailable
                  </div>
                ) : state.planning.suggestions.length === 0 ? (
                  <div className="rounded-[var(--radius-card)] border border-dashed p-4 text-sm text-muted-foreground">
                    No Suggestions are current for Today.
                  </div>
                ) : (
                  <ol className="grid list-none gap-1 p-0">
                    {state.planning.suggestions.map((suggestion, index) => (
                      <li key={suggestion.item.id}>
                        <article className="grid gap-3 rounded-[var(--radius-card)] px-2 py-3 hover:bg-background sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
                          <span className="font-serif text-lg text-muted-foreground">
                            +{index + 1}
                          </span>
                          <div className="min-w-0">
                            <h3 className="m-0 truncate text-sm leading-snug font-semibold">
                              <Link
                                className="text-foreground underline-offset-4 hover:text-primary hover:underline"
                                to={`/items/${suggestion.item.id}`}
                                state={itemDetailRouteState(location)}
                              >
                                {suggestion.item.title}
                              </Link>
                            </h3>
                            <p className="mt-1 mb-0 text-xs leading-relaxed text-muted-foreground">
                              {suggestion.explanation}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <PlanningAddButton
                              item={suggestion.item}
                              pending={isActionPending({
                                kind: "add",
                                itemId: suggestion.item.id,
                              })}
                              onAdd={() => void add(suggestion.item)}
                            />
                            <Button
                              type="button"
                              variant="quiet"
                              size="compact"
                              className="min-h-11 min-w-28 sm:min-h-8"
                              loading={isActionPending({
                                kind: "suppress",
                                itemId: suggestion.item.id,
                              })}
                              loadingLabel="Updating…"
                              onClick={() => void suppress(suggestion.item)}
                              aria-label={`Not today for ${suggestion.item.title}`}
                            >
                              <X aria-hidden="true" />
                              Not today
                            </Button>
                          </div>
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </section>

            <section aria-label="Daily Planning">
              <aside
                className="grid min-w-0 gap-4 rounded-[var(--radius-panel)] border bg-card p-4 sm:p-5"
                aria-label="Library search"
              >
                <div className="grid gap-1">
                  <div className="flex items-center gap-2 text-primary">
                    <BookOpen className="size-4" aria-hidden="true" />
                    <p className="m-0 text-xs font-semibold tracking-[0.1em] uppercase">
                      Library
                    </p>
                  </div>
                  <h2
                    id="today-planning-heading"
                    className="mt-1 mb-0 font-serif text-xl font-medium"
                  >
                    Add a known Item
                  </h2>
                  <p className="mt-1 mb-0 text-sm leading-relaxed text-muted-foreground">
                    Search is the deliberate path around Suggestions.
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
                      loading={planningRetrying}
                      loadingLabel="Retrying…"
                      onClick={() => void retryPlanning()}
                    >
                      Retry
                    </Button>
                  </Alert>
                )}

                <Field>
                  <FieldLabel className="sr-only" htmlFor="today-item-search">
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
                      placeholder="Search title, Source, or Labels…"
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

                {planningAvailable &&
                  query.trim() &&
                  state.planning.searchResults.length === 0 && (
                    <div className="rounded-[var(--radius-card)] border border-dashed p-4 text-sm text-muted-foreground">
                      No unselected Items match.
                    </div>
                  )}
                {state.planning.searchResults.length > 0 && (
                  <section
                    className="grid gap-3"
                    aria-label="Item search results"
                  >
                    <h3 className="m-0 text-sm font-semibold">
                      Search results
                    </h3>
                    <ul className="grid list-none overflow-hidden rounded-[var(--radius-card)] border p-0">
                      {state.planning.searchResults.map((item) => (
                        <li key={item.id} className="border-b last:border-b-0">
                          <ItemSummary
                            item={item}
                            presentation="catalog"
                            className="bg-background p-3 sm:grid-cols-1"
                            actions={
                              <PlanningAddButton
                                item={item}
                                pending={isActionPending({
                                  kind: "add",
                                  itemId: item.id,
                                })}
                                onAdd={() => void add(item)}
                              />
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <p className="m-0 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                  Only Add changes Daily Focus. Not today applies only to
                  Suggestions on this date.
                </p>
              </aside>
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
      className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.65fr)]"
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
      loading={pending}
      loadingLabel="Adding…"
      onClick={onAdd}
      aria-label={`Add ${item.title} to Today`}
    >
      <Plus aria-hidden="true" />
      Add
    </Button>
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
