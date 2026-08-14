import type { ReactNode } from "react";
import type { Item } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import type { ItemBackgroundLocation } from "./item-route-state";
import { ItemSummary } from "./ItemSummary";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";

interface ItemRowProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
  /**
   * What this particular list does with the Item — pull it into a Stage in Library,
   * take it out again inside a Stage. The only part of a row that varies.
   */
  children?: ReactNode;
  detailBackgroundLocation?: ItemBackgroundLocation;
}

/**
 * One Item, rendered the same way everywhere it appears.
 *
 * This exists because an Item in a Stage and an Item in Library are the *same record*
 * seen twice, not two records (ADR-0003, ADR-0004) — so showing it two different
 * ways would be the UI quietly disagreeing with the model. One component makes
 * that structural: the Status and the Target date are shared facts about the
 * Item, and a Stage cannot render a partial Item by omission, because there is
 * nowhere left to omit them from.
 */
export function ItemRow({
  item,
  user,
  onChanged,
  children,
  detailBackgroundLocation,
}: ItemRowProps) {
  return (
    <li className="min-w-0">
      <ItemSummary
        item={item}
        detailBackgroundLocation={detailBackgroundLocation}
        actions={
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <ItemStatusSelect item={item} user={user} onChanged={onChanged} />
            <ItemTargetDate item={item} user={user} onChanged={onChanged} />
            {children && <div className="sm:col-span-2">{children}</div>}
          </div>
        }
      />
    </li>
  );
}
