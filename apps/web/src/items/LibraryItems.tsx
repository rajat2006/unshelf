import type { Item, Label, Stop, StopDetail } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth";
import { AddToStopControl } from "../stops/AddToStopControl";
import { ItemRow } from "./ItemRow";
import { ItemLabels } from "./ItemLabels";

interface LibraryItemsProps {
  items: Item[];
  labels: Label[];
  /** The User's Stops — what a Library Item can be pulled into. */
  stops: Stop[];
  stopDetails: StopDetail[];
  user: CurrentUser;
  onItemChanged: (item: Item) => void;
  onStopChanged: (stop: StopDetail) => void;
}

/**
 * The Library's Item list. Adding to a Stop never takes an Item out of this list:
 * placement adds a reference to the one shared Item spine.
 */
export function LibraryItems({
  items,
  labels,
  stops,
  stopDetails,
  user,
  onItemChanged,
  onStopChanged,
}: LibraryItemsProps) {
  return (
    <ul className="library-list">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          user={user}
          onChanged={onItemChanged}
        >
          <ItemLabels
            item={item}
            labels={labels}
            user={user}
            onItemChanged={onItemChanged}
          />
          <AddToStopControl
            item={item}
            stops={stops}
            placedStops={stopDetails.filter((stop) =>
              stop.items.some((member) => member.id === item.id),
            )}
            user={user}
            onStopChanged={onStopChanged}
          />
        </ItemRow>
      ))}
    </ul>
  );
}
