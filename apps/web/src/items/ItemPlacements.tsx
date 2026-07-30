import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type {
  ItemId,
  ItemPlacementCatalog,
  PlacementStop,
  StopId,
  TrailId,
} from "@unshelf/shared";
import {
  addItemToStop,
  createStopWithItem,
  fetchItemPlacements,
  removeItemFromStop,
} from "../api";
import type { CurrentUser } from "../application-auth/types";

interface ItemPlacementsProps {
  itemId: ItemId;
  itemTitle: string;
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
  itemTitle,
  user,
  onChanged,
}: ItemPlacementsProps) {
  const [catalog, setCatalog] = useState<ItemPlacementCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<(() => Promise<void>) | null>(
    null,
  );
  const [creatingOn, setCreatingOn] = useState<TrailId | null>(null);
  const [newStopName, setNewStopName] = useState(itemTitle);
  const [lastCreated, setLastCreated] = useState<{
    trailId: TrailId;
    stop: PlacementStop;
  } | null>(null);

  const load = useCallback(async () => {
    const nextCatalog = await fetchItemPlacements(user, itemId);
    setCatalog(nextCatalog);
    return nextCatalog;
  }, [itemId, user]);

  useEffect(() => {
    setCatalog(null);
    setError(null);
    setRetryAction(null);
    void load().catch((caught: unknown) => {
      setError(String(caught));
      setRetryAction(() => async () => {
        await load();
      });
    });
  }, [load]);

  const runPlacementMutation = async (
    action: () => Promise<void>,
    options: {
      retryStillAppliesAfterReconciliation?: (
        reconciled: ItemPlacementCatalog,
      ) => boolean;
    } = {},
  ) => {
    setBusy(true);
    setError(null);
    setRetryAction(null);
    try {
      await action();
    } catch (caught: unknown) {
      setError(String(caught));
      let retryStillApplies = true;
      try {
        const reconciled = await load();
        retryStillApplies =
          options.retryStillAppliesAfterReconciliation?.(reconciled) ?? true;
      } catch {
        // Preserve the mutation failure as the local action the User can retry.
      }
      setRetryAction(retryStillApplies ? () => action : null);
    } finally {
      setBusy(false);
    }
  };

  const place = (stopId: StopId) =>
    runPlacementMutation(async () => {
      await addItemToStop(user, stopId, itemId);
      await load();
      onChanged?.();
    });
  const remove = (stopId: StopId) =>
    runPlacementMutation(async () => {
      await removeItemFromStop(user, stopId, itemId);
      await load();
      onChanged?.();
    });
  const create = (trailId: TrailId, name: string) =>
    runPlacementMutation(
      async () => {
        const stop = await createStopWithItem(user, itemId, { trailId, name });
        const placementStop = { id: stop.id, name: stop.name };
        setCatalog((current) =>
          current
            ? {
                ...current,
                trails: current.trails.map((state) =>
                  state.trail.id === trailId
                    ? {
                        kind: "placed",
                        trail: state.trail,
                        stop: placementStop,
                      }
                    : state,
                ),
              }
            : current,
        );
        setLastCreated({
          trailId,
          stop: placementStop,
        });
        setCreatingOn(null);
        onChanged?.();
        try {
          await load();
        } catch (caught: unknown) {
          setError(`Could not refresh Trail placements: ${String(caught)}`);
          setRetryAction(() => async () => {
            await load();
          });
        }
      },
      {
        retryStillAppliesAfterReconciliation: (reconciled) =>
          reconciled.trails.some(
            (state) => state.trail.id === trailId && state.kind === "available",
          ),
      },
    );

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
              <span className="item-placement-actions">
                {lastCreated?.trailId === trail.id &&
                  lastCreated.stop.id === stop.id && (
                    <Link to={`/trails/${trail.id}/stops/${stop.id}`}>
                      Open Stop
                    </Link>
                  )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(stop.id)}
                  aria-label={`Remove from ${trail.name} · ${stop.name}`}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {catalog.trails.length === 0 ? (
        <p>
          No Trails yet. <Link to="/">Create a Trail first</Link>.
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
                ) : (
                  <div className="item-placement-choice">
                    {state.stops.length > 0 && (
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
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setCreatingOn(state.trail.id);
                        setNewStopName(itemTitle);
                      }}
                    >
                      New Stop
                    </button>
                    {creatingOn === state.trail.id && (
                      <NewStopForm
                        trailName={state.trail.name}
                        name={newStopName}
                        existingStops={state.stops}
                        busy={busy}
                        onNameChange={setNewStopName}
                        onCancel={() => setCreatingOn(null)}
                        onSubmit={(name) => void create(state.trail.id, name)}
                      />
                    )}
                  </div>
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

interface NewStopFormProps {
  trailName: string;
  name: string;
  existingStops: PlacementStop[];
  busy: boolean;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}

function NewStopForm({
  trailName,
  name,
  existingStops,
  busy,
  onNameChange,
  onCancel,
  onSubmit,
}: NewStopFormProps) {
  const trimmedName = name.trim();
  const repeatsName = existingStops.some((stop) => stop.name === trimmedName);

  return (
    <form
      className="item-new-stop-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmedName) onSubmit(trimmedName);
      }}
    >
      <label>
        Stop name on {trailName}
        <input
          autoFocus
          required
          value={name}
          disabled={busy}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>
      {repeatsName && (
        <p role="status">
          A Stop on this Trail already has this name. You can still create
          another.
        </p>
      )}
      <span>
        <button type="submit" disabled={busy || !trimmedName}>
          Create Stop
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
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
