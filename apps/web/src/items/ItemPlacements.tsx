import { useCallback, useEffect, useState } from "react";
import type { ItemId, ItemPlacementCatalog, StopId } from "@unshelf/shared";
import { addItemToStop, fetchItemPlacements, removeItemFromStop } from "../api";
import type { CurrentUser } from "../application-auth/types";

interface ItemPlacementsProps {
  itemId: ItemId;
  user: CurrentUser;
  onChanged?: () => void;
}

/**
 * One Item's Trail-qualified placement state and existing-Stop destinations.
 * The catalog is refreshed after every write, so a conflict or removal is
 * reconciled without leaving the route-owned sidebar.
 */
export function ItemPlacements({
  itemId,
  user,
  onChanged,
}: ItemPlacementsProps) {
  const [catalog, setCatalog] = useState<ItemPlacementCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(
    null,
  );

  const load = useCallback(async () => {
    setCatalog(await fetchItemPlacements(user, itemId));
  }, [itemId, user]);

  useEffect(() => {
    setCatalog(null);
    setError(null);
    setRetryAction(null);
    void load().catch((caught: unknown) => {
      setError(String(caught));
      setRetryAction(() => load);
    });
  }, [load]);

  const runPlacementMutation = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setRetryAction(null);
    try {
      await action();
      await load();
      onChanged?.();
    } catch (caught: unknown) {
      setError(String(caught));
      setRetryAction(() => action);
      try {
        await load();
      } catch {
        // Preserve the placement failure as the local action the User can retry.
      }
    } finally {
      setBusy(false);
    }
  };

  const place = (stopId: StopId) =>
    runPlacementMutation(async () => {
      await addItemToStop(user, stopId, itemId);
    });
  const remove = (stopId: StopId) =>
    runPlacementMutation(async () => {
      await removeItemFromStop(user, stopId, itemId);
    });

  if (!catalog) {
    return (
      <section
        className="item-placements"
        aria-labelledby="item-placements-title"
      >
        <h3 id="item-placements-title">Trail placements</h3>
        {!error ? (
          <p role="status">Loading Trail placements…</p>
        ) : (
          <PlacementError
            message={`Could not load Trail placements: ${error}`}
            retryAction={retryAction}
            onRetry={runPlacementMutation}
          />
        )}
      </section>
    );
  }

  const placed = catalog.trails.filter((trail) => trail.kind === "placed");

  return (
    <section
      className="item-placements"
      aria-labelledby="item-placements-title"
    >
      <h3 id="item-placements-title">Trail placements</h3>
      {placed.length === 0 ? (
        <p>Not on a Trail</p>
      ) : (
        <ul aria-label="Current Trail placements">
          {placed.map(({ trail, stop }) => (
            <li key={trail.id}>
              <span>
                {trail.name} · {stop.name}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(stop.id)}
                aria-label={`Remove from ${trail.name} · ${stop.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {catalog.trails.length === 0 ? (
        <p>No Trails available</p>
      ) : (
        <details>
          <summary>Add to Trail…</summary>
          <ul className="item-placement-destinations">
            {catalog.trails.map((state) => (
              <li key={state.trail.id}>
                <strong>{state.trail.name}</strong>
                {state.kind === "placed" ? (
                  <span>Already in {state.stop.name}</span>
                ) : state.stops.length === 0 ? (
                  <span>No existing Stops</span>
                ) : (
                  <select
                    aria-label={`Add to ${state.trail.name}`}
                    value=""
                    disabled={busy}
                    onChange={(event) =>
                      void place(event.target.value as StopId)
                    }
                  >
                    <option value="" disabled>
                      Choose a Stop…
                    </option>
                    {state.stops.map((stop) => (
                      <option key={stop.id} value={stop.id}>
                        {stop.name}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {busy && <p role="status">Updating placement…</p>}
      {error && (
        <PlacementError
          message={`Could not load or update this placement: ${error}`}
          retryAction={retryAction}
          onRetry={runPlacementMutation}
        />
      )}
    </section>
  );
}

interface PlacementErrorProps {
  message: string;
  retryAction: (() => Promise<void>) | null;
  onRetry: (action: () => Promise<void>) => Promise<void>;
}

function PlacementError({
  message,
  retryAction,
  onRetry,
}: PlacementErrorProps) {
  return (
    <div role="alert">
      <p>{message}</p>
      {retryAction && (
        <button type="button" onClick={() => void onRetry(retryAction)}>
          Retry
        </button>
      )}
    </div>
  );
}
