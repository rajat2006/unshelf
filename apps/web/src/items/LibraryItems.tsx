import type { Item } from "@unshelf/shared";
import { STATUS_LABELS, TYPE_LABELS } from "./presentation";

interface LibraryItemsProps {
  items: Item[];
  selectedItemId?: Item["id"];
  onPreview: (item: Item) => void;
}

/**
 * The Library's triage-focused Item list. Placement lives in URL-owned Item and
 * Stage detail surfaces rather than competing with Status, Target date, and Labels.
 */
export function LibraryItems({
  items,
  selectedItemId,
  onPreview,
}: LibraryItemsProps) {
  return (
    <ul className="library-list" aria-label="Library Items, newest first">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="library-catalog-row"
            aria-pressed={selectedItemId === item.id}
            onClick={() => onPreview(item)}
            aria-label={`Preview ${item.title}`}
          >
            <span>{TYPE_LABELS[item.type]}</span>
            <strong>{item.title}</strong>
            <span>
              {item.labels.map((label) => label.name).join(" · ") ||
                "Unlabelled"}
            </span>
            <span>{STATUS_LABELS[item.status]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
