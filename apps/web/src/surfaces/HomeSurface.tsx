import { useCallback, useEffect, useState } from "react";
import { createTrail, fetchTrails } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { TrailsIndex, type TrailsIndexState } from "../trails/TrailsIndex";

/**
 * Home — the Trails index (design spec §2, ADR-0014). Home is the User's Trails,
 * each with derived progress, and one quiet action to start another; it is
 * Trails-only (no label filters, no capture line — capture is global chrome and
 * labels live in the Library). This container owns the fetch and the create; the
 * `TrailsIndex` below renders the loading, error, empty, and card states.
 */
export function HomeSurface() {
  const user = useCurrentUser();
  const [state, setState] = useState<TrailsIndexState>({ status: "loading" });
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const trails = await fetchTrails(user);
      setState({ status: "ready", trails });
    } catch {
      setState({ status: "error" });
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string) => {
      setCreating(true);
      try {
        const created = await createTrail(user, { name });
        // Fold the new Trail into the list in place — it opens at once, and the
        // index never flickers back through a loading skeleton to show it.
        setState((current) =>
          current.status === "ready"
            ? { status: "ready", trails: [...current.trails, created] }
            : current,
        );
      } finally {
        setCreating(false);
      }
    },
    [user],
  );

  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">Trails</h1>
      <TrailsIndex
        state={state}
        creating={creating}
        onCreate={create}
        onRetry={() => void refresh()}
      />
    </section>
  );
}
