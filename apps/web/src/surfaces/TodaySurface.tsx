import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveItemCompletion,
  type DailyFocus,
  type Item,
} from "@unshelf/shared";
import {
  addItemToToday,
  fetchAll,
  fetchToday,
  removeItemFromToday,
} from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { ItemRow } from "../items/ItemRow";

type TodayState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; focus: DailyFocus; library: Item[] };

/** The current editable Daily Focus and its explicit Library selection seam. */
export function TodaySurface() {
  const user = useCurrentUser();
  const [state, setState] = useState<TodayState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [mutationError, setMutationError] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [focus, library] = await Promise.all([
        fetchToday(user),
        fetchAll(user),
      ]);
      setState({ status: "ready", focus, library });
    } catch {
      setState({ status: "error" });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = useMemo(() => {
    if (state.status !== "ready") return [];
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const selected = new Set(state.focus.entries.map((entry) => entry.item.id));
    return state.library.filter(
      (item) =>
        !selected.has(item.id) &&
        [item.title, item.source, ...item.labels.map((label) => label.name)]
          .filter((value): value is string => value !== null)
          .some((value) => value.toLocaleLowerCase().includes(normalized)),
    );
  }, [query, state]);

  const add = async (item: Item) => {
    setMutationError(false);
    try {
      const focus = await addItemToToday(user, item.id);
      setState((current) =>
        current.status === "ready" ? { ...current, focus } : current,
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
        entry.item.id === changed.id ? { ...entry, item: changed } : entry,
      );
      return {
        ...current,
        focus: {
          ...current.focus,
          entries,
          ...deriveItemCompletion(entries.map((entry) => entry.item)),
        },
        library: current.library.map((item) =>
          item.id === changed.id ? changed : item,
        ),
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
                    detailBackgroundPath={
                      origin
                        ? origin.stage
                          ? `/plans/${origin.learningPlan.id}/stages/${origin.stage.id}`
                          : `/plans/${origin.learningPlan.id}`
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
            <h2 id="today-planning-heading">Choose from your Library</h2>
            <label>
              <span>Find a Library Item</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {query.trim() && candidates.length === 0 ? (
              <p className="quiet-copy">No unselected Items match.</p>
            ) : null}
            {candidates.length > 0 && (
              <ul className="today-planning__results">
                {candidates.map((item) => (
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
            )}
          </section>
          {mutationError && (
            <p role="alert">Couldn&apos;t update Today. Try again.</p>
          )}
        </>
      )}
    </section>
  );
}
