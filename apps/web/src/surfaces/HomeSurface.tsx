import { CurrentSpace } from "../items/CurrentSpace";

/**
 * Home — the Trails index (design spec §2). This slice establishes the route and
 * shell; the existing single-space content passes through as a transitional
 * adapter until later slices split it into the Trails index, Library, and Trail
 * surfaces (#92–#96). The route and landmark are the durable part.
 */
export function HomeSurface() {
  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">Trails</h1>
      <CurrentSpace />
    </section>
  );
}
