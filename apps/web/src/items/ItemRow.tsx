import type { ReactNode } from "react";
import type { Item } from "@unshelf/shared";
import { Link, useLocation } from "react-router";
import type { CurrentUser } from "../application-auth/types";
import {
  itemDetailRouteState,
  itemLinkBackgroundLocation,
  type ItemBackgroundLocation,
} from "./item-route-state";
import { ItemSource } from "./ItemSource";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";
import { TYPE_LABELS } from "./presentation";

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
  const location = useLocation();
  const backgroundLocation = itemLinkBackgroundLocation(
    location,
    detailBackgroundLocation,
  );

  return (
    <li className="item-row">
      <Link
        className="item-row__title"
        to={`/items/${item.id}`}
        state={itemDetailRouteState(backgroundLocation)}
      >
        {item.title}
      </Link>
      <div className="item-row__type">{TYPE_LABELS[item.type]}</div>
      <ItemStatusSelect item={item} user={user} onChanged={onChanged} />
      <ItemTargetDate item={item} user={user} onChanged={onChanged} />
      {children}
      {item.source && <ItemSource source={item.source} />}
    </li>
  );
}
