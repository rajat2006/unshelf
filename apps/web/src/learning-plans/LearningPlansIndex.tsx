import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { LearningPlan } from "@unshelf/shared";

/**
 * The Learning Plans index (design spec §2, §6, ADR-0014) — Home. It is Learning Plans-only: the
 * User's LearningPlans as progress cards, plus one quiet action to start another; no
 * label filters and no capture line live here (both were tried and dropped —
 * capture is global chrome, labels live in the Library).
 *
 * This is the presentational surface: it is handed the fetched state and renders
 * each of the surface's own shapes — the card-shaped loading skeleton, the
 * inline-scoped error with Retry, the empty "No Learning Plans yet" prompt, and the card
 * grid. The container above owns the fetch and the create call.
 */
export type LearningPlansIndexState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; learningPlans: LearningPlan[] };

export function LearningPlansIndex({
  state,
  creating,
  onCreate,
  onRetry,
}: {
  state: LearningPlansIndexState;
  creating: boolean;
  onCreate: (name: string) => Promise<void>;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return <LearningPlansSkeleton />;
  }
  if (state.status === "error") {
    return <LearningPlansError onRetry={onRetry} />;
  }

  const { learningPlans } = state;
  return (
    <div>
      <NewLearningPlanForm creating={creating} onCreate={onCreate} />
      {learningPlans.length === 0 ? (
        <EmptyLearningPlans />
      ) : (
        <ul className="learning-plan-card-grid">
          {learningPlans.map((learningPlan) => (
            <li key={learningPlan.id}>
              <LearningPlanCard learningPlan={learningPlan} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How a LearningPlan's derived progress reads on its card — never a bare 0/0. */
function progressLabel(learningPlan: LearningPlan): string {
  if (learningPlan.total === 0) return "No items added yet";
  return `${learningPlan.done} of ${learningPlan.total} done`;
}

/** One LearningPlan as a card that opens the LearningPlan at its opaque, stable URL. */
function LearningPlanCard({ learningPlan }: { learningPlan: LearningPlan }) {
  return (
    <Link to={`/plans/${learningPlan.id}`} className="learning-plan-card">
      <span className="learning-plan-card__name">{learningPlan.name}</span>
      <span className="learning-plan-card__progress">
        {progressLabel(learningPlan)}
      </span>
    </Link>
  );
}

/** The empty index: a quiet prompt whose only action starts the first LearningPlan. */
function EmptyLearningPlans() {
  return (
    <p className="learning-plans-empty">
      No Learning Plans yet — name one above to start.
    </p>
  );
}

/**
 * Name and create a LearningPlan. Deliberately not autofocused: the global Capture
 * shortcuts (`c` / `⌘K`) must keep working on a freshly loaded Home, which they
 * only do while focus is not already in an editable control.
 */
function NewLearningPlanForm({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || creating) return;
    await onCreate(trimmed);
    setName("");
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="new-learning-plan-form"
    >
      <label htmlFor="new-learning-plan-name">Learning Plan name</label>
      <div className="new-learning-plan-form__controls">
        <input
          id="new-learning-plan-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Learn Rust"
          className="new-learning-plan-form__input"
        />
        <button
          type="submit"
          disabled={!trimmed || creating}
          className="quiet-button quiet-button--primary"
        >
          Start a Learning Plan
        </button>
      </div>
    </form>
  );
}

/** Card-shaped skeletons, not a spinner (design spec §6): layout stays stable. */
function LearningPlansSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading Learning Plans"
      className="learning-plan-card-grid"
    >
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="learning-plan-card-skeleton"
        />
      ))}
    </div>
  );
}

/** The surface-scoped error: it never removes the shell — just the body. */
function LearningPlansError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="surface-error-panel">
      <p>Couldn't load this</p>
      <button
        type="button"
        onClick={onRetry}
        className="quiet-button quiet-button--primary"
      >
        Retry
      </button>
    </div>
  );
}
