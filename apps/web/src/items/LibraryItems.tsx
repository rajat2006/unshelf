import type { Item } from "@unshelf/shared";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemSummary } from "./ItemSummary";

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
    <ul className="grid list-none p-0" aria-label="Library Items, newest first">
      {items.map((item) => (
        <li key={item.id} className="border-b last:border-b-0">
          <ItemSummary
            item={item}
            presentation="catalog"
            className={
              selectedItemId === item.id
                ? "bg-accent/65 shadow-[inset_3px_0_0_var(--primary)]"
                : undefined
            }
            actions={
              <Button
                type="button"
                variant="secondary"
                size="compact"
                className="w-fit min-h-11 sm:min-h-8"
                aria-pressed={selectedItemId === item.id}
                onClick={() => onPreview(item)}
                aria-label={`Edit ${item.title}`}
              >
                <Eye aria-hidden="true" />
                {selectedItemId === item.id ? "Editing" : "Edit details"}
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
