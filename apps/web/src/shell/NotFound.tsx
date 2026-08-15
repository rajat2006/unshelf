import { Link } from "react-router";
import { Button } from "@/components/ui/button";

/**
 * A lightweight not-found state (design spec §4): an unknown or stale route
 * recovers to Today rather than stranding the User. Owner-scoped routing never
 * introduces public sharing, so an unresolvable route is simply not found.
 */
export function NotFound() {
  return (
    <section
      aria-labelledby="not-found-heading"
      className="mx-auto grid min-h-[50vh] max-w-xl place-content-center justify-items-start gap-4"
    >
      <h1
        id="not-found-heading"
        className="m-0 font-serif text-4xl font-medium tracking-tight"
      >
        This page doesn't exist
      </h1>
      <p className="m-0 text-muted-foreground">
        The link may be stale or the page may have moved.
      </p>
      <Button asChild variant="secondary">
        <Link to="/today">Go to Today</Link>
      </Button>
    </section>
  );
}
