/**
 * PROTOTYPE (issue #21) — throwaway. Trail authoring design spike.
 *
 * Several representations over ONE shared edge-list model (./model.ts),
 * switchable with the floating bar (or ← / →):
 *
 *   A — Adventure map (CHOSEN structure)        — derived layout, ＋next / ⑃fork
 *   R — Adventure map, professional repaint      — the CHOSEN palette direction
 *   M — Adventure playground (parked)            — free 2D placement (stored x/y)
 *   S — Space playground (parked, for 3D later)  — free 2D placement (stored x/y)
 *   C — Constellation (parked)                   — linear, derived layout
 *
 * The point of sharing one model is the data-model finding: whatever any
 * representation lets you build, the state panel on the right shows it reduces to a
 * flat list of `(from → to)` edges plus a DAG check. That list is the proposed
 * persistence shape (→ ADR-0010). Run: `pnpm --filter @unshelf/web dev`, open
 * `http://localhost:5173/?prototype=trail`. See ./README.md for the verdict.
 */
import { useReducer, useState } from "react";
import {
  describe,
  hasCycle,
  layers,
  leaves,
  reduce,
  roots,
  seedTrail,
  type Trail,
  type TrailAction,
} from "./model";
import { Switcher } from "./Switcher";
import { VariantAdventure } from "./VariantAdventure";
import { VariantAdventureRefined } from "./VariantAdventureRefined";
import { VariantConstellation } from "./VariantConstellation";
import { VariantMapPlayground } from "./VariantMapPlayground";
import { VariantSpacePlayground } from "./VariantSpacePlayground";
import { isDone, isUnderway } from "./model";

const VARIANTS = [
  { key: "A", name: "Adventure map — CHOSEN, polished" },
  { key: "R", name: "Adventure map — professional (pine=done, ochre=now)" },
  { key: "M", name: "Adventure playground — roam the map (parked)" },
  { key: "S", name: "Space playground — rich galaxy (parked, for 3D later)" },
  { key: "C", name: "Constellation — linear (parked)" },
];

function currentVariant(): string {
  const p = new URLSearchParams(window.location.search).get("variant");
  return VARIANTS.some((v) => v.key === p) ? p! : "A";
}

export function TrailPrototype() {
  const [trail, dispatch] = useReducer(
    (s: Trail, a: TrailAction) => reduce(s, a),
    undefined,
    seedTrail,
  );
  const [variant, setVariant] = useState(currentVariant);

  const changeVariant = (key: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState({}, "", url);
    setVariant(key);
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 300px",
        gap: "1.5rem",
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "1.5rem",
        paddingBottom: "5rem",
      }}
    >
      <section style={{ minWidth: 0 }}>
        <h1 style={{ margin: "0 0 0.25rem" }}>Trail authoring — prototype</h1>
        <p style={{ margin: "0 0 1rem", color: "#666", fontSize: "0.85rem" }}>
          Throwaway design spike for issue #21. Variant{" "}
          <strong>{variant}</strong> — {VARIANTS.find((v) => v.key === variant)?.name}.
        </p>
        {variant === "S" && <VariantSpacePlayground trail={trail} dispatch={dispatch} />}
        {variant === "M" && <VariantMapPlayground trail={trail} dispatch={dispatch} />}
        {variant === "A" && <VariantAdventure trail={trail} dispatch={dispatch} />}
        {variant === "R" && <VariantAdventureRefined trail={trail} dispatch={dispatch} />}
        {variant === "C" && <VariantConstellation trail={trail} dispatch={dispatch} />}
      </section>

      <StatePanel trail={trail} />

      <Switcher variants={VARIANTS} current={variant} onChange={changeVariant} />
    </div>
  );
}

/** The shared model, made visible — the persistence shape all variants share. */
function StatePanel({ trail }: { trail: Trail }) {
  const cols = layers(trail);
  // The reducer already refuses cycles, so this only ever confirms the DAG
  // invariant — but showing it makes the invariant visible.
  const acyclic = !hasCycle(trail);
  return (
    <aside
      style={{
        fontSize: "0.8rem",
        border: "1px solid #e5e5e5",
        borderRadius: 8,
        padding: "1rem",
        height: "fit-content",
        position: "sticky",
        top: "1rem",
        background: "#fafafa",
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>
        Persisted state
      </h2>
      <p style={{ color: "#666", margin: "0 0 0.75rem" }}>
        Whatever any variant builds reduces to this — the proposed
        <code> trail_edges </code> rows. Progress is derived, never stored.
      </p>

      <Field label={`edges (${trail.edges.length})`}>
        <pre style={pre}>{describe(trail)}</pre>
      </Field>
      <Field label="valid DAG">
        <span style={{ color: acyclic ? "#047857" : "#b91c1c" }}>
          {acyclic ? "✓ acyclic" : "✗ cycle!"}
        </span>
      </Field>
      <Field label="roots (thread starts)">
        {roots(trail).map((n) => n.label).join(", ") || "—"}
      </Field>
      <Field label="leaves (thread ends)">
        {leaves(trail).map((n) => n.label).join(", ") || "—"}
      </Field>
      <Field label="progress (derived, not stored)">
        <pre style={pre}>
          {`${trail.nodes.filter(isDone).length}/${trail.nodes.length} Stops done` +
            `\n${trail.nodes.filter(isUnderway).length} underway` +
            `\n(from each Stop's done/total Items)`}
        </pre>
      </Field>
      <Field label="derived columns (layout)">
        <pre style={pre}>
          {cols
            .map(
              (ids, i) =>
                `col ${i}: ${ids
                  .map((id) => trail.nodes.find((n) => n.id === id)?.label)
                  .join(", ")}`,
            )
            .join("\n") || "—"}
        </pre>
      </Field>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <div style={{ fontWeight: 600, color: "#333" }}>{label}</div>
      <div style={{ color: "#444" }}>{children}</div>
    </div>
  );
}

const pre: React.CSSProperties = {
  margin: "0.15rem 0 0",
  whiteSpace: "pre-wrap",
  fontFamily: "ui-monospace, monospace",
  fontSize: "0.75rem",
  color: "#555",
};
