import type { ReactNode } from "react";
import type { Item } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { ItemTargetDate } from "./ItemTargetDate";
import { TYPE_LABELS } from "./presentation";

interface ItemRowProps {
  item: Item;
  user: CurrentUser;
  onChanged: (item: Item) => void;
  /**
   * What this particular list does with the Item — pull it into a Stop in Library,
   * take it out again inside a Stop. The only part of a row that varies.
   */
  children?: ReactNode;
}

/**
 * One Item, rendered the same way everywhere it appears.
 *
 * This exists because an Item in a Stop and an Item in Library are the *same record*
 * seen twice, not two records (ADR-0003, ADR-0004) — so showing it two different
 * ways would be the UI quietly disagreeing with the model. One component makes
 * that structural: the Status and the Target date are shared facts about the
 * Item, and a Stop cannot render a partial Item by omission, because there is
 * nowhere left to omit them from.
 */
export function ItemRow({ item, user, onChanged, children }: ItemRowProps) {
  return (
    <li className="item-row">
      <div className="item-row__title">{item.title}</div>
      <div className="item-row__type">{TYPE_LABELS[item.type]}</div>
      <ItemStatusSelect item={item} user={user} onChanged={onChanged} />
      <ItemTargetDate item={item} user={user} onChanged={onChanged} />
      {children}
      {item.source && <Source source={item.source} />}
    </li>
  );
}

/** Render an HTTP Source as a tappable link and every other Source as inert text. */
function Source({ source }: { source: string }) {
  let href: string | null = null;
  try {
    const url = new URL(source);
    if (url.protocol === "http:" || url.protocol === "https:") href = source;
  } catch {
    href = null;
  }

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="item-source item-source--link"
    >
      {source}
    </a>
  ) : (
    <div className="item-source item-source--muted">{source}</div>
  );
}
