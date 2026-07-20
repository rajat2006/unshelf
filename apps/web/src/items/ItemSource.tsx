/** Render an HTTP Source as a tappable link and every other Source as inert text. */
export function ItemSource({ source }: { source: string }) {
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
