import { useCallback, useEffect, useState } from "react";
import {
  deriveItemCompletion,
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
        plans: plans.filter((plan) => plan.archivedAt === null),
      });
    } catch {
      setState({ status: "error" });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return (
    <section className="today-surface" aria-labelledby="today-heading">
      <h1 id="today-heading">Today</h1>
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
          <p className="quiet-copy">{state.focus.date}</p>
          <Link
            to={{
              pathname: `/today/${previousCalendarDate(state.focus.date)}`,
              search: location.search,
            }}
          >
            Browse yesterday
          </Link>
          <p className="today-surface__completion">
            {state.focus.done} of {state.focus.total} done
          </p>
          <section aria-label="Today's Daily Focus">
            {state.focus.entries.length === 0 ? (
              <p className="quiet-copy">Choose what deserves your attention.</p>
            ) : (
              <ul className="library-list">
                {state.focus.entries.map(({ item, origin }) => (
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
              </ul>
            )}
          </section>
          <section
            className="today-planning"
            aria-labelledby="today-planning-heading"
          >
            <h2 id="today-planning-heading">Plan Today</h2>
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
            <section aria-label="Suggestions">
              <h3>Suggestions</h3>
              {state.planning.suggestions.length === 0 ? (
                <p className="quiet-copy">No suggestions for these inputs.</p>
              ) : (
                <ul className="today-planning__results">
                  {state.planning.suggestions.map((suggestion) => (
                    <li key={suggestion.item.id}>
                      <div>
                        <strong>{suggestion.item.title}</strong>
                        <p className="quiet-copy">{suggestion.explanation}</p>
                      </div>
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
                                        stageId: suggestion.origin.stage.id,
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
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
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

function previousCalendarDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
