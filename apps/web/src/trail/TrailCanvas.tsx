import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { StopId, TrailId, TrailNode, TrailView } from "@unshelf/shared";
import { connectStops, createStop, disconnectStops } from "../api";
import type { CurrentUser } from "../application-auth";
import { canConnect, layout, type Placed } from "./geometry";
import { ProgressRing } from "./ProgressRing";

/**
 * The Trail canvas — the Adventure map ADR-0010 chose (prototype Variant R). The
 * User's Stops are waypoints on a horizontal trodden trail; sequence runs
 * left→right, a fork is a Stop with several out-edges, a join several in-edges.
 * Every position is *derived* from the topology (`layout`), never stored, so the
 * same edge set renders here on the desktop and, read-only, on the phone (US 40).
 *
 * Progress reads as a journey: a completed Stop is a sealed pine medallion, one
 * underway shows its ring filling, and the ground *behind* a completed Stop is
 * drawn as trail already walked — all derived from Item Statuses, nothing stored
 * on the Trail. On desktop it is authored by arranging, not data entry (US 39):
 * ＋ extends a Stop into the next, ⑃ forks a parallel branch — each creating a
 * Stop and linking it in one gesture — ⇢ links to an existing Stop (a join), and
 * ✕ on a segment rewires (US 37). A link that would close a cycle is never
 * offered (`canConnect`) and refused at the api besides.
 */

const COL_W = 240;
const LANE_H = 150;
const PAD = 76;
const R = 29;

// Two desaturated survey-chart tones: pine = achieved, ochre = where you are now.
const PINE = "#356a5b";
const PINE_DK = "#2b564a";
const OCHRE = "#9c7328";
const WALKED = "#4d7a6d";
const AHEAD = "#c6bea9";
const TRACK = "#d9d1bd";
const INK = "#3c3529";
const MUTE = "#8a806a";

const isDone = (n: TrailNode) => n.total > 0 && n.done >= n.total;
const isUnderway = (n: TrailNode) => n.done > 0 && n.done < n.total;
const progressOf = (n: TrailNode) => (n.total > 0 ? n.done / n.total : 0);

interface TrailCanvasProps {
  /** The Trail being authored — every Stop and edge is scoped to it (#94). */
  trailId: TrailId;
  trail: TrailView;
  user: CurrentUser;
  onTrailChanged: (trail: TrailView) => void;
  onRefresh: () => Promise<void>;
  /** Open this Trail's Stop at its URL-owned detail route (#95). */
  onOpenStop: (stopId: StopId) => void;
  /** Phone width views the Trail without authoring it (US 40, ADR-0008). */
  readOnly: boolean;
}

/** A Stop being named before it is created — extend, fork, or the first Stop. */
type Draft = { from: StopId | null; mode: "next" | "fork" | "start" };

