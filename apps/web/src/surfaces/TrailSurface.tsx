import { useParams } from "react-router";

/**
 * A single Trail's canvas (design spec §2). This slice establishes the
 * `/trails/:trailId` route and its `/stops/:stopId` child; the reskinned canvas,
 * authoring gestures, and the Stop sidebar arrive in later slices (#94–#95). The
 * opaque `:trailId` from the URL is the durable part.
 */
export function TrailSurface() {
  const { trailId } = useParams();
  return (
    <section aria-labelledby="trail-heading">
      <h1 id="trail-heading">Trail</h1>
      <p data-trail-id={trailId} style={{ color: "var(--muted)" }}>
        {trailId}
      </p>
    </section>
  );
}
