import { useParams } from "react-router";

/**
 * An Item at its one canonical URL (design spec §4) — `/items/:itemId`, the same
 * record regardless of the Stop or Trail it was reached through. This slice
 * establishes the route; the non-modal right sidebar and its cold-deep-link
 * fallback over the Library arrive in a later slice (#97). The canonical
 * `:itemId` is the durable part.
 */
export function ItemSurface() {
  const { itemId } = useParams();
  return (
    <section aria-labelledby="item-heading">
      <h1 id="item-heading">Item</h1>
      <p data-item-id={itemId} style={{ color: "var(--muted)" }}>
        {itemId}
      </p>
    </section>
  );
}
