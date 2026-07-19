import { useState } from "react";
import type { Item, Stop, StopDetail, StopId } from "@unshelf/shared";
import { addItemToStop } from "../api";
import type { CurrentUser } from "../application-auth";
import {
  ITEM_CONTROL_CAPTION_STYLE,
  ITEM_CONTROL_ERROR_STYLE,
  ITEM_CONTROL_LABEL_STYLE,
  ITEM_CONTROL_ROW_STYLE,
  ITEM_CONTROL_STYLE,
} from "../items/presentation";

interface AddToStopControlProps {
  item: Item;
  stops: Stop[];
  user: CurrentUser;
  onStopChanged: (stop: StopDetail) => void;
}

/**
 * Pull one Item from All into a Stop.
 *
 * The control never empties or ticks off: an Item is *referenced* by a Stop, not
 * moved into it, so it stays in All and stays addable to as many Stops as the
 * User likes (CONTEXT.md *Item*). It resets to the prompt after each add and says
 * where the Item went — the Stop itself is where you go to see the result.
 */
export function AddToStopControl({
  item,
  stops,
  user,
  onStopChanged,
}: AddToStopControlProps) {
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (stops.length === 0) return null;

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
    <div style={ITEM_CONTROL_ROW_STYLE}>
      <label style={ITEM_CONTROL_LABEL_STYLE}>
        <span style={ITEM_CONTROL_CAPTION_STYLE}>Stops</span>
        <select
          value=""
          disabled={saving}
          onChange={(event) => void add(event.target.value as StopId)}
          style={ITEM_CONTROL_STYLE}
        >
          <option value="" disabled>
            Add to a stop…
          </option>
          {stops.map((stop) => (
            <option key={stop.id} value={stop.id}>
              {stop.name}
            </option>
          ))}
        </select>
        {saving && <span style={ITEM_CONTROL_CAPTION_STYLE}>Adding…</span>}
        {added && !saving && (
          <span style={{ ...ITEM_CONTROL_CAPTION_STYLE, opacity: 0.7 }}>
            Added to {added}
          </span>
        )}
      </label>
      {error && (
        <div role="alert" style={ITEM_CONTROL_ERROR_STYLE}>
          Could not add to the stop: {error}
        </div>
      )}
    </div>
  );
}
