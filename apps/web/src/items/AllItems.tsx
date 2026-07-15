import type { CSSProperties } from "react";
import type { Item } from "@unshelf/shared";
import type { CurrentUser } from "../auth";
import { ItemStatusSelect } from "./ItemStatusSelect";
import { TYPE_LABELS } from "./presentation";

interface AllItemsProps {
  items: Item[] | null;
  error: string | null;
  user: CurrentUser;
  onItemChanged: (item: Item) => void;
}

const sourceTextStyle: CSSProperties = {
  fontSize: "0.85rem",
  overflowWrap: "anywhere",
};

/** All: the query "every Item where user = me", rendered as a list. */
export function AllItems({ items, error, user, onItemChanged }: AllItemsProps) {
  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>All</h2>
      {error && <p style={{ color: "crimson" }}>Could not reach your space: {error}</p>}
      {!items && !error && <p>Loading your space…</p>}
      {items && items.length === 0 && (
        <p style={{ opacity: 0.7 }}>Nothing captured yet — add your first item above.</p>
      )}
      {items && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li
              key={item.id}
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
              <ItemStatusSelect
                item={item}
                user={user}
                onChanged={onItemChanged}
              />
              {item.source && <Source source={item.source} />}
            </li>
          ))}
        </ul>
      )}
    </section>
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
