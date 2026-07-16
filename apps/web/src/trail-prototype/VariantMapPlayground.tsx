/**
 * PROTOTYPE (issue #21) — Variant "Adventure playground".
 *
 * The Adventure-map theme (warm parchment, trodden gold trail, waypoint rings,
 * "you are here") made into a 2D playground: pan the whole map, zoom, and drag
 * waypoints anywhere. Progress reads exactly as in linear A — done waypoints are
 * filled gold with a check, the current one shows 3/5, covered ground is a solid
 * gold trail and the path ahead is faint. See ./README.md.
 */
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
import { usePlayground } from "./usePlayground";

const NODE_W = 168;
const NODE_H = 96;
const R = 32;
const GOLD = "#f2a900";

export function VariantMapPlayground({
  trail,
  dispatch,
}: {
  trail: Trail;
  dispatch: (a: TrailAction) => void;
}) {
  const pg = usePlayground(trail, dispatch, NODE_W, NODE_H);
  const nodeById = new Map(trail.nodes.map((n) => [n.id, n]));

  const frontier = trail.nodes.find((n) => {
    if (isDone(n)) return false;
    const preds = trail.edges.filter((e) => e.to === n.id).map((e) => e.from);
    return preds.every((p) => isDone(nodeById.get(p)!));
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes pg-spin { to { transform: rotate(360deg); } }
        .pg-burst { animation: pg-spin 9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .pg-burst { animation: none; } }
      `}</style>
      <div
        ref={pg.surfaceRef}
        {...pg.surface}
        style={{
          position: "relative",
          height: 540,
          borderRadius: 18,
          overflow: "hidden",
          cursor: pg.panning ? "grabbing" : "grab",
          background:
            "radial-gradient(130% 130% at 25% 10%, #fbf7ec 0%, #f2ead4 55%, #e9dcbb 100%)",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* faint contour-map texture that moves with the pan */}
        <div
          style={{
            position: "absolute",
            inset: -2000,
            backgroundImage:
              "radial-gradient(rgba(180,150,80,0.18) 1.3px, transparent 1.3px)",
            backgroundSize: `${30 * pg.view.s}px ${30 * pg.view.s}px`,
            backgroundPosition: `${pg.view.tx}px ${pg.view.ty}px`,
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "absolute", transformOrigin: "0 0", transform: pg.transform }}>
          <svg width={5000} height={4000} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
            {trail.edges.map((e, i) => {
              const a = pg.center(e.from);
              const b = pg.center(e.to);
              const mx = (a.x + b.x) / 2;
              const walked = isWalked(trail, e);
              return (
                <path
                  key={i}
                  d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                  fill="none"
                  stroke={walked ? GOLD : "#c9bd9a"}
                  strokeWidth={walked ? 9 : 6}
                  strokeLinecap="round"
                  strokeDasharray={walked ? undefined : "1 14"}
                />
              );
            })}
            {pg.linking && (
              <line x1={pg.center(pg.linking.from).x} y1={pg.center(pg.linking.from).y} x2={pg.linking.x} y2={pg.linking.y} stroke="#e0a83c" strokeWidth={5} strokeDasharray="6 6" />
            )}
          </svg>

          {trail.nodes.map((n) => {
            const at = pg.place(n.id);
            const done = isDone(n);
            const underway = isUnderway(n);
            const isFrontier = frontier?.id === n.id;
            return (
              <div
                key={n.id}
                onPointerDown={(e) => pg.startNodeDrag(n.id, e)}
                onPointerUp={() => pg.tryConnect(n.id)}
                style={{ position: "absolute", left: at.x, top: at.y, width: NODE_W, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "grab" }}
              >
                {isFrontier && (
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#c0392b", letterSpacing: "0.06em" }}>▾ YOU ARE HERE</div>
                )}
                <div
                  style={{
                    position: "relative",
                    width: R * 2 + 12,
                    height: R * 2 + 12,
                    borderRadius: "50%",
                    background: done ? GOLD : underway ? "#fff7e6" : "#f4efe0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isFrontier
                      ? "0 0 0 3px #c0392b, 0 8px 16px rgba(242,169,0,0.3)"
                      : done
                        ? "0 8px 18px rgba(242,169,0,0.4)"
                        : "inset 0 0 0 2px rgba(0,0,0,0.06)",
                  }}
                >
                  {/* dopamine: a planted flag + sunburst rays on a completed waypoint */}
                  {done && (
                    <>
                      <div className="pg-burst" style={{ position: "absolute", inset: -10, borderRadius: "50%", background: "conic-gradient(from 0deg, rgba(242,169,0,0) 0deg, rgba(242,169,0,0.35) 20deg, rgba(242,169,0,0) 40deg, rgba(242,169,0,0.35) 60deg, rgba(242,169,0,0) 80deg, rgba(242,169,0,0.35) 100deg, rgba(242,169,0,0) 120deg, rgba(242,169,0,0.35) 140deg, rgba(242,169,0,0) 160deg, rgba(242,169,0,0.35) 180deg, rgba(242,169,0,0) 200deg, rgba(242,169,0,0.35) 220deg, rgba(242,169,0,0) 240deg, rgba(242,169,0,0.35) 260deg, rgba(242,169,0,0) 280deg, rgba(242,169,0,0.35) 300deg, rgba(242,169,0,0) 320deg, rgba(242,169,0,0.35) 340deg, rgba(242,169,0,0) 360deg)", pointerEvents: "none" }} />
                      <div style={{ position: "absolute", top: -18, right: -6, fontSize: "1.1rem", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.25))" }}>🚩</div>
                    </>
                  )}
                  <ProgressRing size={R * 2} stroke={7} progress={progressOf(n)} done={done} track={done ? "rgba(255,255,255,0.5)" : "#e7dec4"} fill={done ? "#fff" : GOLD} center={<span style={{ fontSize: "0.68rem" }}>{`${n.done}/${n.total}`}</span>} />
                </div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#5a4a1f", textAlign: "center", lineHeight: 1.1 }}>{n.label}</div>
                <NodeButtons n={n} dispatch={dispatch} tint="#6b5a29" border="#ddd0a8" />
                <Port onDown={(e) => pg.startPort(n.id, e)} color={GOLD} top={R + 6} />
              </div>
            );
          })}
        </div>

        <ResetBtn onReset={pg.resetView} scale={pg.view.s} dark={false} />
      </div>
      <p style={{ fontSize: "0.8rem", color: "#7a6f52", marginTop: "0.75rem" }}>
        Roam the map — drag the background to pan, scroll to zoom, drag waypoints
        anywhere. Covered ground stays solid gold; the trail ahead is faint. Drag a
        waypoint's dot onto another to link.
      </p>
    </div>
  );
}

function NodeButtons({ n, dispatch, tint, border }: { n: StopNode; dispatch: (a: TrailAction) => void; tint: string; border: string }) {
  const b: React.CSSProperties = { fontSize: "0.68rem", padding: "0.08rem 0.38rem", border: `1px solid ${border}`, background: "rgba(255,255,255,0.75)", color: tint, borderRadius: 999, cursor: "pointer" };
  return (
    <div style={{ display: "flex", gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" style={b} title="advance" onClick={() => dispatch({ kind: "bump", id: n.id })}>▸</button>
      <button type="button" style={b} title="add next" onClick={() => dispatch({ kind: "addAfter", from: n.id, label: "New Stop" })}>＋</button>
      <button type="button" style={{ ...b, color: "#a33" }} onClick={() => dispatch({ kind: "removeNode", id: n.id })}>×</button>
    </div>
  );
}

function Port({ onDown, color, top }: { onDown: (e: React.PointerEvent) => void; color: string; top: number }) {
  return (
    <div
      onPointerDown={onDown}
      title="drag onto another Stop to link (2 links = fork)"
      style={{ position: "absolute", right: 8, top, width: 16, height: 16, borderRadius: "50%", background: color, border: "2px solid #fff", cursor: "crosshair", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
    />
  );
}

function ResetBtn({ onReset, scale, dark }: { onReset: () => void; scale: number; dark: boolean }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onReset}
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        fontSize: "0.72rem",
        padding: "0.3rem 0.6rem",
        border: dark ? "1px solid #34406a" : "1px solid #cdbf98",
        background: dark ? "rgba(20,28,52,0.8)" : "rgba(255,255,255,0.9)",
        color: dark ? "#c3c9e4" : "#6b5a29",
        borderRadius: 999,
        cursor: "pointer",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {Math.round(scale * 100)}% · reset
    </button>
  );
}

export { NodeButtons, Port, ResetBtn };
