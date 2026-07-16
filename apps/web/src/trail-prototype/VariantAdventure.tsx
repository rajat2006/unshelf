/**
 * PROTOTYPE (issue #21) — Variant "Adventure map" (chosen direction, polished).
 *
 * Horizontal. A game-world journey: a meandering trail runs left→right over a
 * warm topographic map, Stops are waypoint medallions with a completion ring, the
 * ground you've covered is a solid trodden trail while the path ahead is faint,
 * and a "you are here" pin sits at the frontier. Finished waypoints show a clean
 * drawn check; the current one shows 3/5. Every control has a hover tooltip. Click
 * a waypoint to advance it and watch the trail fill in behind you. See README.
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
const LANE_H = 152;
const PAD = 76;
const R = 34;

const DONE = "#e8930c";
const DONE_HI = "#ffc04d";
const TRACK = "#e7dec4";
const TRODDEN = "#e8930c";
const AHEAD = "#c9c0aa";
const INK = "#5a4a1f";

export function VariantAdventure({
  trail,
  dispatch,
}: {
  trail: Trail;
  dispatch: (a: TrailAction) => void;
}) {
  const g = grid(trail);
  const nodeById = new Map(trail.nodes.map((n) => [n.id, n]));
  const wander = (p: Placed) => Math.sin(p.depth * 1.1 + p.lane * 2) * 16;
  const cx = (p: Placed) => PAD + p.depth * COL_W + R;
  const cy = (p: Placed) => PAD + p.lane * LANE_H + R + wander(p);
  const width = PAD * 2 + Math.max(1, g.depthCount) * COL_W;
  const height = PAD * 2 + Math.max(1, g.laneCount) * LANE_H;

  const frontier = trail.nodes.find((n) => {
    if (isDone(n)) return false;
    const preds = trail.edges.filter((e) => e.to === n.id).map((e) => e.from);
    return preds.every((p) => isDone(nodeById.get(p)!));
  });

  // Drag the background to pan the whole trail. Waypoints stop propagation, so
  // grabbing empty map pans, grabbing a waypoint operates it — and because pan is
  // just a viewport offset, no Stop position is stored (ADR-0010 holds).
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const panFrom = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Manual rearrange: a per-Stop offset from its derived position, so you can nudge
  // a waypoint to make a fork read clearly. These offsets are VIEW-ONLY — in-memory,
  // never written to the model/edges — so ADR-0010's "no stored layout" still holds.
  // (Persisting them would be the stored-position trade-off, deliberately not taken.)
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
  // Click-vs-drag guard: a waypoint's "advance" only fires when it wasn't dragged.
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
          borderRadius: 18,
          boxShadow: "inset 0 0 0 1px rgba(120,95,40,0.12)",
          cursor: grabbing ? "grabbing" : "grab",
          background: "#f4ecd6",
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
              "radial-gradient(125% 130% at 12% 0%, #fcf8ee 0%, #f4ecd6 52%, #ead9b6 100%)",
          }}
        >
          {/* map texture: faint graticule + topographic contours + edge vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "linear-gradient(rgba(150,120,60,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(150,120,60,0.06) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
              pointerEvents: "none",
            }}
          />
          <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* topographic contour rings for terrain flavour */}
            {[
              { cx: width * 0.82, cy: height * 0.24 },
              { cx: width * 0.18, cy: height * 0.8 },
            ].map((c, i) =>
              [0, 1, 2, 3].map((k) => (
                <circle key={`${i}-${k}`} cx={c.cx} cy={c.cy} r={26 + k * 22} fill="none" stroke="rgba(150,120,60,0.10)" strokeWidth={1.5} />
              )),
            )}
          </svg>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(120,90,40,0.10) 100%)", pointerEvents: "none" }} />
          <Compass x={PAD - 18} y={PAD - 34} />

          <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* soft shadow under the trail for depth */}
            {trail.edges.map((e, i) => (
              <TrailSeg key={`s${i}`} pos={posById} e={e} stroke="rgba(120,90,40,0.10)" width={12} yOffset={3} />
            ))}
            {trail.edges.map((e, i) => (
              <TrailSeg key={`u${i}`} pos={posById} e={e} stroke={AHEAD} width={6} dotted />
            ))}
            {trail.edges.filter((e) => isWalked(trail, e)).map((e, i) => (
              <TrailSeg key={`w${i}`} pos={posById} e={e} stroke={TRODDEN} width={9} />
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
              fontSize: "0.72rem",
              padding: "0.3rem 0.6rem",
              border: "1px solid #cdbf98",
              background: "rgba(255,255,255,0.92)",
              color: "#6b5a29",
              borderRadius: 999,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(120,90,40,0.18)",
            }}
          >
            ↺ reset layout
          </button>
        )}
      </div>
      <p style={{ fontSize: "0.8rem", color: "#7a6f52", marginTop: "0.75rem" }}>
        Ground you've covered is the solid gold trail; the path ahead stays faint.
        <strong> Drag the map to move the whole trail, or drag a single waypoint to
        rearrange it</strong> (↺ resets); click a waypoint to advance it and the
        trail fills in behind you. Hover any control for what it does.
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
  yOffset = 0,
}: {
  pos: Map<string, { x: number; y: number }>;
  e: { from: string; to: string };
  stroke: string;
  width: number;
  dotted?: boolean;
  yOffset?: number;
}) {
  const a = pos.get(e.from);
  const b = pos.get(e.to);
  if (!a || !b) return null;
  const x1 = a.x;
  const y1 = a.y + yOffset;
  const x2 = b.x;
  const y2 = b.y + yOffset;
  const mx = (x1 + x2) / 2;
  return (
    <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeDasharray={dotted ? "1 14" : undefined} />
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
        // Grabbing the waypoint drags this Stop (not the whole map): stop the pan,
        // and start a node drag that the parent tracks.
        e.stopPropagation();
        onDragStart(e);
      }}
      style={{ position: "absolute", left: x - 96, top: y - R - 14, width: 192, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "grab", touchAction: "none" }}
    >
      {isFrontier && (
        <div style={{ fontSize: "0.58rem", fontWeight: 800, color: "#fff", background: "#c0392b", padding: "0.1rem 0.45rem", borderRadius: 999, letterSpacing: "0.06em", boxShadow: "0 2px 5px rgba(192,57,43,0.4)" }}>
          YOU ARE HERE
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
            filter: done ? "drop-shadow(0 5px 12px rgba(232,147,12,0.5))" : underway ? "drop-shadow(0 3px 8px rgba(232,147,12,0.28))" : "none",
          }}
        >
          <div
            style={{
              width: R * 2 + 12,
              height: R * 2 + 12,
              borderRadius: "50%",
              background: done ? `radial-gradient(circle at 38% 32%, ${DONE_HI}, ${DONE})` : underway ? "#fffaf0" : "#f5f0e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: isFrontier ? "0 0 0 3px #c0392b" : done ? "inset 0 -3px 6px rgba(150,80,0,0.25)" : "inset 0 0 0 2px rgba(0,0,0,0.05)",
            }}
          >
            {done ? (
              <Check size={R * 2} />
            ) : (
              <ProgressRing size={R * 2} stroke={7} progress={progressOf(n)} done={false} track={TRACK} fill={DONE} center={<span style={{ fontSize: "0.72rem", fontWeight: 700, color: INK }}>{`${n.done}/${n.total}`}</span>} />
            )}
          </div>
        </button>
      </Tip>
      <div
        style={{
          fontSize: "0.82rem",
          fontWeight: 700,
          color: INK,
          textAlign: "center",
          lineHeight: 1.15,
          background: "rgba(252,248,238,0.72)",
          padding: "0.05rem 0.4rem",
          borderRadius: 6,
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
          <button type="button" style={{ ...advBtn, color: "#a33" }} onClick={() => dispatch({ kind: "removeNode", id: n.id })}>×</button>
        </Tip>
      </div>
    </div>
  );
}

