import { useState } from "react";
import type { Stop, StopId, TrailView } from "@unshelf/shared";
import { connectStops, disconnectStops } from "../api";
import type { CurrentUser } from "../auth";
import { canConnect, layout, type PlacedStop } from "./geometry";

/** Node and gap sizes; the whole canvas is derived from these plus the topology. */
const NODE_W = 150;
const NODE_H = 56;
const COL_GAP = 56;
const ROW_GAP = 24;
const PAD = 16;
const COL_W = NODE_W + COL_GAP;
const ROW_H = NODE_H + ROW_GAP;

const xOf = (p: PlacedStop) => PAD + p.depth * COL_W;
const yOf = (p: PlacedStop) => PAD + p.lane * ROW_H;

interface TrailCanvasProps {
  stops: Stop[];
  trail: TrailView;
  user: CurrentUser;
  onTrailChanged: (trail: TrailView) => void;
  /** Phone width views the Trail without authoring it (US 40, ADR-0008). */
  readOnly: boolean;
}

/**
 * The Trail canvas: the User's Stops laid out by derived topology, with their
 * edges drawn between them (ADR-0010). Sequence runs left→right; a fork is a Stop
 * with several out-edges, a join several in-edges — and because the layout is
 * derived, not stored, the same edge set renders here on the desktop and,
 * read-only, on the phone (US 40) with no extra data.
 *
 * On desktop it is authored, not just shown: pick a Stop's *link* control, then
 * the Stop to lead into, and the edge is drawn (US 34–36). Every edge carries a
 * remove control, so rewiring — moving a Stop, changing a fork — is erase and
 * redraw (US 37). The api is the authority on what is legal: a link that would
 * close a cycle is never offered here (`canConnect`) and refused there besides.
 */
