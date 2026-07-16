/**
 * PROTOTYPE (issue #21) — Variant "Adventure map — professional".
 *
 * Same horizontal trail as A, but restyled to read as a considered, adult
 * cartographic product rather than a mobile game (A is left untouched):
 *
 *   - Restrained two-tone palette. PINE = done/summited, OCHRE = where you are now.
 *     Both desaturated; no glows, no bursts, no candy gold.
 *   - Completion is a SEALED node — a solid, matte pine disc with an engraved rim,
 *     not a glowing coin and not a checkmark. A full disc against hollow rings reads
 *     as done on its own.
 *   - Thinner trail, smaller medallions, editorial small-caps labels — more paper
 *     map / survey chart, less game HUD.
 *
 * Pan + per-waypoint drag behave exactly as in A. See README.
 */
import { useRef, useState } from "react";
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

const COL_W = 240;
const LANE_H = 150;
const PAD = 76;
const R = 29;

// Two desaturated tones: pine = achieved, ochre = current. Nothing else is coloured.
const PINE = "#356a5b";
const PINE_DK = "#2b564a";
const OCHRE = "#9c7328";
const WALKED = "#4d7a6d";
const AHEAD = "#c6bea9";
const TRACK = "#d9d1bd";
const INK = "#3c3529";
const MUTE = "#8a806a";

export function VariantAdventureRefined({
  trail,
  dispatch,
}: {
  trail: Trail;
  dispatch: (a: TrailAction) => void;
}) {
  const g = grid(trail);
  const nodeById = new Map(trail.nodes.map((n) => [n.id, n]));
  const wander = (p: Placed) => Math.sin(p.depth * 1.1 + p.lane * 2) * 14;
  const cx = (p: Placed) => PAD + p.depth * COL_W + R;
  const cy = (p: Placed) => PAD + p.lane * LANE_H + R + wander(p);
  const width = PAD * 2 + Math.max(1, g.depthCount) * COL_W;
  const height = PAD * 2 + Math.max(1, g.laneCount) * LANE_H;

  const frontier = trail.nodes.find((n) => {
    if (isDone(n)) return false;
    const preds = trail.edges.filter((e) => e.to === n.id).map((e) => e.from);
    return preds.every((p) => isDone(nodeById.get(p)!));
  });

  // Pan the whole trail (drag background) — a pure viewport offset, no stored state.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const panFrom = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Per-Stop manual offset for rearranging — VIEW-ONLY, never written to the model
  // (ADR-0010's "no stored layout" still holds).
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const dragNode = useRef<
    { id: string; sx: number; sy: number; odx: number; ody: number } | null
  >(null);
  const moved = useRef(false);

  const startNodeDrag = (id: string, e: React.PointerEvent) => {
    const o = offsets[id];
    dragNode.current = { id, sx: e.clientX, sy: e.clientY, odx: o?.dx ?? 0, ody: o?.dy ?? 0 };
    moved.current = false;
    setGrabbing(true);
  };
  const advance = (id: string) => {
    if (moved.current) return;
    dispatch({ kind: "bump", id });
  };

  const onPanDown = (e: React.PointerEvent) => {
    panFrom.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
    setGrabbing(true);
  };
  const onPanMove = (e: React.PointerEvent) => {
    const d = dragNode.current;
    if (d) {
      const ddx = e.clientX - d.sx;
      const ddy = e.clientY - d.sy;
      if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) moved.current = true;
      setOffsets((prev) => ({ ...prev, [d.id]: { dx: d.odx + ddx, dy: d.ody + ddy } }));
      return;
    }
    const f = panFrom.current;
    if (!f) return;
    setPan({ x: f.ox + (e.clientX - f.sx), y: f.oy + (e.clientY - f.sy) });
  };
  const onPanUp = () => {
    panFrom.current = null;
    dragNode.current = null;
    setGrabbing(false);
  };

  const off = (id: string) => offsets[id] ?? { dx: 0, dy: 0 };
  const posById = new Map<string, { x: number; y: number }>(
    g.placed.map((p) => [p.id, { x: cx(p) + off(p.id).dx, y: cy(p) + off(p.id).dy }]),
  );
  const rearranged = Object.keys(offsets).length > 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{TIP_CSS}</style>
      <div
        onPointerDown={onPanDown}
        onPointerMove={onPanMove}
        onPointerUp={onPanUp}
        onPointerLeave={onPanUp}
        style={{
          position: "relative",
          height: Math.min(height, 600),
          overflow: "hidden",
          borderRadius: 10,
          boxShadow: "inset 0 0 0 1px rgba(90,78,52,0.16)",
          cursor: grabbing ? "grabbing" : "grab",
          background: "#eee8da",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            width,
            height,
            background:
              "linear-gradient(155deg, #f3efe4 0%, #ece6d7 55%, #e3dcc9 100%)",
          }}
        >
          {/* survey-chart texture: fine graticule + faint contour lines */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(120,100,60,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(120,100,60,0.045) 1px, transparent 1px)",
              backgroundSize: "38px 38px",
              pointerEvents: "none",
            }}
          />
          <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {[
              { cx: width * 0.83, cy: height * 0.22 },
              { cx: width * 0.16, cy: height * 0.82 },
            ].map((c, i) =>
              [0, 1, 2, 3, 4].map((k) => (
                <circle key={`${i}-${k}`} cx={c.cx} cy={c.cy} r={22 + k * 20} fill="none" stroke="rgba(120,100,60,0.07)" strokeWidth={1} />
              )),
            )}
          </svg>
          <Compass x={PAD - 20} y={PAD - 36} />

          <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* trail: faint dotted ahead, solid muted pine for ground already walked */}
            {trail.edges.map((e, i) => (
              <TrailSeg key={`u${i}`} pos={posById} e={e} stroke={AHEAD} width={3.5} dotted />
            ))}
            {trail.edges.filter((e) => isWalked(trail, e)).map((e, i) => (
              <TrailSeg key={`w${i}`} pos={posById} e={e} stroke={WALKED} width={5} />
            ))}
          </svg>

          {g.placed.map((p) => {
            const n = nodeById.get(p.id)!;
            const pos = posById.get(p.id)!;
            return (
              <Waypoint
                key={p.id}
                n={n}
                x={pos.x}
                y={pos.y}
                isFrontier={frontier?.id === p.id}
                dispatch={dispatch}
                onDragStart={(e) => startNodeDrag(p.id, e)}
                onAdvance={() => advance(p.id)}
              />
            );
          })}
        </div>

        {rearranged && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setOffsets({})}
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              fontSize: "0.7rem",
              letterSpacing: "0.03em",
              padding: "0.3rem 0.6rem",
              border: "1px solid #cabf9f",
              background: "rgba(248,244,235,0.94)",
              color: "#6b5f43",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ↺ reset layout
          </button>
        )}
      </div>
      <p style={{ fontSize: "0.8rem", color: "#7a6f52", marginTop: "0.75rem" }}>
        <strong style={{ color: PINE }}>Pine = completed</strong> (and ground you've
        covered); <strong style={{ color: OCHRE }}>ochre = where you are now</strong>.
        Drag the map to pan, drag a waypoint to rearrange it (↺ resets), click a
        waypoint to advance.
      </p>
    </div>
  );
}

