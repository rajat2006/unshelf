import { useCallback, useEffect, useState } from "react";
import type { Item, ItemId } from "@unshelf/shared";
import { fetchItem } from "../api";
import type { CurrentUser } from "../application-auth";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";
import { TYPE_LABELS } from "./presentation";

interface ItemSidebarProps {
  itemId: ItemId;
  user: CurrentUser;
  onClose: () => void;
  onItemChanged?: (item: Item) => void;
}

/** Route-owned canonical Item detail, isolated from the live surface beside it. */
export function ItemSidebar({
  itemId,
  user,
  onClose,
  onItemChanged,
}: ItemSidebarProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItem(await fetchItem(user, itemId));
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [itemId, user]);

  useEffect(() => {
    setItem(null);
    void load();
  }, [load]);

  const replaceItem = (changed: Item) => {
    setItem(changed);
    onItemChanged?.(changed);
  };

  return (
    <aside
      className="item-sidebar"
      aria-label={item ? `${item.title} details` : "Item details"}
    >
      {!item && !error && <p>Loading Item details…</p>}
      {error && (
        <div role="alert">
          <p>Could not load this Item: {error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {item && (
        <div>
          <div className="item-sidebar__heading">
            <div>
              <h2>{item.title}</h2>
              <p>{TYPE_LABELS[item.type]}</p>
            </div>
            <button type="button" onClick={onClose}>
              Close details
            </button>
          </div>
          <ItemStatusSelect item={item} user={user} onChanged={replaceItem} />
          <ItemTargetDate item={item} user={user} onChanged={replaceItem} />
          {item.source && <p className="item-source">{item.source}</p>}
        </div>
      )}
    </aside>
  );
}