export function TrailCanvas({
  trailId,
  trail,
  user,
  onTrailChanged,
  onRefresh,
  onOpenStop,
  readOnly,
}: TrailCanvasProps) {
  const { nodes, edges } = trail;
  const g = layout(nodes, edges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<StopId | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Pan the whole map (drag background) — a pure viewport offset, no stored state.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const panFrom = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  );
  // Per-Stop manual nudge for rearranging — VIEW-ONLY, never written to the model
  // (ADR-0010's "no stored layout" still holds; it resets on reload).
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>(
    {},
  );
  const dragNode = useRef<{
    id: string;
    sx: number;
    sy: number;
    odx: number;
    ody: number;
  } | null>(null);
  const moved = useRef(false);

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

  /** Create a Stop on this Trail, link it after `from` when there is one, then refresh. */
  async function createAndLink(name: string, from: StopId | null) {
    setBusy(true);
    setError(null);
    try {
      const stop = await createStop(user, trailId, { name });
      if (from) await connectStops(user, trailId, from, stop.id);
      setDraft(null);
      await onRefresh();
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  const link = (to: StopId) => {
    if (linkingFrom) void run(() => connectStops(user, trailId, linkingFrom, to));
  };
  const unlink = (from: StopId, to: StopId) =>
    void run(() => disconnectStops(user, trailId, from, to));

  // ---- geometry: derived positions, plus the view-only pan/offset overlay ----
  const wander = (p: Placed<TrailNode>) =>
    Math.sin(p.depth * 1.1 + p.lane * 2) * 14;
  const baseX = (p: Placed<TrailNode>) => PAD + p.depth * COL_W + R;
  const baseY = (p: Placed<TrailNode>) => PAD + p.lane * LANE_H + R + wander(p);
  const off = (id: string) => offsets[id] ?? { dx: 0, dy: 0 };
  const pos = new Map<string, { x: number; y: number }>(
    g.placed.map((p) => [
      p.node.id,
      { x: baseX(p) + off(p.node.id).dx, y: baseY(p) + off(p.node.id).dy },
    ]),
  );
  const width = PAD * 2 + g.depthCount * COL_W;
  const height = PAD * 2 + g.laneCount * LANE_H;

  const frontier = nodes.find((n) => {
    if (isDone(n)) return false;
    const preds = edges.filter((e) => e.toStopId === n.id).map((e) => e.fromStopId);
    return preds.every((p) => isDone(nodeById.get(p)!));
  });

  // ---- pointer handlers (desktop authoring; pan works read-only too) ----
  const onPanDown = (e: ReactPointerEvent) => {
    panFrom.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
    setGrabbing(true);
  };
  const startNodeDrag = (id: string, e: ReactPointerEvent) => {
    if (readOnly) return;
    const o = off(id);
    dragNode.current = {
      id,
      sx: e.clientX,
      sy: e.clientY,
      odx: o.dx,
      ody: o.dy,
    };
    moved.current = false;
    setGrabbing(true);
  };
  const onPanMove = (e: ReactPointerEvent) => {
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

  if (nodes.length === 0) {
    return (
      <div>
        {draft ? (
          <DraftForm
            busy={busy}
            placeholder="Name your first stop"
            onCancel={() => setDraft(null)}
            onSubmit={(name) => void createAndLink(name, null)}
          />
        ) : (
          !readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft({ from: null, mode: "start" })}
              style={startBtn}
            >
              ＋ Start your trail
            </button>
          )
        )}
        {readOnly && (
          <p style={{ opacity: 0.7 }}>
            No stops on your trail yet. Add some on a wider screen to arrange them.
          </p>
        )}
        {error && <ErrorLine error={error} />}
      </div>
    );
  }

  const rearranged = Object.keys(offsets).length > 0;

  return (
    <div>
      <style>{CANVAS_CSS}</style>
      <div
        onPointerDown={onPanDown}
        onPointerMove={onPanMove}
        onPointerUp={onPanUp}
        onPointerLeave={onPanUp}
        style={{
          position: "relative",
          height: Math.min(height, 560),
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
          {/* survey-chart texture: fine graticule + faint contour rings */}
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
          <svg
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden="true"
          >
            {[
              { cx: width * 0.83, cy: height * 0.22 },
              { cx: width * 0.16, cy: height * 0.8 },
            ].map((c, i) =>
              [0, 1, 2, 3, 4].map((k) => (
                <circle
                  key={`${i}-${k}`}
                  cx={c.cx}
                  cy={c.cy}
                  r={22 + k * 20}
                  fill="none"
                  stroke="rgba(120,100,60,0.07)"
                  strokeWidth={1}
                />
              )),
            )}
          </svg>
          <Compass x={PAD - 20} y={PAD - 36} />

          {/* the trail: dotted ahead beneath, solid walked ground on top */}
          <svg
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            aria-hidden="true"
          >
            {edges.map((e) => (
              <TrailSeg
                key={`u-${e.fromStopId}-${e.toStopId}`}
                pos={pos}
                from={e.fromStopId}
                to={e.toStopId}
                stroke={AHEAD}
                width={3.5}
                dotted
              />
            ))}
            {edges
              .filter((e) => isDone(nodeById.get(e.fromStopId)!))
              .map((e) => (
                <TrailSeg
                  key={`w-${e.fromStopId}-${e.toStopId}`}
                  pos={pos}
                  from={e.fromStopId}
                  to={e.toStopId}
                  stroke={WALKED}
                  width={5}
                />
              ))}
          </svg>

          {g.placed.map((p) => {
            const n = p.node;
            const here = pos.get(n.id)!;
            return (
              <Waypoint
                key={n.id}
                node={n}
                x={here.x}
                y={here.y}
                isFrontier={frontier?.id === n.id}
                readOnly={readOnly}
                busy={busy}
                isDrafting={draft?.from === n.id}
                isLinkSource={linkingFrom === n.id}
                isLinkTarget={
                  linkingFrom !== null &&
                  linkingFrom !== n.id &&
                  canConnect(edges, linkingFrom, n.id)
                }
                linking={linkingFrom !== null}
                onPointerDown={(e) => startNodeDrag(n.id, e)}
                onOpen={() => onOpenStop(n.id)}
                onNext={() => setDraft({ from: n.id, mode: "next" })}
                onFork={() => setDraft({ from: n.id, mode: "fork" })}
                onStartLink={() => setLinkingFrom(n.id)}
                onCancelLink={() => setLinkingFrom(null)}
                onLinkHere={() => link(n.id)}
                onDraftSubmit={(name) => void createAndLink(name, n.id)}
                onDraftCancel={() => setDraft(null)}
              />
            );
          })}

          {!readOnly &&
            edges.map((e) => {
              const a = pos.get(e.fromStopId);
              const b = pos.get(e.toStopId);
              if (!a || !b) return null;
              return (
                <button
                  key={`x-${e.fromStopId}-${e.toStopId}`}
                  type="button"
                  title="Remove this link"
                  aria-label="Remove this link"
                  disabled={busy}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => unlink(e.fromStopId, e.toStopId)}
                  style={{
                    position: "absolute",
                    left: (a.x + b.x) / 2 - 10,
                    top: (a.y + b.y) / 2 - 10,
                    width: 20,
                    height: 20,
                    lineHeight: "18px",
                    padding: 0,
                    borderRadius: "50%",
                    border: "1px solid #cabf9f",
                    background: "rgba(248,244,235,0.94)",
                    color: "#8a4b3f",
                    fontSize: "0.62rem",
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  ✕
                </button>
              );
            })}
        </div>

        {rearranged && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setOffsets({})}
            style={resetBtn}
          >
            ↺ reset layout
          </button>
        )}
      </div>

      <p style={{ fontSize: "0.8rem", color: "#7a6f52", marginTop: "0.6rem" }}>
        <strong style={{ color: PINE }}>Pine = completed</strong> (and ground
        you've covered); <strong style={{ color: OCHRE }}>ochre = where you are
        now</strong>.{" "}
        {readOnly
          ? "Drag the map to pan. Open on a wider screen to arrange it."
          : "Drag to pan; ＋ adds the next stop, ⑃ forks a branch, ⇢ links to another, ✕ removes a link."}
      </p>
      {error && <ErrorLine error={error} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface WaypointProps {
  node: TrailNode;
  x: number;
  y: number;
  isFrontier: boolean;
  readOnly: boolean;
  busy: boolean;
  isDrafting: boolean;
  isLinkSource: boolean;
  isLinkTarget: boolean;
  linking: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onOpen: () => void;
  onNext: () => void;
  onFork: () => void;
  onStartLink: () => void;
  onCancelLink: () => void;
  onLinkHere: () => void;
  onDraftSubmit: (name: string) => void;
  onDraftCancel: () => void;
}

/**
 * One Stop as a waypoint: its medallion (sealed pine when done, a filling ring
 * while underway, a hollow ring when not started), its name, and — on desktop —
 * the control that fits the moment: the ＋/⑃/⇢ authoring row when idle, a target
 * prompt while a link is being drawn, or the inline name field while a new Stop
 * is being added from here.
 */
function Waypoint({
  node,
  x,
  y,
  isFrontier,
  readOnly,
  busy,
  isDrafting,
  isLinkSource,
  isLinkTarget,
  linking,
  onPointerDown,
  onOpen,
  onNext,
  onFork,
  onStartLink,
  onCancelLink,
  onLinkHere,
  onDraftSubmit,
  onDraftCancel,
}: WaypointProps) {
  const done = isDone(node);
  const underway = isUnderway(node);
  return (
    <div
      role="group"
      aria-label={`${node.name}: ${node.done} of ${node.total} items done`}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e);
      }}
      style={{
        position: "absolute",
        left: x - 96,
        top: y - R - 16,
        width: 192,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: readOnly ? "grab" : "grab",
        touchAction: "none",
      }}
    >
      {isFrontier && (
        <div
          style={{
            fontSize: "0.55rem",
            fontWeight: 700,
            color: OCHRE,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          You are here
        </div>
      )}

      <div
        title={`${node.done} of ${node.total} items done`}
        style={{ borderRadius: "50%" }}
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
              progress={progressOf(node)}
              track={TRACK}
              fill={isFrontier || underway ? OCHRE : MUTE}
              center={
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    color: INK,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {`${node.done}/${node.total}`}
                </span>
              }
            />
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.03em",
          color: done ? PINE : INK,
          textAlign: "center",
          lineHeight: 1.2,
          overflowWrap: "anywhere",
        }}
      >
        <button
          type="button"
          className="trail-stop-link"
          aria-label={`Open ${node.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onOpen}
        >
          {node.name}
        </button>
      </div>

      {!readOnly && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          {isDrafting ? (
            <DraftForm
              busy={busy}
              placeholder="Name the new stop"
              onCancel={onDraftCancel}
              onSubmit={onDraftSubmit}
            />
          ) : isLinkSource ? (
            <RowButton label="Cancel" onClick={onCancelLink} busy={busy} />
          ) : isLinkTarget ? (
            <RowButton label="⇢ link here" onClick={onLinkHere} busy={busy} />
          ) : linking ? null : (
            <div style={{ display: "flex", gap: 5 }}>
              <Tip label="Add the next stop in sequence">
                <IconButton label="＋" onClick={onNext} busy={busy} />
              </Tip>
              <Tip label="Fork a parallel branch">
                <IconButton label="⑃" onClick={onFork} busy={busy} />
              </Tip>
              <Tip label="Link to an existing stop">
                <IconButton label="⇢" onClick={onStartLink} busy={busy} />
              </Tip>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** An inline name field for a Stop about to be created. Enter creates, Esc cancels. */
function DraftForm({
  busy,
  placeholder,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length > 0) onSubmit(trimmed);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "flex", gap: 4, alignItems: "center" }}
    >
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={name}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        style={{
          font: "inherit",
          fontSize: "0.72rem",
          padding: "0.3rem 0.4rem",
          width: "8.5rem",
          border: "1px solid #cabf9f",
          borderRadius: 5,
        }}
      />
      <button type="submit" disabled={busy} style={draftBtn} title="Create">
        ✓
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        style={draftBtn}
        title="Cancel"
      >
        ✕
      </button>
    </form>
  );
}

/**
 * A completed Stop: a matte pine disc with an engraved rim — a "sealed" milestone.
 * A solid disc against hollow rings is enough to read as done; no coin sheen, no
 * checkmark, keeping it considered rather than gamey.
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
      }}
    >
      <svg width={s} height={s} viewBox="0 0 100 100" style={{ display: "block" }}>
        <circle
          cx={50}
          cy={50}
          r={33}
          fill="none"
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1.5}
        />
        <circle
          cx={50}
          cy={50}
          r={27}
          fill="none"
          stroke="rgba(0,0,0,0.14)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

function TrailSeg({
  pos,
  from,
  to,
  stroke,
  width,
  dotted,
}: {
  pos: Map<string, { x: number; y: number }>;
  from: string;
  to: string;
  stroke: string;
  width: number;
  dotted?: boolean;
}) {
  const a = pos.get(from);
  const b = pos.get(to);
  if (!a || !b) return null;
  const mx = (a.x + b.x) / 2;
  return (
    <path
      d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dotted ? "1 12" : undefined}
    />
  );
}

/** Decorative compass rose — a small, muted survey-chart flourish. */
function Compass({ x, y }: { x: number; y: number }) {
  return (
    <svg
      width={50}
      height={50}
      viewBox="0 0 54 54"
      style={{ position: "absolute", left: x, top: y, opacity: 0.4, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <circle cx={27} cy={27} r={20} fill="none" stroke="#9a824e" strokeWidth={1} />
      <circle cx={27} cy={27} r={13} fill="none" stroke="#9a824e" strokeWidth={0.7} />
      <path d="M27 8 L30 27 L27 46 L24 27 Z" fill="#9a824e" opacity={0.8} />
      <path d="M8 27 L27 24 L46 27 L27 30 Z" fill="#9a824e" opacity={0.5} />
      <text x={27} y={6} textAnchor="middle" fontSize={7} fontWeight={700} fill="#8a6d3a">
        N
      </text>
    </svg>
  );
}

function IconButton({
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
        fontSize: "0.76rem",
        width: "1.7rem",
        height: "1.7rem",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid #d3c8a9",
        background: "rgba(250,247,240,0.9)",
        color: "#6b5f43",
        borderRadius: 6,
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function RowButton({
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
        padding: "0.25rem 0.55rem",
        border: "1px solid #cabf9f",
        background: "rgba(250,247,240,0.9)",
        color: "#6b5f43",
        borderRadius: 6,
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ErrorLine({ error }: { error: string }) {
  return (
    <div role="alert" style={{ color: "crimson", fontSize: "0.85rem" }}>
      Could not change the trail: {error}
    </div>
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

const startBtn: React.CSSProperties = {
  font: "inherit",
  fontSize: "0.9rem",
  padding: "0.6rem 1rem",
  minHeight: "44px",
  border: "1px solid #cabf9f",
  background: "rgba(250,247,240,0.9)",
  color: "#6b5f43",
  borderRadius: 8,
  cursor: "pointer",
};

const draftBtn: React.CSSProperties = {
  fontSize: "0.72rem",
  width: "1.6rem",
  height: "1.6rem",
  border: "1px solid #cabf9f",
  background: "rgba(250,247,240,0.9)",
  color: "#6b5f43",
  borderRadius: 5,
  cursor: "pointer",
};

const resetBtn: React.CSSProperties = {
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
};

const CANVAS_CSS = `
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
`;
