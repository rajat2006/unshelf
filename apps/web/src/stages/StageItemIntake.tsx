import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ItemId,
  StageDetail,
  StageId,
  StageItemCandidate,
} from "@unshelf/shared";
import {
  addItemToStage,
  fetchStageItemCandidates,
  removeItemFromStage,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { TYPE_LABELS } from "../items/presentation";

interface StageItemIntakeProps {
  stageId: StageId;
  user: CurrentUser;
  onStageChanged: (stage: StageDetail) => void;
}

type AvailableCandidate = Extract<StageItemCandidate, { kind: "available" }>;

/**
 * The open Stage's server-searched Library intake.
 *
 * Each available row is an independent placement command. The last successful
 * row stays where the User acted long enough to offer Undo; the query and this
 * local row state survive the parent Stage detail refresh.
 */
export function StageItemIntake({
  stageId,
  user,
  onStageChanged,
}: StageItemIntakeProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StageItemCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<ItemId | null>(null);
  const [failedItemId, setFailedItemId] = useState<ItemId | null>(null);
  const [moved, setMoved] = useState<AvailableCandidate | null>(null);
  const requestVersion = useRef(0);

  const search = useCallback(
    async (titleQuery: string) => {
      const version = ++requestVersion.current;
      setSearching(true);
      setSearchError(null);
      try {
        const found = await fetchStageItemCandidates(user, stageId, titleQuery);
        if (version === requestVersion.current) setResults(found);
      } catch (caught: unknown) {
        if (version === requestVersion.current) {
          setSearchError(String(caught));
        }
      } finally {
        if (version === requestVersion.current) setSearching(false);
      }
    },
    [stageId, user],
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
    if (pendingItemId) return;
    settleMovedRow();
    setPendingItemId(candidate.id);
    setFailedItemId(null);
    try {
      const changed = await addItemToStage(user, stageId, candidate.id);
      onStageChanged(changed);
      setMoved(candidate);
    } catch {
      setFailedItemId(candidate.id);
      const version = ++requestVersion.current;
      try {
        const reconciled = await fetchStageItemCandidates(user, stageId, query);
        if (version === requestVersion.current) setResults(reconciled);
      } catch {
        // Keep the placement failure local; the explicit search Retry owns reads.
      }
    } finally {
      setPendingItemId(null);
    }
  }

  async function undo() {
    if (!moved || pendingItemId) return;
    setPendingItemId(moved.id);
    setFailedItemId(null);
    try {
      const changed = await removeItemFromStage(user, stageId, moved.id);
      onStageChanged(changed);
      setMoved(null);
    } catch {
      setFailedItemId(moved.id);
    } finally {
      setPendingItemId(null);
    }
  }

  return (
    <section
      className="stage-intake"
      aria-labelledby={`stage-intake-${stageId}`}
    >
      <h3 id={`stage-intake-${stageId}`}>Add Items from your Library</h3>
      <label className="stage-intake__search">
        Search by title
        <input
          type="search"
          value={query}
          disabled={pendingItemId !== null}
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
        <div className="stage-intake__empty">
          <p>No matching Items in your Library.</p>
          {/* Future direct Capture can extend this empty state without changing the picker. */}
        </div>
      )}
      {!searchError && results && results.length > 0 && (
        <ul className="stage-intake__results">
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
                  <span className="stage-intake__result-action">
                    <span>Moved to In this Stage</span>
                    <button
                      type="button"
                      disabled={pendingItemId !== null}
                      onClick={() => void undo()}
                    >
                      {isPending ? "Undoing…" : "Undo"}
                    </button>
                    {hasFailed && (
                      <span role="alert">Could not undo. Try again.</span>
                    )}
                  </span>
                ) : candidate.kind === "conflict" ? (
                  <span className="stage-intake__conflict">
                    Already in {candidate.stage.name}
                  </span>
                ) : candidate.kind === "direct_conflict" ? (
                  <span className="stage-intake__conflict">
                    Already placed directly on this Learning Plan
                  </span>
                ) : (
                  <span className="stage-intake__result-action">
                    <button
                      type="button"
                      disabled={pendingItemId !== null}
                      onClick={() => void add(candidate)}
                    >
                      {isPending ? "Adding…" : "Add to this Stage"}
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
