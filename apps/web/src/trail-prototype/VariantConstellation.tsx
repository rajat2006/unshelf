/**
 * PROTOTYPE (issue #21) — Variant "Constellation".
 *
 * Horizontal night sky. Each Stop is a star; finishing it lights it up, and the
 * line to the next star charges from dim to bright once you've cleared the one
 * behind. A star underway glows partway (its progress ring). Atmospheric and
 * distinctive — the antidote to "plain". Click a star to advance it. See README.
 */
import { grid, type Placed } from "./geometry";
import {
  isDone,
  isUnderway,
  isWalked,
  progressOf,
  type StopNode,
  type Trail,
  type TrailAction,
} from "./model";
import { ProgressRing } from "./ProgressRing";

const COL_W = 230;
const LANE_H = 140;
const PAD = 66;

const LIT = "#8ecbff";
const GLOW = "#c9e7ff";
const DIM = "#3a4668";

export function VariantConstellation({
  trail,
  dispatch,
}: {
  trail: Trail;
  dispatch: (a: TrailAction) => void;
}) {
  const g = grid(trail);
  const nodeById = new Map(trail.nodes.map((n) => [n.id, n]));
  const drift = (p: Placed) => Math.cos(p.depth * 1.4 + p.lane * 1.7) * 14;
  const cx = (p: Placed) => PAD + p.depth * COL_W;
  const cy = (p: Placed) => PAD + p.lane * LANE_H + drift(p);
  const width = PAD * 2 + Math.max(1, g.depthCount) * COL_W;
  const height = PAD * 2 + Math.max(1, g.laneCount) * LANE_H;

  // A few static background stars (index-derived, no randomness in scripts/render).
  const bg = Array.from({ length: 46 }, (_, i) => ({
    x: ((i * 97) % width),
    y: ((i * 61) % height),
    r: (i % 3) * 0.5 + 0.6,
    o: 0.15 + ((i % 5) * 0.09),
  }));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ overflow: "auto", borderRadius: 16 }}>
        <div
          style={{
            position: "relative",
            width,
            height,
            background: "radial-gradient(140% 120% at 20% 10%, #1b2748 0%, #131a30 55%, #0c1020 100%)",
          }}
        >
          <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <defs>
              <filter id="starglow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {bg.map((s, i) => (
              <circle key={`bg${i}`} cx={s.x} cy={s.y} r={s.r} fill="#dfe8ff" opacity={s.o} />
            ))}

            {/* edges: dim underlay + lit overlay when walked */}
            {trail.edges.map((e, i) => {
              const a = g.byId.get(e.from);
              const b = g.byId.get(e.to);
              if (!a || !b) return null;
              const walked = isWalked(trail, e);
              return (
                <line
                  key={i}
                  x1={cx(a)}
                  y1={cy(a)}
                  x2={cx(b)}
                  y2={cy(b)}
                  stroke={walked ? LIT : DIM}
                  strokeWidth={walked ? 2.4 : 1.4}
                  opacity={walked ? 0.95 : 0.6}
                  filter={walked ? "url(#starglow)" : undefined}
                />
              );
            })}
          </svg>

          {g.placed.map((p) => {
            const n = nodeById.get(p.id)!;
            return <Star key={p.id} n={n} x={cx(p)} y={cy(p)} dispatch={dispatch} />;
          })}
        </div>
      </div>
      <p style={{ fontSize: "0.8rem", color: "#8b93ad", marginTop: "0.75rem" }}>
        Finished Stops are lit stars; the line to the next charges bright once you
        clear the one behind. A star mid-way glows partway.{" "}
        <strong>Click a star to advance it.</strong>
      </p>
    </div>
  );
}

function Star({
  n,
  x,
  y,
  dispatch,
}: {
  n: StopNode;
  x: number;
  y: number;
  dispatch: (a: TrailAction) => void;
}) {
  const done = isDone(n);
  const underway = isUnderway(n);
  const SIZE = 52;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 96,
        top: y - SIZE / 2 - 4,
        width: 192,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <button
        type="button"
        onClick={() => dispatch({ kind: "bump", id: n.id })}
        title="advance progress"
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          borderRadius: "50%",
          filter: done
            ? "drop-shadow(0 0 12px rgba(142,203,255,0.9))"
            : underway
              ? "drop-shadow(0 0 8px rgba(142,203,255,0.45))"
              : "none",
        }}
      >
        <div
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: "50%",
            background: done
              ? "radial-gradient(circle at 40% 35%, #eaf5ff, #8ecbff)"
              : "rgba(20,28,52,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ProgressRing
            size={SIZE}
            stroke={5}
            progress={progressOf(n)}
            done={done}
            track={DIM}
            fill={done ? "#0c1020" : GLOW}
            center={<span style={{ fontSize: "0.62rem", color: done ? "#0c1020" : GLOW }}>{`${n.done}/${n.total}`}</span>}
          />
        </div>
      </button>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: done ? "#eaf3ff" : "#aab4d0", textAlign: "center", lineHeight: 1.15 }}>
        {n.label}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" style={starBtn} onClick={() => dispatch({ kind: "addAfter", from: n.id, label: "New Stop" })}>
          ＋
        </button>
        <button type="button" style={starBtn} title="parallel fork" onClick={() => dispatch({ kind: "addAfter", from: n.id, label: "Parallel Stop" })}>
          ⑃
        </button>
        <button type="button" style={{ ...starBtn, color: "#ff9a9a" }} onClick={() => dispatch({ kind: "removeNode", id: n.id })}>
          ×
        </button>
      </div>
    </div>
  );
}

const starBtn: React.CSSProperties = {
  fontSize: "0.7rem",
  padding: "0.1rem 0.4rem",
  border: "1px solid #34406a",
  background: "rgba(30,40,70,0.7)",
  color: "#aab4d0",
  borderRadius: 999,
  cursor: "pointer",
};
