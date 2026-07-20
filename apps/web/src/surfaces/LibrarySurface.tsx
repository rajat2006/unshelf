import { CurrentSpace } from "../items/CurrentSpace";

/**
 * The Library (design spec §2) — the flat store every capture lands in, filterable
 * by label. This slice establishes the route and hosts the existing single-space
 * content as a transitional adapter: the store is where captured Items live, so
 * the All / Stops / Trail view moves here off the now Trails-only Home (#93) until
 * the triage rows, Status control, and label filter arrive downstream (#96–#99).
 * The route and landmark are the durable part.
 */
export function LibrarySurface() {
  return (
    <section aria-labelledby="library-heading">
      <h1 id="library-heading">Library</h1>
      <CurrentSpace />
    </section>
  );
}