/** A clean drawn checkmark for a completed waypoint (replaces the glyph tick). */
function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      <path d="M5.5 12.5 L10 17 L18.5 7.5" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Decorative compass rose — a small map flourish. */
function Compass({ x, y }: { x: number; y: number }) {
  return (
    <svg width={54} height={54} viewBox="0 0 54 54" style={{ position: "absolute", left: x, top: y, opacity: 0.5, pointerEvents: "none" }}>
      <circle cx={27} cy={27} r={20} fill="none" stroke="#a8894e" strokeWidth={1.5} />
      <circle cx={27} cy={27} r={14} fill="none" stroke="#a8894e" strokeWidth={0.8} />
      <path d="M27 7 L31 27 L27 47 L23 27 Z" fill="#c0392b" opacity={0.75} />
      <path d="M7 27 L27 23 L47 27 L27 31 Z" fill="#a8894e" opacity={0.65} />
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
    background: #3a2f18; color: #fff; font-size: 0.66rem; font-weight: 500;
    padding: 0.22rem 0.5rem; border-radius: 6px; white-space: nowrap;
    opacity: 0; pointer-events: none; transition: opacity .12s ease; z-index: 30;
    box-shadow: 0 4px 12px rgba(0,0,0,0.22);
  }
  .tw-tip-label::after {
    content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    border: 4px solid transparent; border-top-color: #3a2f18;
  }
  .tw-tip:hover .tw-tip-label { opacity: 1; }
  .tw-ring { transition: transform .12s ease; }
  .tw-ring:hover { transform: scale(1.06); }
  @media (prefers-reduced-motion: reduce) { .tw-ring { transition: none; } }
`;

const advBtn: React.CSSProperties = {
  fontSize: "0.78rem",
  width: "1.7rem",
  height: "1.7rem",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #ddd0a8",
  background: "rgba(255,255,255,0.85)",
  color: "#6b5a29",
  borderRadius: 999,
  cursor: "pointer",
};
