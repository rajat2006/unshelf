/**
 * The Library (design spec §2) — the flat store, filterable by label. This slice
 * establishes the route; the triage rows, Status control, and label filter arrive
 * in later slices (#96–#99). The route and landmark are the durable part.
 */
export function LibrarySurface() {
  return (
    <section aria-labelledby="library-heading">
      <h1 id="library-heading">Library</h1>
    </section>
  );
}
