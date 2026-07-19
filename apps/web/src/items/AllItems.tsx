import type { Item, Stop, StopDetail } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth";
import { AddToStopControl } from "../stops/AddToStopControl";
import { ItemRow } from "./ItemRow";

interface AllItemsProps {
  items: Item[] | null;
  /** The User's Stops — what an Item in All can be pulled into. */
  stops: Stop[] | null;
  error: string | null;
  user: CurrentUser;
  onItemChanged: (item: Item) => void;
  onStopChanged: (stop: StopDetail) => void;
}

/**
 * All: the query "every Item where user = me", rendered as a list — and the one
 * place Items are pulled from into a Stop (story 28). Adding to a Stop never
 * takes an Item out of this list: All is where every capture lands and stays.
 */
export function AllItems({
  items,
  stops,
  error,
  user,
  onItemChanged,
  onStopChanged,
}: AllItemsProps) {
  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>All</h2>
      {error && <p style={{ color: "crimson" }}>Could not reach your space: {error}</p>}
      {!items && !error && <p>Loading your space…</p>}
      {items && items.length === 0 && (
        <p style={{ opacity: 0.7 }}>Nothing captured yet — add your first item above.</p>
      )}
      {items && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              user={user}
              onChanged={onItemChanged}
            >
              <AddToStopControl
                item={item}
                stops={stops ?? []}
                user={user}
                onStopChanged={onStopChanged}
              />
            </ItemRow>
          ))}
        </ul>
      )}
    </section>
  );
}
