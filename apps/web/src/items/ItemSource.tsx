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
      className="inline-flex min-h-11 min-w-11 max-w-full items-center text-primary underline decoration-primary/35 underline-offset-4 [overflow-wrap:anywhere] hover:decoration-primary"
    >
      {source}
    </a>
  ) : (
    <div className="max-w-full text-muted-foreground break-words">{source}</div>
  );
}
