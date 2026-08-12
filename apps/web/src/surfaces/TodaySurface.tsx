import { useCallback, useEffect, useState } from "react";
import {
  deriveItemCompletion,
  Status,
  type DailyFocus,
  type DailyPlanning,
  type Item,
  type LearningPlan,
  type LearningPlanId,
} from "@unshelf/shared";
import { Link, useLocation } from "react-router";
import {
  addItemToToday,
  fetchDailyPlanning,
  fetchLearningPlans,
  fetchToday,
  removeItemFromToday,
  suppressDailyPlanningItem,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemRow } from "../items/ItemRow";
import { planItemBackgroundLocation } from "../items/item-route-state";
import { useCaptureListener } from "../shell/useCaptureListener";

type TodayState =
  | { status: "loading" }
  | { status: "error" }
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

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [focus, planning, plans] = await Promise.all([
        fetchToday(user),
        fetchDailyPlanning(user, {}),
        fetchLearningPlans(user),
      ]);
      setState({
        status: "ready",
        focus,
        planning,
        plans,
      });
    } catch {
      setState({ status: "error" });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);
  useCaptureListener(load);

  useEffect(() => {
    if (state.status !== "ready") return;
    let isActive = true;
    void fetchDailyPlanning(user, {
      query: query.trim() || undefined,
      intention: intention.trim() || undefined,
      learningPlanId,
    })
      .then((planning) => {
        if (isActive) {
          setState((value) =>
            value.status === "ready" ? { ...value, planning } : value,
          );
        }
      })
      .catch(() => {
        if (isActive) setMutationError(true);
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
    try {
      const focus = await addItemToToday(user, item.id, origin);
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              focus,
              planning: removePlanningItem(current.planning, item.id),
            }
          : current,
      );
    } catch {
      setMutationError(true);
    }
  };

  const suppress = async (item: Item) => {
    setMutationError(false);
    try {
      await suppressDailyPlanningItem(user, item.id);
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              planning: removePlanningSuggestion(current.planning, item.id),
            }
          : current,
      );
    } catch {
      setMutationError(true);
    }
  };

  const remove = async (focus: DailyFocus, item: Item) => {
    setMutationError(false);
    try {
      const updated = await removeItemFromToday(user, focus.id, item.id);
      setState((current) =>
        current.status === "ready" ? { ...current, focus: updated } : current,
      );
    } catch {
      setMutationError(true);
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
  };
  const currentItemIndex =
    state.status === "ready" ? currentDailyFocusIndex(state.focus) : -1;

  return (
    <section className="today-surface" aria-labelledby="today-heading">
      <header className="editorial-heading today-surface__heading">
        <div>
          <p className="editorial-eyebrow">Daily Focus</p>
          <h1 id="today-heading">Today</h1>
          <p className="editorial-intro">
            A deliberate working set for what deserves your attention now.
          </p>
        </div>
        {state.status === "ready" && (
          <div className="today-progress" aria-label="Today progress">
            <strong>
              {state.focus.done}/{state.focus.total}
            </strong>
            <span>Items done</span>
            <div aria-hidden="true">
              <span
                style={{
                  width: `${state.focus.total === 0 ? 0 : (state.focus.done / state.focus.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>
      {state.status === "loading" && <p role="status">Loading Today…</p>}
      {state.status === "error" && (
        <div role="alert">
          <p>Couldn&apos;t load Today</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="today-layout">
            <section className="today-agenda" aria-label="Today's Daily Focus">
              <div className="today-agenda__heading">
                <div>
                  <p className="editorial-eyebrow">Your agenda</p>
                  <h2>{state.focus.date}</h2>
                </div>
                <Link
                  className="quiet-link"
                  to={{
                    pathname: `/today/${previousCalendarDate(state.focus.date)}`,
                    search: location.search,
                  }}
                >
                  Browse yesterday
                </Link>
              </div>
              {state.focus.entries.length === 0 ? (
                <div className="today-agenda__empty">
                  <p>Choose what deserves your attention.</p>
                  <span>Use Daily Planning to build a small working set.</span>
                </div>
              ) : (
                <ol className="today-agenda__list">
                  {state.focus.entries.map(({ item, origin }, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      user={user}
                      onChanged={replaceItem}
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
                    >
                      {index === currentItemIndex && (
                        <span className="today-agenda__current">
                          Current focus
                        </span>
                      )}
                      <span className="today-agenda__number" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {origin && (
                        <span className="quiet-copy">
                          From {origin.learningPlan.name}
                          {origin.stage ? ` · ${origin.stage.name}` : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(state.focus, item)}
                        aria-label={`Remove ${item.title} from Today`}
                      >
                        Remove
                      </button>
                    </ItemRow>
                  ))}
                </ol>
              )}
            </section>
            <section
              className="today-planning"
              aria-labelledby="today-planning-heading"
            >
              <p className="editorial-eyebrow">Shape your day</p>
              <h2 id="today-planning-heading">Plan Today</h2>
              <p className="today-planning__intro">
                Search the Library or describe your intention. Only Add changes
                Today.
              </p>
              <label>
                <span>Find an Item</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                <span>Learning intention</span>
                <input
                  type="text"
                  value={intention}
                  onChange={(event) => setIntention(event.target.value)}
                  placeholder="What do you want to learn?"
                />
              </label>
              <label>
                <span>Learning Plan lens</span>
                <select
                  value={learningPlanId ?? ""}
                  onChange={(event) =>
                    setLearningPlanId(
                      event.target.value
                        ? (event.target.value as LearningPlanId)
                        : undefined,
                    )
                  }
                >
                  <option value="">All Learning Plans</option>
                  {state.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              {query.trim() && state.planning.searchResults.length === 0 ? (
                <p className="quiet-copy">No unselected Items match.</p>
              ) : null}
              {state.planning.searchResults.length > 0 && (
                <section aria-label="Item search results">
                  <ul className="today-planning__results">
                    {state.planning.searchResults.map((item) => (
                      <li key={item.id}>
                        <span>{item.title}</span>
                        <button
                          type="button"
                          onClick={() => void add(item)}
                          aria-label={`Add ${item.title} to Today`}
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section aria-label="Recently added">
                <div className="today-planning__section-heading">
                  <h3>Recently added</h3>
                  <span>Newest uncommitted Items</span>
                </div>
                {recentPlanningSuggestions(state.planning).length === 0 ? (
                  <p className="quiet-copy">No recent Items to suggest.</p>
                ) : (
                  <ul className="today-planning__results">
                    {recentPlanningSuggestions(state.planning).map(
                      (suggestion) => (
                        <li key={suggestion.item.id}>
                          <div>
                            <strong>{suggestion.item.title}</strong>
                            <p className="quiet-copy">
                              {suggestion.explanation}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void add(suggestion.item)}
                            aria-label={`Add ${suggestion.item.title} to Today`}
                          >
                            Add
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </section>
              <section aria-label="Suggestions">
                <div className="today-planning__section-heading">
                  <h3>Suggested for you</h3>
                  <span>Explained, never automatic</span>
                </div>
                {generalPlanningSuggestions(state.planning).length === 0 ? (
                  <p className="quiet-copy">No suggestions for these inputs.</p>
                ) : (
                  <ul className="today-planning__results">
                    {generalPlanningSuggestions(state.planning).map(
                      (suggestion) => (
                        <li key={suggestion.item.id}>
                          <div>
                            <strong>{suggestion.item.title}</strong>
                            <p className="quiet-copy">
                              {suggestion.explanation}
                            </p>
                          </div>
                          <div className="today-planning__actions">
                            <button
                              type="button"
                              onClick={() =>
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
                              aria-label={`Add ${suggestion.item.title} to Today`}
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => void suppress(suggestion.item)}
                              aria-label={`Not today for ${suggestion.item.title}`}
                            >
                              Not today
                            </button>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </section>
            </section>
          </div>
          {mutationError && (
            <p role="alert">Couldn&apos;t update Today. Try again.</p>
          )}
        </>
      )}
    </section>
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

function recentPlanningSuggestions(planning: DailyPlanning) {
  return planning.suggestions.filter(
    (suggestion) => suggestion.signal === "recently_captured_uncommitted",
  );
}

function generalPlanningSuggestions(planning: DailyPlanning) {
  const recentIds = new Set(
    recentPlanningSuggestions(planning).map((suggestion) => suggestion.item.id),
  );
  return planning.suggestions.filter(
    (suggestion) => !recentIds.has(suggestion.item.id),
  );
}

function previousCalendarDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function currentDailyFocusIndex(focus: DailyFocus): number {
  const inProgress = focus.entries.findIndex(
    ({ item }) => item.status === Status.InProgress,
  );
  return inProgress >= 0
    ? inProgress
    : focus.entries.findIndex(({ item }) => item.status !== Status.Done);
}
