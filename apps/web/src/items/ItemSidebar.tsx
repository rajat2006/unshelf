import { useCallback, useEffect, useState } from "react";
import type { Item, ItemDetail, ItemId } from "@unshelf/shared";
import { fetchItem } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";
import { ItemSource } from "./ItemSource";
import { ItemPlacements } from "./ItemPlacements";
import { TYPE_LABELS } from "./presentation";
import { PartChecklist } from "./PartChecklist";

interface ItemSidebarProps {
  itemId: ItemId;
  user: CurrentUser;
  itemOverride?: Item;
  onClose: () => void;
  onItemChanged?: (item: Item) => void;
  onPlacementChanged?: () => void;
}

/** Route-owned canonical Item detail, isolated from the live surface beside it. */
export function ItemSidebar({
  itemId,
  user,
  itemOverride,
  onClose,
  onItemChanged,
  onPlacementChanged,
}: ItemSidebarProps) {
  const [item, setItem] = useState<ItemDetail | null>(null);
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
    setItem((current) => (current ? { ...current, ...changed } : null));
    onItemChanged?.(changed);
  };

  const loadedItem = item?.id === itemId ? item : null;
  const visibleItem = loadedItem
    ? itemOverride?.id === itemId
      ? { ...loadedItem, ...itemOverride }
      : loadedItem
    : null;

  return (
    <aside
      className="item-sidebar"
      aria-label={visibleItem ? `${visibleItem.title} details` : "Item details"}
    >
      {!visibleItem && !error && (
        <div
          className="item-sidebar-skeleton"
          role="status"
          aria-label="Loading Item details"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
      )}
      {error && (
        <div role="alert">
          <p>Could not load this Item: {error}</p>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {visibleItem && (
        <div>
          <div className="item-sidebar__heading">
            <div>
              <h2>{visibleItem.title}</h2>
              <p>{TYPE_LABELS[visibleItem.type]}</p>
            </div>
            <button type="button" onClick={onClose}>
              Close details
            </button>
          </div>
          <ItemStatusSelect
            item={visibleItem}
            user={user}
            onChanged={replaceItem}
          />
          <ItemTargetDate
            item={visibleItem}
            user={user}
            onChanged={replaceItem}
          />
          <PartChecklist
            item={visibleItem}
            user={user}
            onChanged={replaceItem}
          />
          <ItemPlacements
            itemId={visibleItem.id}
            itemTitle={visibleItem.title}
            user={user}
            onChanged={onPlacementChanged}
          />
          {visibleItem.source && <ItemSource source={visibleItem.source} />}
        </div>
      )}
    </aside>
  );
}
