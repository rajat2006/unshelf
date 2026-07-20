import { useState, type CSSProperties, type FormEvent } from "react";
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
        <ul style={gridStyle}>
          {trails.map((trail) => (
            <li key={trail.id} style={{ listStyle: "none" }}>
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
  if (trail.total === 0) return "No progress yet";
  return `${trail.done} of ${trail.total} done`;
}

/** One Trail as a card that opens the Trail at its opaque, stable URL. */
function TrailCard({ trail }: { trail: Trail }) {
  return (
    <Link to={`/trails/${trail.id}`} style={cardStyle}>
      <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
        {trail.name}
      </span>
      <span style={{ color: "var(--muted)" }}>{progressLabel(trail)}</span>
    </Link>
  );
}

/** The empty index: a quiet prompt whose only action starts the first Trail. */
function EmptyTrails() {
  return (
    <p style={{ color: "var(--muted)", marginTop: "var(--space-5)" }}>
      No Trails yet — name one above to start.
    </p>
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
    <form onSubmit={submit} style={formStyle}>
      <label htmlFor="new-trail-name" style={{ fontWeight: 600 }}>
        Trail name
      </label>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <input
          id="new-trail-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Learn Rust"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={!trimmed || creating}
          style={buttonStyle}
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
    <div role="status" aria-label="Loading Trails" style={gridStyle}>
      {[0, 1, 2].map((key) => (
        <div key={key} aria-hidden="true" style={skeletonStyle} />
      ))}
    </div>
  );
}

/** The surface-scoped error: it never removes the shell — just the body. */
function TrailsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={errorStyle}>
      <p style={{ margin: 0 }}>Couldn't load this</p>
      <button type="button" onClick={onRetry} style={buttonStyle}>
        Retry
      </button>
    </div>
  );
}

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: "var(--space-4)",
  padding: 0,
  margin: "var(--space-5) 0 0",
};

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-4)",
  minHeight: "88px",
  borderRadius: "var(--radius-3)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  textDecoration: "none",
};

const skeletonStyle: CSSProperties = {
  minHeight: "88px",
  borderRadius: "var(--radius-3)",
  border: "1px solid var(--line)",
  background: "var(--trail-bg)",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  maxWidth: "480px",
};

const inputStyle: CSSProperties = {
  flex: "1 1 200px",
  minHeight: "44px",
  padding: "0 var(--space-3)",
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--field-line)",
  background: "var(--field-bg)",
  color: "var(--ink)",
};

const buttonStyle: CSSProperties = {
  minHeight: "44px",
  padding: "0 var(--space-4)",
  borderRadius: "var(--radius-2)",
  border: "1px solid transparent",
  background: "var(--accent)",
  color: "var(--on-accent)",
  fontWeight: 600,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  alignItems: "flex-start",
  marginTop: "var(--space-5)",
  padding: "var(--space-4)",
  borderRadius: "var(--radius-2)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
};
