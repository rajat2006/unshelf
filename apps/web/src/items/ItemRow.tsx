import type { ReactNode } from "react";
import type { Item } from "@unshelf/shared";
import { ItemSummary } from "./ItemSummary";
import type { CurrentUser } from "../application-auth/types";
import type { ItemBackgroundLocation } from "./item-route-state";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";

interface ItemRowProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
  /** Placement and ordering actions owned by the containing feature. */
  children?: ReactNode;
  detailBackgroundLocation?: ItemBackgroundLocation;
}

/** Shared editable Item facts, with feature-owned actions supplied as children. */
export function ItemRow({
  item,
  user,
  onChanged,
  children,
  detailBackgroundLocation,
}: ItemRowProps) {
  return (
    <li>
      <ItemSummary
        item={item}
        detailBackgroundLocation={detailBackgroundLocation}
        editableFacts={
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ItemStatusSelect item={item} user={user} onChanged={onChanged} />
            <ItemTargetDate item={item} user={user} onChanged={onChanged} />
          </div>
        }
        actions={
          children ? <div className="border-t pt-3">{children}</div> : undefined
        }
      />
    </li>
  );
}
