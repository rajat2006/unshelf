import { useCallback, useEffect, useState } from "react";
import type {
  LearningPlanId,
  LearningPlanItemCandidate,
  LearningPlanView,
} from "@unshelf/shared";
import {
  fetchLearningPlanItemCandidates,
  placeItemDirectly,
  removeDirectItemFromLearningPlan,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { useCaptureListener } from "../shell/useCaptureListener";

interface PlanLibraryDrawerProps {
  learningPlanId: LearningPlanId;
  user: CurrentUser;
  onLearningPlanChanged: (learningPlan: LearningPlanView) => void;
}

/** Search and place existing Library Items without creating a Stage. */
export function PlanLibraryDrawer({
  learningPlanId,
  user,
  onLearningPlanChanged,
}: PlanLibraryDrawerProps) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<
    LearningPlanItemCandidate[] | null
  >(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    setError(null);
    try {
      setCandidates(
        await fetchLearningPlanItemCandidates(user, learningPlanId, query),
      );
    } catch (caught: unknown) {
      setError(String(caught));
    }
  }, [learningPlanId, query, user]);

  useEffect(() => {
    void search();
  }, [search]);
  useCaptureListener(search);

  async function change(candidate: LearningPlanItemCandidate) {
    setBusyItemId(candidate.item.id);
    setError(null);
    try {
      const learningPlan =
        candidate.kind === "direct"
          ? await removeDirectItemFromLearningPlan(
              user,
              learningPlanId,
              candidate.item.id,
            )
          : await placeItemDirectly(user, learningPlanId, candidate.item.id);
      onLearningPlanChanged(learningPlan);
      await search();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <aside
      aria-label="Library placement drawer"
      className="plan-library-drawer"
    >
      <h2>Library</h2>
      <label>
        Search Library
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {candidates === null && !error ? <p role="status">Loading…</p> : null}
      {candidates?.length === 0 ? (
        <p className="quiet-copy">No matching Items.</p>
      ) : null}
      {candidates && candidates.length > 0 ? (
        <ul>
          {candidates.map((candidate) => (
            <li key={candidate.item.id}>
              <strong>{candidate.item.title}</strong>
              <span>{candidate.item.status.replace("_", " ")}</span>
              {candidate.kind === "available" ? (
                <button
                  type="button"
                  disabled={busyItemId !== null}
                  onClick={() => void change(candidate)}
                >
                  Place directly
                </button>
              ) : candidate.kind === "direct" ? (
                <button
                  type="button"
                  disabled={busyItemId !== null}
                  aria-label={`Remove ${candidate.item.title} from this Learning Plan`}
                  onClick={() => void change(candidate)}
                >
                  Remove
                </button>
              ) : (
                <span>In {candidate.stage.name}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div role="alert">
          <p>Could not load or update Library placement: {error}</p>
          <button type="button" onClick={() => void search()}>
            Retry
          </button>
        </div>
      ) : null}
    </aside>
  );
}
