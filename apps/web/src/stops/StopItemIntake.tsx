import { useCallback, useEffect, useRef, useState } from "react";
import type { StopDetail, StopId, StopItemCandidate } from "@unshelf/shared";
import {
  addItemToStop,
  fetchStopItemCandidates,
  removeItemFromStop,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { TYPE_LABELS } from "../items/presentation";

interface StopItemIntakeProps {
  stopId: StopId;
  user: CurrentUser;
  onStopChanged: (stop: StopDetail) => void;
}

type AvailableCandidate = Extract<StopItemCandidate, { kind: "available" }>;

/**
 * The open Stop's server-searched Library intake.
 *
 * Each available row is an independent placement command. The last successful
 * row stays where the User acted long enough to offer Undo; the query and this
 * local row state survive the parent Stop detail refresh.
 */
export function StopItemIntake({
  stopId,
  user,
  onStopChanged,
}: StopItemIntakeProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StopItemCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [failedItemId, setFailedItemId] = useState<string | null>(null);
  const [moved, setMoved] = useState<AvailableCandidate | null>(null);
  const requestVersion = useRef(0);

  const search = useCallback(
    async (titleQuery: string) => {
      const version = ++requestVersion.current;
      setSearching(true);
      setSearchError(null);
      try {
        const found = await fetchStopItemCandidates(user, stopId, titleQuery);
        if (version === requestVersion.current) setResults(found);
      } catch (caught: unknown) {
        if (version === requestVersion.current) {
          setSearchError(String(caught));
        }
      } finally {
        if (version === requestVersion.current) setSearching(false);
      }
    },
    [stopId, user],
  );

  useEffect(() => {
    const delay = query ? 200 : 0;
    const timer = window.setTimeout(() => void search(query), delay);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const settleMovedRow = () => {
    if (!moved) return;
    setResults(
      (current) =>
        current?.filter((candidate) => candidate.id !== moved.id) ?? current,
    );
    setMoved(null);
  };

  async function add(candidate: AvailableCandidate) {
    settleMovedRow();
    setPendingItemId(candidate.id);
    setFailedItemId(null);
    try {
      const changed = await addItemToStop(user, stopId, candidate.id);
      onStopChanged(changed);
      setMoved(candidate);
    } catch {
      setFailedItemId(candidate.id);
    } finally {
      setPendingItemId(null);
    }
  }

  async function undo() {
    if (!moved) return;
    setPendingItemId(moved.id);
    setFailedItemId(null);
    try {
      const changed = await removeItemFromStop(user, stopId, moved.id);
      onStopChanged(changed);
      setMoved(null);
    } catch {
      setFailedItemId(moved.id);
    } finally {
      setPendingItemId(null);
    }
  }

  return (
    <section className="stop-intake" aria-labelledby={`stop-intake-${stopId}`}>
      <h3 id={`stop-intake-${stopId}`}>Add Items from your Library</h3>
      <label className="stop-intake__search">
        Search by title
        <input
          type="search"
          value={query}
          onChange={(event) => {
            requestVersion.current += 1;
            setMoved(null);
            setResults(null);
            setFailedItemId(null);
            setQuery(event.target.value);
          }}
        />
      </label>

      {searching && results === null && <p role="status">Searching Library…</p>}
      {searchError && (
        <div role="alert" className="surface-error">
          <p>Could not search your Library.</p>
          <button type="button" onClick={() => void search(query)}>
            Retry
          </button>
        </div>
      )}
      {!searchError && results?.length === 0 && (
        <div className="stop-intake__empty">
          <p>No matching Items in your Library.</p>
          {/* Future direct Capture can extend this empty state without changing the picker. */}
        </div>
      )}
      {!searchError && results && results.length > 0 && (
        <ul className="stop-intake__results">
          {results.map((candidate) => {
            const isMoved = moved?.id === candidate.id;
            const isPending = pendingItemId === candidate.id;
            const hasFailed = failedItemId === candidate.id;
            return (
              <li key={candidate.id}>
                <span>
                  <strong>{candidate.title}</strong>
                  <small>{TYPE_LABELS[candidate.type]}</small>
                </span>
                {isMoved ? (
                  <span className="stop-intake__result-action">
                    <span>Moved to In this Stop</span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void undo()}
                    >
                      {isPending ? "Undoing…" : "Undo"}
                    </button>
                    {hasFailed && (
                      <span role="alert">Could not undo. Try again.</span>
                    )}
                  </span>
                ) : candidate.kind === "conflict" ? (
                  <span className="stop-intake__conflict">
                    Already in {candidate.stop.name}
                  </span>
                ) : (
                  <span className="stop-intake__result-action">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void add(candidate)}
                    >
                      {isPending ? "Adding…" : "Add to this Stop"}
                    </button>
                    {hasFailed && (
                      <span role="alert">
                        Could not add this Item.{" "}
                        <button
                          type="button"
                          onClick={() => void add(candidate)}
                        >
                          Retry
                        </button>
                      </span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