export function TrailCanvas({
  stops,
  trail,
  user,
  onTrailChanged,
  readOnly,
}: TrailCanvasProps) {
  const [linkingFrom, setLinkingFrom] = useState<StopId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edges = trail.edges;
  const { placed, byId, depthCount, laneCount } = layout(stops, edges);

  const width = PAD * 2 + depthCount * NODE_W + (depthCount - 1) * COL_GAP;
  const height = PAD * 2 + laneCount * NODE_H + (laneCount - 1) * ROW_GAP;

  async function run(change: () => Promise<TrailView>) {
    setBusy(true);
    setError(null);
    try {
      onTrailChanged(await change());
      setLinkingFrom(null);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  const link = (to: StopId) => {
    if (linkingFrom) void run(() => connectStops(user, linkingFrom, to));
  };
  const unlink = (from: StopId, to: StopId) =>
    void run(() => disconnectStops(user, from, to));

  if (stops.length === 0) {
    return (
      <p style={{ opacity: 0.7 }}>
        No stops to arrange yet — create some above, then link them into a trail.
      </p>
    );
  }

  return (
    <div>
      {!readOnly && (
        <p style={{ opacity: 0.7, fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
          {linkingFrom
            ? "Choose the stop this one leads into — or cancel."
            : "Pick a stop’s “link” to lead it into the next; use ✕ on a link to rewire."}
        </p>
      )}
      {readOnly && (
        <p style={{ opacity: 0.7, fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
          A read-only view of your trail. Open it on a wider screen to arrange it.
        </p>
      )}

      <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: "0.5rem" }}>
        <div
          style={{
            position: "relative",
            width: `${width}px`,
            height: `${height}px`,
            minWidth: "100%",
          }}
        >
          <svg
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden="true"
          >
            {edges.map((edge) => {
              const from = byId.get(edge.fromStopId);
              const to = byId.get(edge.toStopId);
              if (!from || !to) return null;
              const x1 = xOf(from) + NODE_W;
              const y1 = yOf(from) + NODE_H / 2;
              const x2 = xOf(to);
              const y2 = yOf(to) + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={`${edge.fromStopId}->${edge.toStopId}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="rgba(0,0,0,0.35)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>

          {placed.map((p) => (
            <TrailNode
              key={p.stop.id}
              placed={p}
              left={xOf(p)}
              top={yOf(p)}
              width={NODE_W}
              height={NODE_H}
              readOnly={readOnly}
              busy={busy}
              linkingFrom={linkingFrom}
              canBeTarget={
                linkingFrom !== null &&
                linkingFrom !== p.stop.id &&
                canConnect(edges, linkingFrom, p.stop.id)
              }
              onStartLink={() => setLinkingFrom(p.stop.id)}
              onCancelLink={() => setLinkingFrom(null)}
              onLinkHere={() => link(p.stop.id)}
            />
          ))}

          {!readOnly &&
            edges.map((edge) => {
              const from = byId.get(edge.fromStopId);
              const to = byId.get(edge.toStopId);
              if (!from || !to) return null;
              const cx = (xOf(from) + NODE_W + xOf(to)) / 2;
              const cy = (yOf(from) + yOf(to)) / 2 + NODE_H / 2;
              return (
                <button
                  key={`x-${edge.fromStopId}->${edge.toStopId}`}
                  type="button"
                  title="Remove this link"
                  aria-label="Remove this link"
                  disabled={busy}
                  onClick={() => unlink(edge.fromStopId, edge.toStopId)}
                  style={{
                    position: "absolute",
                    left: `${cx - 11}px`,
                    top: `${cy - 11}px`,
                    width: "22px",
                    height: "22px",
                    lineHeight: "20px",
                    padding: 0,
                    borderRadius: "50%",
                    border: "1px solid rgba(0,0,0,0.3)",
                    background: "white",
                    fontSize: "0.7rem",
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  ✕
                </button>
              );
            })}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ color: "crimson", fontSize: "0.85rem" }}>
          Could not change the trail: {error}
        </div>
      )}
    </div>
  );
}

interface TrailNodeProps {
  placed: PlacedStop;
  left: number;
  top: number;
  width: number;
  height: number;
  readOnly: boolean;
  busy: boolean;
  linkingFrom: StopId | null;
  canBeTarget: boolean;
  onStartLink: () => void;
  onCancelLink: () => void;
  onLinkHere: () => void;
}

/**
 * One Stop as a node. It shows the Stop's name and, on desktop, the one control
 * that fits the current gesture: start a link from here, cancel the link in
 * progress, or — when this Stop is a legal target — lead the pending link into
 * it. A Stop the pending link cannot reach (it would close a cycle, or is already
 * linked) simply offers no target control.
 */
function TrailNode({
  placed,
  left,
  top,
  width,
  height,
  readOnly,
  busy,
  linkingFrom,
  canBeTarget,
  onStartLink,
  onCancelLink,
  onLinkHere,
}: TrailNodeProps) {
  const isSource = linkingFrom === placed.stop.id;
  return (
    <div
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        minHeight: `${height}px`,
        boxSizing: "border-box",
        padding: "0.4rem 0.5rem",
        border: `2px solid ${
          isSource ? "#2563eb" : canBeTarget ? "#16a34a" : "rgba(0,0,0,0.2)"
        }`,
        borderRadius: "8px",
        background: "white",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontWeight: 600,
          fontSize: "0.85rem",
          overflowWrap: "anywhere",
          lineHeight: 1.2,
        }}
      >
        {placed.stop.name}
      </span>

      {!readOnly && (
        <div>
          {isSource ? (
            <NodeButton label="Cancel" onClick={onCancelLink} busy={busy} />
          ) : canBeTarget ? (
            <NodeButton label="Link here" onClick={onLinkHere} busy={busy} />
          ) : linkingFrom === null ? (
            <NodeButton label="Link →" onClick={onStartLink} busy={busy} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function NodeButton({
  label,
  onClick,
  busy,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      style={{
        font: "inherit",
        fontSize: "0.7rem",
        padding: "0.15rem 0.4rem",
        minHeight: "44px",
        width: "100%",
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
