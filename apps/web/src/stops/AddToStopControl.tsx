import { useState } from "react";
import type { Item, Stop, StopDetail, StopId } from "@unshelf/shared";
import { addItemToStop } from "../api";
import type { CurrentUser } from "../application-auth/types";

interface AddToStopControlProps {
  item: Item;
  stops: Stop[];
  placedStops: StopDetail[];
  user: CurrentUser;
  onStopChanged: (stop: StopDetail) => void;
}

/**
 * Pull one Item from the Library into a Stop.
 *
 * The control never empties or ticks off: an Item is *referenced* by a Stop, not
 * moved into it, so it stays in the Library and stays addable to as many Stops as the
 * User likes (CONTEXT.md *Item*). It resets to the prompt after each add and says
 * where the Item went — the Stop itself is where you go to see the result.
 */
export function AddToStopControl({
  item,
  stops,
  placedStops,
  user,
  onStopChanged,
}: AddToStopControlProps) {
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligibleStops = stops.filter(
    (stop) => !placedStops.some((placed) => placed.id === stop.id),
  );

  async function add(stopId: StopId) {
    setSaving(true);
    setError(null);
    setAdded(null);
    try {
      const stop = await addItemToStop(user, stopId, item.id);
      onStopChanged(stop);
      setAdded(stop.name);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="item-control-row">
      <div
        className="stop-placement"
        role="group"
        aria-label={`Stop placement for ${item.title}`}
      >
        <span className="item-control-caption">Stops</span>
        {placedStops.length === 0 ? (
          <span className="item-control-caption">Not in a Stop</span>
        ) : (
          <ul aria-label="Current Stops">
            {placedStops.map((stop) => (
              <li key={stop.id}>{stop.name}</li>
            ))}
          </ul>
        )}
      </div>
      {eligibleStops.length > 0 && (
        <label className="item-control-label">
          <span className="item-control-caption">Add to Stop</span>
          <select
            aria-label={`Add ${item.title} to a Stop`}
            value=""
            disabled={saving}
            onChange={(event) => void add(event.target.value as StopId)}
            className="item-control-input"
          >
            <option value="" disabled>
              Choose a Stop…
            </option>
            {eligibleStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.name}
              </option>
            ))}
          </select>
          {saving && <span className="item-control-caption">Adding…</span>}
          {added && !saving && (
            <span className="item-control-caption">Added to {added}</span>
          )}
        </label>
      )}
      {error && (
        <div role="alert" className="item-control-error">
          Could not add to the stop: {error}
        </div>
      )}
    </div>
  );
}
