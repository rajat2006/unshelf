import { useCallback, useEffect, useState } from "react";
import {
  archiveLearningPlan,
  createLearningPlan,
  fetchLearningPlans,
  restoreLearningPlan,
} from "../api";
import type { LearningPlan } from "@unshelf/shared";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import {
  LearningPlansIndex,
  type LearningPlansIndexState,
} from "../learning-plans/LearningPlansIndex";

/**
 * The Plans room is the Learning Plans index: each plan has derived progress
 * and one quiet action to start another. It is Plans-only (no label filters or
 * capture line — capture is global chrome and labels live in the Library).
 * This container owns the fetch and the create; the
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

  const changeLifecycle = useCallback(
    async (learningPlan: LearningPlan, operation: "archive" | "restore") => {
      const changed =
        operation === "archive"
          ? await archiveLearningPlan(user, learningPlan.id)
          : await restoreLearningPlan(user, learningPlan.id);
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              learningPlans: current.learningPlans.map((candidate) =>
                candidate.id === changed.id ? changed : candidate,
              ),
            }
          : current,
      );
    },
    [user],
  );

  return (
    <section
      className="mx-auto grid w-full max-w-7xl min-w-0 gap-6"
      aria-labelledby="home-heading"
      aria-busy={state.status === "loading"}
    >
      <header className="grid gap-2">
        <div className="grid gap-1">
          <p className="m-0 text-xs font-semibold tracking-[0.12em] text-primary uppercase">
            Your commitments
          </p>
          <h1
            id="home-heading"
            className="m-0 font-serif text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
          >
            Learning Plans
          </h1>
          <p className="m-0 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Shape Library Items into outcomes, follow their shared progress, and
            set finished commitments aside without losing them.
          </p>
        </div>
      </header>
      <LearningPlansIndex
        state={state}
        creating={creating}
        onCreate={create}
        onArchive={(learningPlan) => changeLifecycle(learningPlan, "archive")}
        onRestore={(learningPlan) => changeLifecycle(learningPlan, "restore")}
        onRetry={() => void refresh()}
      />
    </section>
  );
}
