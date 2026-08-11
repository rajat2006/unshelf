import type { Item, Label } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { ItemRow } from "./ItemRow";
import { ItemLabels } from "./ItemLabels";

interface LibraryItemsProps {
  items: Item[];
  labels: Label[];
  user: CurrentUser;
  onItemChanged: (item: Item) => void;
}

/**
 * The Library's triage-focused Item list. Placement lives in URL-owned Item and
 * Stage detail surfaces rather than competing with Status, Target date, and Labels.
 */
export function LibraryItems({
  items,
  labels,
  user,
  onItemChanged,
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
        </ItemRow>
      ))}
    </ul>
  );
}
