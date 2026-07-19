import { useState } from "react";
import type { Item, ItemId, StopDetail, StopId } from "@unshelf/shared";
import { removeItemFromStop } from "../api";
import type { CurrentUser } from "../application-auth";
import { ItemRow } from "../items/ItemRow";

interface StopViewProps {
  stop: StopDetail;
  user: CurrentUser;
  onStopChanged: (stop: StopDetail) => void;
  onItemChanged: (item: Item) => void;
  onClose: () => void;
}

/**
 * One Stop's contents: its Items, each shown exactly as All shows them — the same
 * `ItemRow`, so the same Status and the same Target date (story 33). A Stop
 * displays progress without owning any of it; changing it here changes the Item,
 * which is why it lands in every other Stop at the same time.
 *
 * The list is presented plainly, with no numbering, drag handles, or "next up":
 * a Stop is an unordered set (ADR-0004), and any order shown here is the api's
 * display convenience, not a plan. Sequencing is the Trail's job.
 */
export function StopView({
  stop,
  user,
  onStopChanged,
  onItemChanged,
  onClose,
}: StopViewProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.05rem", overflowWrap: "anywhere" }}>
          {stop.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: "0.85rem",
            padding: "0.5rem 0.75rem",
            minHeight: "44px",
            cursor: "pointer",
          }}
        >
          ← All stops
        </button>
      </div>

      {stop.items.length === 0 ? (
        <p style={{ opacity: 0.7 }}>
          Nothing here yet — add items to this stop from All below.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {stop.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              user={user}
              onChanged={onItemChanged}
            >
              <RemoveFromStop
                stopId={stop.id}
                itemId={item.id}
                user={user}
                onStopChanged={onStopChanged}
              />
            </ItemRow>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RemoveFromStopProps {
  stopId: StopId;
  itemId: ItemId;
  user: CurrentUser;
  onStopChanged: (stop: StopDetail) => void;
}

/**
 * Take one Item out of this Stop. It unfiles, it does not delete: the Item keeps
 * its Status and its place in All and in every other Stop — which is what makes
 * reorganising free (story 32), and why this needs no confirmation.
 */
function RemoveFromStop({
  stopId,
  itemId,
  user,
  onStopChanged,
}: RemoveFromStopProps) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      onStopChanged(await removeItemFromStop(user, stopId, itemId));
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div style={{ marginTop: "0.35rem" }}>
      <button
        type="button"
        disabled={removing}
        onClick={() => void remove()}
        style={{
          fontSize: "0.85rem",
          padding: "0.5rem 0.75rem",
          minHeight: "44px",
          cursor: removing ? "wait" : "pointer",
        }}
      >
        {removing ? "Removing…" : "Remove from stop"}
      </button>
      {error && (
        <div role="alert" style={{ color: "crimson", fontSize: "0.85rem" }}>
          Could not remove from the stop: {error}
        </div>
      )}
    </div>
  );
}
