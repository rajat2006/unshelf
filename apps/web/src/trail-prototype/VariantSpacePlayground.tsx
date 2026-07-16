/**
 * PROTOTYPE (issue #21) — Variant "Space playground" (the rich one).
 *
 * The constellation theme turned into an explorable galaxy you fly through: pan,
 * zoom, drag star-systems around a nebula-lit void. The reward loop is the point
 * — a Stop you haven't started is a dim planet; one underway glows with a partial
 * ring; a finished Stop ignites into a radiant SUN with turning rays and a halo,
 * and the warp-route out of it charges with flowing light. Finishing should feel
 * like something happened. See ./README.md.
 */
import {
  isDone,
  isUnderway,
  progressOf,
  isWalked,
  type StopNode,
  type Trail,
  type TrailAction,
} from "./model";
import { ProgressRing } from "./ProgressRing";
import { usePlayground } from "./usePlayground";
import { NodeButtons, Port, ResetBtn } from "./VariantMapPlayground";

const NODE_W = 168;
const NODE_H = 118;
const ORB = 58;

export function VariantSpacePlayground({
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
  // index-derived twinkle field (no Math.random — scripts forbid it, and this
  // keeps the field stable across renders so stars don't jump).
  const stars = Array.from({ length: 90 }, (_, i) => ({
    x: (i * 137) % 2400,
    y: (i * 89) % 1500,
    r: (i % 4) * 0.4 + 0.5,
    d: (i % 7) * 0.5,
  }));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes sp-spin { to { transform: rotate(360deg); } }
        @keyframes sp-pulse { 0%,100% { transform: scale(1); opacity: .85 } 50% { transform: scale(1.08); opacity: 1 } }
        @keyframes sp-twinkle { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        @keyframes sp-flow { to { stroke-dashoffset: -28; } }
        @keyframes sp-drift { 0%,100% { transform: translate(0,0) } 50% { transform: translate(18px,-12px) } }
        .sp-rays { animation: sp-spin 18s linear infinite; }
        .sp-sun { animation: sp-pulse 3.4s ease-in-out infinite; }
        .sp-tw { animation: sp-twinkle 3s ease-in-out infinite; }
        .sp-flow { stroke-dasharray: 4 8; animation: sp-flow 1s linear infinite; }
        .sp-neb { animation: sp-drift 22s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .sp-rays,.sp-sun,.sp-tw,.sp-flow,.sp-neb { animation: none; }
        }
      `}</style>

      <div
        ref={pg.surfaceRef}
        {...pg.surface}
        style={{
          position: "relative",
          height: 560,
          borderRadius: 18,
          overflow: "hidden",
          cursor: pg.panning ? "grabbing" : "grab",
          background: "radial-gradient(130% 120% at 25% 5%, #1a2450 0%, #121a38 45%, #080b1c 100%)",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* ambient nebulae (fixed, drifting) */}
        <div className="sp-neb" style={nebula("60% 50% at 20% 30%", "rgba(126,87,255,0.35)")} />
        <div className="sp-neb" style={{ ...nebula("55% 45% at 75% 65%", "rgba(35,180,214,0.28)"), animationDelay: "6s" }} />
        <div className="sp-neb" style={{ ...nebula("50% 50% at 55% 20%", "rgba(255,92,170,0.20)"), animationDelay: "11s" }} />

        <div style={{ position: "absolute", transformOrigin: "0 0", transform: pg.transform }}>
          <svg width={5000} height={4000} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
            <defs>
              <linearGradient id="warp" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8ee3ff" />
                <stop offset="100%" stopColor="#b78bff" />
              </linearGradient>
              <filter id="sp-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="3.5" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {stars.map((s, i) => (
              <circle key={i} className="sp-tw" cx={s.x} cy={s.y} r={s.r} fill="#dfeaff" style={{ animationDelay: `${s.d}s` }} />
            ))}

            {/* ahead routes (dim) */}
            {trail.edges.filter((e) => !isWalked(trail, e)).map((e, i) => {
              const a = pg.center(e.from);
              const b = pg.center(e.to);
              const mx = (a.x + b.x) / 2;
              return <path key={`a${i}`} d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`} fill="none" stroke="#39456e" strokeWidth={2} strokeDasharray="2 9" opacity={0.7} />;
            })}
            {/* charged routes (bright, flowing) */}
            {trail.edges.filter((e) => isWalked(trail, e)).map((e, i) => {
              const a = pg.center(e.from);
              const b = pg.center(e.to);
              const mx = (a.x + b.x) / 2;
              const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
              return (
                <g key={`w${i}`} filter="url(#sp-glow)">
                  <path d={d} fill="none" stroke="url(#warp)" strokeWidth={3} opacity={0.5} />
                  <path className="sp-flow" d={d} fill="none" stroke="#eaf6ff" strokeWidth={2.5} strokeLinecap="round" />
                </g>
              );
            })}
            {pg.linking && <line x1={pg.center(pg.linking.from).x} y1={pg.center(pg.linking.from).y} x2={pg.linking.x} y2={pg.linking.y} stroke="#8ee3ff" strokeWidth={3} strokeDasharray="6 6" />}
          </svg>

          {trail.nodes.map((n) => {
            const at = pg.place(n.id);
            return (
              <Body
                key={n.id}
                n={n}
                x={at.x}
                y={at.y}
                isFrontier={frontier?.id === n.id}
                onNodeDown={(e) => pg.startNodeDrag(n.id, e)}
                onPortDown={(e) => pg.startPort(n.id, e)}
                onDropConnect={() => pg.tryConnect(n.id)}
                dispatch={dispatch}
              />
            );
          })}
        </div>

        <ResetBtn onReset={pg.resetView} scale={pg.view.s} dark />
      </div>
      <p style={{ fontSize: "0.8rem", color: "#8b93ad", marginTop: "0.75rem" }}>
        Fly through the galaxy — pan, zoom, drag systems around. A finished Stop
        ignites into a sun with turning rays, and the route out of it charges with
        flowing light. <strong>Advance a Stop and watch it light up.</strong>
      </p>
    </div>
  );
}

