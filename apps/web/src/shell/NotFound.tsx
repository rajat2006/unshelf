import { Link } from "react-router";

/**
 * A lightweight not-found state (design spec §4): an unknown or stale route
 * recovers to Home rather than stranding the User. Owner-scoped routing never
 * introduces public sharing, so an unresolvable route is simply not found.
 */
export function NotFound() {
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">This page doesn't exist</h1>
      <p style={{ color: "var(--muted)" }}>
        The link may be stale or the page may have moved.
      </p>
      <Link to="/" style={{ color: "var(--accent)" }}>
        Go to Trails
      </Link>
    </section>
  );
}
