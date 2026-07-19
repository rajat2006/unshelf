import type { CSSProperties, ReactNode } from "react";
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
   * What this particular list does with the Item — pull it into a Stop in All,
   * take it out again inside a Stop. The only part of a row that varies.
   */
  children?: ReactNode;
}

/**
 * One Item, rendered the same way everywhere it appears.
 *
 * This exists because an Item in a Stop and an Item in All are the *same record*
 * seen twice, not two records (ADR-0003, ADR-0004) — so showing it two different
 * ways would be the UI quietly disagreeing with the model. One component makes
 * that structural: the Status and the Target date are shared facts about the
 * Item, and a Stop cannot render a partial Item by omission, because there is
 * nowhere left to omit them from.
 */
export function ItemRow({ item, user, onChanged, children }: ItemRowProps) {
  return (
    <li
      style={{
        padding: "0.75rem 0",
        borderTop: "1px solid rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
        {item.title}
      </div>
      <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
        {TYPE_LABELS[item.type]}
      </div>
      <ItemStatusSelect item={item} user={user} onChanged={onChanged} />
      <ItemTargetDate item={item} user={user} onChanged={onChanged} />
      {children}
      {item.source && <Source source={item.source} />}
    </li>
  );
}

const sourceTextStyle: CSSProperties = {
  fontSize: "0.85rem",
  overflowWrap: "anywhere",
};

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
      style={{
        ...sourceTextStyle,
        display: "inline-flex",
        alignItems: "center",
        minHeight: "44px",
        minWidth: "44px",
      }}
    >
      {source}
    </a>
  ) : (
    <div style={{ ...sourceTextStyle, opacity: 0.7 }}>{source}</div>
  );
}