function TrailSeg({
  pos,
  e,
  stroke,
  width,
  dotted,
}: {
  pos: Map<string, { x: number; y: number }>;
  e: { from: string; to: string };
  stroke: string;
  width: number;
  dotted?: boolean;
}) {
  const a = pos.get(e.from);
  const b = pos.get(e.to);
  if (!a || !b) return null;
  const mx = (a.x + b.x) / 2;
  return (
    <path d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeDasharray={dotted ? "1 12" : undefined} />
  );
}

function Waypoint({
  n,
  x,
  y,
  isFrontier,
  dispatch,
  onDragStart,
  onAdvance,
}: {
  n: StopNode;
  x: number;
  y: number;
  isFrontier: boolean;
  dispatch: (a: TrailAction) => void;
  onDragStart: (e: React.PointerEvent) => void;
  onAdvance: () => void;
}) {
  const done = isDone(n);
  const underway = isUnderway(n);
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        onDragStart(e);
      }}
      style={{ position: "absolute", left: x - 96, top: y - R - 16, width: 192, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "grab", touchAction: "none" }}
    >
      {isFrontier && (
        <div style={{ fontSize: "0.55rem", fontWeight: 700, color: OCHRE, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          You are here
        </div>
      )}
      <Tip label={done ? "Completed — click to reopen" : "Advance — mark one Item done"}>
        <button
          type="button"
          className="tw-ring"
          onClick={onAdvance}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            borderRadius: "50%",
            position: "relative",
          }}
        >
          {done ? (
            <Seal />
          ) : (
            <div
              style={{
                width: R * 2,
                height: R * 2,
                borderRadius: "50%",
                background: underway ? "#faf8f1" : "#f0ece0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isFrontier
                  ? `0 0 0 1.5px ${OCHRE}`
                  : "inset 0 0 0 1px rgba(80,66,40,0.14)",
              }}
            >
              <ProgressRing
                size={R * 2 - 8}
                stroke={5}
                progress={progressOf(n)}
                done={false}
                track={TRACK}
                fill={isFrontier ? OCHRE : underway ? OCHRE : MUTE}
                center={<span style={{ fontSize: "0.7rem", fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>{`${n.done}/${n.total}`}</span>}
              />
            </div>
          )}
        </button>
      </Tip>
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: done ? PINE : INK,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {n.label}
      </div>
      <div style={{ display: "flex", gap: 5 }} onPointerDown={(e) => e.stopPropagation()}>
        <Tip label="Add the next Stop in sequence">
          <button type="button" style={advBtn} onClick={() => dispatch({ kind: "addAfter", from: n.id, label: "New Stop" })}>＋</button>
        </Tip>
        <Tip label="Fork a parallel branch">
          <button type="button" style={advBtn} onClick={() => dispatch({ kind: "addAfter", from: n.id, label: "Parallel Stop" })}>⑃</button>
        </Tip>
        <Tip label="Remove this Stop">
          <button type="button" style={{ ...advBtn, color: "#9a4b3f" }} onClick={() => dispatch({ kind: "removeNode", id: n.id })}>×</button>
        </Tip>
      </div>
    </div>
  );
}

