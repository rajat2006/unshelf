/**
 * PROTOTYPE (issue #21) — throwaway. The shared playground *interaction* engine:
 * pan the whole Trail, zoom toward the cursor, drag Stops freely in 2D, and drag
 * a port onto another Stop to link. Only the plumbing is shared — each themed
 * playground (adventure map, space) renders its own world on top. This is
 * interaction, not layout: the two variants look nothing alike.
 */
import { useRef, useState } from "react";
import { grid } from "./geometry";
import { canConnect, type Trail, type TrailAction } from "./model";

export interface XY {
  x: number;
  y: number;
}
interface View {
  tx: number;
  ty: number;
  s: number;
}
type Drag =
  | { type: "pan"; startX: number; startY: number; ox: number; oy: number }
  | { type: "node"; id: string; dx: number; dy: number }
  | { type: "connect"; from: string; x: number; y: number }
  | null;

const COL_W = 250;
const LANE_H = 160;

export function usePlayground(
  trail: Trail,
  dispatch: (a: TrailAction) => void,
  nodeW: number,
  nodeH: number,
) {
  const g = grid(trail);
  const [pos, setPos] = useState<Record<string, XY>>({});
  const [view, setView] = useState<View>({ tx: 0, ty: 0, s: 1 });
  const [drag, setDrag] = useState<Drag>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const place = (id: string): XY => {
    if (pos[id]) return pos[id];
    const p = g.byId.get(id);
    return { x: 80 + (p?.depth ?? 0) * COL_W, y: 70 + (p?.lane ?? 0) * LANE_H };
  };
  const center = (id: string): XY => {
    const p = place(id);
    return { x: p.x + nodeW / 2, y: p.y + nodeH / 2 };
  };
  const toCanvas = (e: { clientX: number; clientY: number }): XY => {
    const r = surfaceRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.tx) / view.s,
      y: (e.clientY - r.top - view.ty) / view.s,
    };
  };

  const onPointerDown = (e: React.PointerEvent) =>
    setDrag({ type: "pan", startX: e.clientX, startY: e.clientY, ox: view.tx, oy: view.ty });

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.type === "pan") {
      setView((v) => ({ ...v, tx: drag.ox + (e.clientX - drag.startX), ty: drag.oy + (e.clientY - drag.startY) }));
    } else if (drag.type === "node") {
      const c = toCanvas(e);
      setPos((p) => ({ ...p, [drag.id]: { x: c.x - drag.dx, y: c.y - drag.dy } }));
    } else if (drag.type === "connect") {
      const c = toCanvas(e);
      setDrag({ ...drag, x: c.x, y: c.y });
    }
  };

  const onPointerUp = () => setDrag(null);

  const onWheel = (e: React.WheelEvent) => {
    const r = surfaceRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView((v) => {
      const s = Math.min(1.7, Math.max(0.4, v.s * (e.deltaY < 0 ? 1.08 : 0.925)));
      const k = s / v.s;
      return { s, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
    });
  };

  const startNodeDrag = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const c = toCanvas(e);
    const p = place(id);
    setDrag({ type: "node", id, dx: c.x - p.x, dy: c.y - p.y });
  };
  const startPort = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const c = toCanvas(e);
    setDrag({ type: "connect", from: id, x: c.x, y: c.y });
  };
  const tryConnect = (to: string) => {
    if (drag?.type === "connect" && canConnect(trail, drag.from, to)) {
      dispatch({ kind: "connect", from: drag.from, to });
    }
  };

  return {
    surfaceRef,
    view,
    place,
    center,
    /** The live connect-drag rubber-band, if any. */
    linking: drag?.type === "connect" ? drag : null,
    panning: drag?.type === "pan",
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
    surface: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave: onPointerUp, onWheel },
    startNodeDrag,
    startPort,
    tryConnect,
    resetView: () => setView({ tx: 0, ty: 0, s: 1 }),
  };
}
