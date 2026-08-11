import { useCallback, useEffect, useState } from "react";
import { createLearningPlan, fetchLearningPlans } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import {
  LearningPlansIndex,
  type LearningPlansIndexState,
} from "../learning-plans/LearningPlansIndex";

/**
 * Home — the Learning Plans index (design spec §2, ADR-0014). Home is the User's LearningPlans,
 * each with derived progress, and one quiet action to start another; it is
 * Learning Plans-only (no label filters, no capture line — capture is global chrome and
 * labels live in the Library). This container owns the fetch and the create; the
 * `LearningPlansIndex` below renders the loading, error, empty, and card states.
 */
export function PlansSurface() {
  const user = useCurrentUser();
  const [state, setState] = useState<LearningPlansIndexState>({
    status: "loading",
  });
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const learningPlans = await fetchLearningPlans(user);
      setState({ status: "ready", learningPlans });
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
        const created = await createLearningPlan(user, { name });
        // Fold the new LearningPlan into the list in place — it opens at once, and the
        // index never flickers back through a loading skeleton to show it.
        setState((current) =>
          current.status === "ready"
            ? {
                status: "ready",
                learningPlans: [...current.learningPlans, created],
              }
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
      <h1 id="home-heading">Learning Plans</h1>
      <LearningPlansIndex
        state={state}
        creating={creating}
        onCreate={create}
        onRetry={() => void refresh()}
      />
    </section>
  );
}