/**
 * A completed Stop: a matte pine disc with an engraved rim — a "sealed" milestone.
 * No glow, no coin sheen, no checkmark: a solid disc against hollow rings is enough
 * to read as done, and the muted fill keeps it adult rather than gamey.
 */
function Seal() {
  const s = R * 2;
  return (
    <div
      style={{
        width: s,
        height: s,
        borderRadius: "50%",
        background: `linear-gradient(160deg, ${PINE} 0%, ${PINE_DK} 100%)`,
        boxShadow: "0 1px 3px rgba(43,86,74,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        <circle cx={50} cy={50} r={33} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} />
        <circle cx={50} cy={50} r={27} fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth={1} />
      </svg>
    </div>
  );
}

/** Decorative compass rose — a small, muted survey-chart flourish. */
function Compass({ x, y }: { x: number; y: number }) {
  return (
    <svg width={50} height={50} viewBox="0 0 54 54" style={{ position: "absolute", left: x, top: y, opacity: 0.4, pointerEvents: "none" }}>
      <circle cx={27} cy={27} r={20} fill="none" stroke="#9a824e" strokeWidth={1} />
      <circle cx={27} cy={27} r={13} fill="none" stroke="#9a824e" strokeWidth={0.7} />
      <path d="M27 8 L30 27 L27 46 L24 27 Z" fill="#9a824e" opacity={0.8} />
      <path d="M8 27 L27 24 L46 27 L27 30 Z" fill="#9a824e" opacity={0.5} />
      <text x={27} y={6} textAnchor="middle" fontSize={7} fontWeight={700} fill="#8a6d3a">N</text>
    </svg>
  );
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="tw-tip">
      {children}
      <span className="tw-tip-label">{label}</span>
    </span>
  );
}

const TIP_CSS = `
  .tw-tip { position: relative; display: inline-flex; }
  .tw-tip-label {
    position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
    background: #2f2a20; color: #f4efe4; font-size: 0.66rem; font-weight: 500;
    padding: 0.22rem 0.5rem; border-radius: 5px; white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity .12s ease; z-index: 30;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }
  .tw-tip-label::after {
    content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    border: 4px solid transparent; border-top-color: #2f2a20;
  }
  .tw-tip:hover .tw-tip-label { opacity: 1; }
  .tw-ring { transition: transform .12s ease; }
  .tw-ring:hover { transform: scale(1.04); }
  @media (prefers-reduced-motion: reduce) { .tw-ring { transition: none; } }
`;

const advBtn: React.CSSProperties = {
  fontSize: "0.76rem",
  width: "1.6rem",
  height: "1.6rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d3c8a9",
  background: "rgba(250,247,240,0.9)",
  color: "#6b5f43",
  borderRadius: 6,
  cursor: "pointer",
};
