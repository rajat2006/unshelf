import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
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
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);

  const load = useCallback(async () => {
    setCatalog(await fetchItemPlacements(user, itemId));
  }, [itemId, user]);

  useEffect(() => {
    setCatalog(null);
    setError(null);
    setRetry(null);
    void load().catch((caught: unknown) => {
      setError(String(caught));
      setRetry(() => load);
    });
  }, [load]);

  const change = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setRetry(null);
    try {
      await action();
      await load();
      onChanged?.();
    } catch (caught: unknown) {
      setError(String(caught));
      setRetry(() => action);
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
    change(async () => {
      await addItemToStop(user, stopId, itemId);
    });
  const remove = (stopId: StopId) =>
    change(async () => {
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
          <div role="alert">
            <p>Could not load Trail placements: {error}</p>
            {retry && (
              <button type="button" onClick={() => void change(retry)}>
                Retry
              </button>
            )}
          </div>
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
        <p>
          Create a Trail from <Link to="/">Trails</Link> before placing this
          Item.
        </p>
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
        <div role="alert">
          <p>Could not load or update this placement: {error}</p>
          {retry && (
            <button type="button" onClick={() => void change(retry)}>
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