function Body({
  n,
  x,
  y,
  isFrontier,
  onNodeDown,
  onPortDown,
  onDropConnect,
  dispatch,
}: {
  n: StopNode;
  x: number;
  y: number;
  isFrontier: boolean;
  onNodeDown: (e: React.PointerEvent) => void;
  onPortDown: (e: React.PointerEvent) => void;
  onDropConnect: () => void;
  dispatch: (a: TrailAction) => void;
}) {
  const done = isDone(n);
  const underway = isUnderway(n);
  return (
    <div
      onPointerDown={onNodeDown}
      onPointerUp={onDropConnect}
      style={{ position: "absolute", left: x, top: y, width: NODE_W, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "grab" }}
    >
      {isFrontier && <div style={{ fontSize: "1.1rem" }}>🚀</div>}
      <div style={{ position: "relative", width: ORB + 26, height: ORB + 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* the reward: rays + halo once complete */}
        {done && (
          <>
            <div className="sp-rays" style={{ position: "absolute", inset: -6, borderRadius: "50%", background: "conic-gradient(from 0deg, rgba(255,214,120,0) 0deg, rgba(255,214,120,0.55) 12deg, rgba(255,214,120,0) 24deg, rgba(255,214,120,0.55) 36deg, rgba(255,214,120,0) 48deg, rgba(255,214,120,0.55) 60deg, rgba(255,214,120,0) 72deg, rgba(255,214,120,0.55) 84deg, rgba(255,214,120,0) 96deg, rgba(255,214,120,0.55) 108deg, rgba(255,214,120,0) 120deg, rgba(255,214,120,0.55) 132deg, rgba(255,214,120,0) 144deg, rgba(255,214,120,0.55) 156deg, rgba(255,214,120,0) 168deg, rgba(255,214,120,0.55) 180deg, rgba(255,214,120,0) 192deg, rgba(255,214,120,0.55) 204deg, rgba(255,214,120,0) 216deg, rgba(255,214,120,0.55) 228deg, rgba(255,214,120,0) 240deg, rgba(255,214,120,0.55) 252deg, rgba(255,214,120,0) 264deg, rgba(255,214,120,0.55) 276deg, rgba(255,214,120,0) 288deg, rgba(255,214,120,0.55) 300deg, rgba(255,214,120,0) 312deg, rgba(255,214,120,0.55) 324deg, rgba(255,214,120,0) 336deg, rgba(255,214,120,0.55) 348deg, rgba(255,214,120,0) 360deg)", filter: "blur(0.5px)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 2, borderRadius: "50%", boxShadow: "0 0 26px 6px rgba(255,196,84,0.55)", pointerEvents: "none" }} />
          </>
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => dispatch({ kind: "bump", id: n.id })}
          className={done ? "sp-sun" : undefined}
          title="advance progress"
          style={{
            position: "relative",
            width: ORB,
            height: ORB,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background: done
              ? "radial-gradient(circle at 38% 32%, #fff6d8 0%, #ffce5a 45%, #ff9d3d 100%)"
              : underway
                ? "radial-gradient(circle at 38% 32%, #7d8bc0 0%, #3a4a80 60%, #263056 100%)"
                : "radial-gradient(circle at 38% 32%, #4a5680 0%, #2b3557 70%, #1b2340 100%)",
            boxShadow: done ? "inset -6px -6px 12px rgba(180,90,0,0.4)" : "inset -5px -5px 10px rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ProgressRing
            size={ORB - 6}
            stroke={5}
            progress={progressOf(n)}
            done={done}
            track="rgba(255,255,255,0.18)"
            fill={done ? "#7a3d00" : "#9fd7ff"}
            center={<span style={{ fontSize: "0.6rem", color: done ? "#7a3d00" : "#d7e6ff" }}>{`${n.done}/${n.total}`}</span>}
          />
        </button>
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: done ? "#ffe8b0" : "#c2cbe6", textAlign: "center", lineHeight: 1.1, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
        {n.label}
      </div>
      <NodeButtons n={n} dispatch={dispatch} tint="#aeb8d6" border="#39456e" />
      <Port onDown={onPortDown} color="#8ee3ff" top={ORB / 2 + 8} />
    </div>
  );
}

function nebula(shape: string, color: string): React.CSSProperties {
  return {
    position: "absolute",
    width: 520,
    height: 420,
    left: shape.includes("20%") ? "5%" : shape.includes("75%") ? "55%" : "35%",
    top: shape.includes("30%") ? "20%" : shape.includes("65%") ? "45%" : "-5%",
    background: `radial-gradient(${shape}, ${color}, transparent 70%)`,
    filter: "blur(28px)",
    pointerEvents: "none",
  };
}
