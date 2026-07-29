import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { Trail } from "@unshelf/shared";

/**
 * The Trails index (design spec §2, §6, ADR-0014) — Home. It is Trails-only: the
 * User's Trails as progress cards, plus one quiet action to start another; no
 * label filters and no capture line live here (both were tried and dropped —
 * capture is global chrome, labels live in the Library).
 *
 * This is the presentational surface: it is handed the fetched state and renders
 * each of the surface's own shapes — the card-shaped loading skeleton, the
 * inline-scoped error with Retry, the empty "No Trails yet" prompt, and the card
 * grid. The container above owns the fetch and the create call.
 */
export type TrailsIndexState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; trails: Trail[] };

export function TrailsIndex({
  state,
  creating,
  onCreate,
  onRetry,
}: {
  state: TrailsIndexState;
  creating: boolean;
  onCreate: (name: string) => void | Promise<void>;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return <TrailsSkeleton />;
  }
  if (state.status === "error") {
    return <TrailsError onRetry={onRetry} />;
  }

  const { trails } = state;
  return (
    <div>
      <NewTrailForm creating={creating} onCreate={onCreate} />
      {trails.length === 0 ? (
        <EmptyTrails />
      ) : (
        <ul className="trail-card-grid">
          {trails.map((trail) => (
            <li key={trail.id}>
              <TrailCard trail={trail} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How a Trail's derived progress reads on its card — never a bare 0/0. */
function progressLabel(trail: Trail): string {
  if (trail.total === 0) return "No items added yet";
  return `${trail.done} of ${trail.total} done`;
}

/** One Trail as a card that opens the Trail at its opaque, stable URL. */
function TrailCard({ trail }: { trail: Trail }) {
  return (
    <Link to={`/trails/${trail.id}`} className="trail-card">
      <span className="trail-card__name">{trail.name}</span>
      <span className="trail-card__progress">{progressLabel(trail)}</span>
    </Link>
  );
}

/** The empty index: a quiet prompt whose only action starts the first Trail. */
function EmptyTrails() {
  return (
    <p className="trails-empty">No Trails yet — name one above to start.</p>
  );
}

/**
 * Name and create a Trail. Deliberately not autofocused: the global Capture
 * shortcuts (`c` / `⌘K`) must keep working on a freshly loaded Home, which they
 * only do while focus is not already in an editable control.
 */
function NewTrailForm({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (name: string) => void | Promise<void>;
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
    <form onSubmit={submit} className="new-trail-form">
      <label htmlFor="new-trail-name">Trail name</label>
      <div className="new-trail-form__controls">
        <input
          id="new-trail-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Learn Rust"
          className="new-trail-form__input"
        />
        <button
          type="submit"
          disabled={!trimmed || creating}
          className="quiet-button quiet-button--primary"
        >
          Start a Trail
        </button>
      </div>
    </form>
  );
}

/** Card-shaped skeletons, not a spinner (design spec §6): layout stays stable. */
function TrailsSkeleton() {
  return (
    <div role="status" aria-label="Loading Trails" className="trail-card-grid">
      {[0, 1, 2].map((key) => (
        <div key={key} aria-hidden="true" className="trail-card-skeleton" />
      ))}
    </div>
  );
}

/** The surface-scoped error: it never removes the shell — just the body. */
function TrailsError({ onRetry }: { onRetry: () => void }) {
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
