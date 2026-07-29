import { useState } from "react";
import type { Item, ItemId, StopDetail, StopId } from "@unshelf/shared";
import { removeItemFromStop } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemRow } from "../items/ItemRow";

interface StopViewProps {
  stop: StopDetail;
  user: CurrentUser;
  onStopChanged: (stop: StopDetail) => void;
  onItemChanged: (item: Item) => void;
  onClose: () => void;
  closeLabel?: string;
  headingLevel?: 2 | 3;
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
  closeLabel = "← All stops",
  headingLevel = 3,
}: StopViewProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <div>
      <div className="stop-view__heading">
        <Heading>{stop.name}</Heading>
        <button type="button" onClick={onClose} className="quiet-button">
          {closeLabel}
        </button>
      </div>

      {stop.items.length === 0 ? (
        <p className="quiet-copy">
          Nothing here yet — add Items to this Stop from the Library.
        </p>
      ) : (
        <ul className="stop-view__items">
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
    <div className="stop-view__remove">
      <button
        type="button"
        disabled={removing}
        onClick={() => void remove()}
        className="quiet-button"
      >
        {removing ? "Removing…" : "Remove from stop"}
      </button>
      {error && (
        <div role="alert" className="surface-error">
          Could not remove from the stop: {error}
        </div>
      )}
    </div>
  );
}
