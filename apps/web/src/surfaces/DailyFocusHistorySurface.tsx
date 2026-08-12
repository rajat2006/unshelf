import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Status, type DailyFocus, type ItemId } from "@unshelf/shared";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { addItemToToday, fetchDailyFocusHistory } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { STATUS_LABELS } from "../items/presentation";
import { itemDetailRouteState } from "../items/item-route-state";

type HistoryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; focus: DailyFocus };

/** One elapsed Daily Focus: frozen evidence with explicit reconsideration only. */
export function DailyFocusHistorySurface({
  selectedDate,
}: {
  selectedDate?: string;
} = {}) {
  const user = useCurrentUser();
  const { date: routeDate = "" } = useParams();
  const date = selectedDate ?? routeDate;
  const location = useLocation();
  const navigate = useNavigate();
  const [browseDate, setBrowseDate] = useState(date);
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [addedItemIds, setAddedItemIds] = useState<Set<ItemId>>(new Set());
  const [mutationError, setMutationError] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({
        status: "ready",
        focus: await fetchDailyFocusHistory(user, date),
      });
    } catch {
      setState({ status: "error" });
    }
  }, [date, user]);

  useEffect(() => {
    setBrowseDate(date);
    setAddedItemIds(new Set());
    void load();
  }, [date, load]);

  async function reconsider(itemId: ItemId) {
    setMutationError(false);
    try {
      await addItemToToday(user, itemId);
      setAddedItemIds((current) => new Set(current).add(itemId));
    } catch {
      setMutationError(true);
    }
  }

  function browse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (browseDate) {
      void navigate({
        pathname: `/today/${browseDate}`,
        search: location.search,
      });
    }
  }

  return (
    <section
      className="today-surface"
      aria-labelledby="daily-focus-history-heading"
    >
      <h1 id="daily-focus-history-heading">Daily Focus history</h1>
      <div className="daily-focus-history__navigation">
        <Link to={{ pathname: "/today", search: location.search }}>
          Go to Today
        </Link>
        <form onSubmit={browse}>
          <label>
            <span>Daily Focus date</span>
            <input
              type="date"
              value={browseDate}
              onChange={(event) => setBrowseDate(event.target.value)}
            />
          </label>
          <button type="submit">View date</button>
        </form>
      </div>
      {state.status === "loading" && <p role="status">Loading history…</p>}
      {state.status === "error" && (
        <div role="alert">
          <p>Daily Focus unavailable</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <p className="quiet-copy">{state.focus.date}</p>
          <p className="today-surface__completion">
            {state.focus.done} of {state.focus.total} done at day end
          </p>
          <section aria-label={`Daily Focus for ${state.focus.date}`}>
            {state.focus.entries.length === 0 ? (
              <p className="quiet-copy">Nothing was selected.</p>
            ) : (
              <ul className="daily-focus-history__entries">
                {state.focus.entries.map(({ item, snapshot, origin }) => (
                  <li key={item.id}>
                    <Link
                      to={`/items/${item.id}`}
                      state={itemDetailRouteState(location)}
                    >
                      {item.title}
                    </Link>
                    <span>{STATUS_LABELS[snapshot.status]}</span>
                    {snapshot.partPercentage !== null && (
                      <span>{snapshot.partPercentage}% of Parts complete</span>
                    )}
                    {origin && (
                      <span className="quiet-copy">
                        From {origin.learningPlan.name}
                        {origin.stage ? ` · ${origin.stage.name}` : ""}
                      </span>
                    )}
                    {snapshot.status !== Status.Done &&
                      (addedItemIds.has(item.id) ? (
                        <span>Added to Today</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void reconsider(item.id)}
                          aria-label={`Add ${item.title} to Today`}
                        >
                          Add to Today
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {mutationError && (
            <p role="alert">Couldn&apos;t add this Item to Today. Try again.</p>
          )}
        </>
      )}
    </section>
  );
}
