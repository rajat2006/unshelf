import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { StopId, TrailId, TrailNode, TrailView } from "@unshelf/shared";
import { connectStops, createStop, disconnectStops } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { canConnect, layout, type Placed } from "./geometry";
import { ProgressRing } from "./ProgressRing";

/**
 * The Trail canvas — ADR-0010's topology-as-journey, reskinned to Quiet Focus.
 * User's Stops are waypoints on a horizontal trodden trail; sequence runs
 * left→right, a fork is a Stop with several out-edges, a join several in-edges.
 * Every position is *derived* from the topology (`layout`), never stored, so the
 * same edge set renders here on the desktop and, read-only, on the phone (US 40).
 *
 * Progress reads as a journey: a completed Stop is a sealed green medallion, one
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
  const connectedStopIds = new Set(
    edges.flatMap((edge) => [edge.fromStopId, edge.toStopId]),
  );
  const looseNodes = nodes.filter((node) => !connectedStopIds.has(node.id));
  const sequencedNodes = nodes.filter((node) => connectedStopIds.has(node.id));
  const g = layout(sequencedNodes, edges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<StopId | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Pan the whole map (drag background) — a pure viewport offset, no stored state.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [grabbing, setGrabbing] = useState(false);
  const panFrom = useRef<{
    sx: number;
    sy: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  // Per-Stop manual nudge for rearranging — VIEW-ONLY, never written to the model
  // (ADR-0010's "no stored layout" still holds; it resets on reload).
  const [offsets, setOffsets] = useState<
    Record<string, { dx: number; dy: number }>
  >({});
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

  /** Create and link a Stop, refresh the Trail, then open its durable detail. */
  async function createAndLink(name: string, from: StopId | null) {
    setBusy(true);
    setError(null);
    try {
      const stop = await createStop(user, trailId, { name });
      if (from) await connectStops(user, trailId, from, stop.id);
      setDraft(null);
      await onRefresh();
      onOpenStop(stop.id);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  const link = (to: StopId) => {
    if (linkingFrom)
      void run(() => connectStops(user, trailId, linkingFrom, to));
  };
  const unlink = (from: StopId, to: StopId) =>
    void run(() => disconnectStops(user, trailId, from, to));
  const sequence = ({ stopId, predecessorId }: SequenceStopInput) =>
    void run(() => connectStops(user, trailId, predecessorId, stopId));

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

  const frontier = sequencedNodes.find((n) => {
    if (isDone(n)) return false;
    const preds = edges
      .filter((e) => e.toStopId === n.id)
      .map((e) => e.fromStopId);
    return preds.every((p) => isDone(nodeById.get(p)!));
  });

  // ---- pointer handlers (desktop authoring; pan works read-only too) ----
  const onPanDown = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    panFrom.current = {
      sx: e.clientX,
      sy: e.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
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
      setOffsets((prev) => ({
        ...prev,
        [d.id]: { dx: d.odx + ddx, dy: d.ody + ddy },
      }));
      return;
    }
    const f = panFrom.current;
    const canvas = canvasRef.current;
    if (!f || !canvas) return;
    canvas.scrollLeft = f.scrollLeft - (e.clientX - f.sx);
    canvas.scrollTop = f.scrollTop - (e.clientY - f.sy);
  };
  const onPanUp = () => {
    panFrom.current = null;
    dragNode.current = null;
    setGrabbing(false);
  };

  if (nodes.length === 0) {
    return (
      <div className="trail-empty">
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
              className="quiet-button quiet-button--primary"
            >
              ＋ Start your trail
            </button>
          )
        )}
        {readOnly && (
          <p className="quiet-copy">
            No stops on your trail yet. Add some on a wider screen to arrange
            them.
          </p>
        )}
        {error && <ErrorLine error={error} />}
      </div>
    );
  }

  const rearranged = Object.keys(offsets).length > 0;

  return (
    <section aria-label="Trail journey">
      <div className="trail-workbench">
        <LooseStopRail
          nodes={looseNodes}
          allNodes={nodes}
          busy={busy}
          readOnly={readOnly}
          onOpen={onOpenStop}
          onSequence={sequence}
        />
        <div
          ref={canvasRef}
          role="region"
          aria-label="Trail canvas"
          tabIndex={0}
          className={`trail-canvas${grabbing ? " is-grabbing" : ""}`}
          onPointerDown={onPanDown}
          onPointerMove={onPanMove}
          onPointerUp={onPanUp}
          onPointerLeave={onPanUp}
          style={
            {
              "--trail-height": `${Math.min(height, 560)}px`,
            } as CSSProperties
          }
        >
          <div
            className="trail-canvas__ground"
            style={
              {
                "--trail-width": `${width}px`,
                "--trail-content-height": `${height}px`,
              } as CSSProperties
            }
          >
            {/* the trail: dotted ahead beneath, solid walked ground on top */}
            <svg
              width={width}
              height={height}
              className="trail-canvas__edges"
              aria-hidden="true"
            >
              {edges.map((e) => (
                <TrailSeg
                  key={`u-${e.fromStopId}-${e.toStopId}`}
                  pos={pos}
                  from={e.fromStopId}
                  to={e.toStopId}
                  stroke="var(--line)"
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
                    stroke="var(--done)"
                    width={5}
                  />
                ))}
            </svg>

            {sequencedNodes.length === 0 && (
              <div
                className="trail-canvas__empty"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p>Sequence a Stop to place it on the canvas.</p>
                {!readOnly &&
                  (draft?.from === null ? (
                    <DraftForm
                      busy={busy}
                      placeholder="Name another stop"
                      onCancel={() => setDraft(null)}
                      onSubmit={(name) => void createAndLink(name, null)}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className="quiet-button"
                      onClick={() => setDraft({ from: null, mode: "start" })}
                    >
                      ＋ Add another Stop
                    </button>
                  ))}
              </div>
            )}

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
                    className="trail-edge-remove"
                    style={
                      {
                        "--trail-x": `${(a.x + b.x) / 2 - 22}px`,
                        "--trail-y": `${(a.y + b.y) / 2 - 22}px`,
                      } as CSSProperties
                    }
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
              className="trail-reset quiet-button"
            >
              ↺ reset layout
            </button>
          )}
        </div>
      </div>

      <p className="trail-legend">
        <strong>
          <span aria-hidden="true">✓</span> Completed stop
        </strong>
        <span>Solid path: walked</span>
        <span>Dotted path: ahead</span>
        <span>Ring + “You are here”: current frontier</span>.{" "}
        {readOnly
          ? "Drag the map to pan. Open on a wider screen to arrange it."
          : "Drag to pan; ＋ adds the next stop, ⑃ forks a branch, ⇢ links to another, ✕ removes a link."}
      </p>
      {error && <ErrorLine error={error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

interface SequenceStopInput {
  stopId: StopId;
  predecessorId: StopId;
}

function LooseStopRail({
  nodes,
  allNodes,
  busy,
  readOnly,
  onOpen,
  onSequence,
}: {
  nodes: TrailNode[];
  allNodes: TrailNode[];
  busy: boolean;
  readOnly: boolean;
  onOpen: (stopId: StopId) => void;
  onSequence: (input: SequenceStopInput) => void;
}) {
  const [draft, setDraft] = useState<{
    stopId: StopId;
    predecessorId: StopId | "";
  } | null>(null);

  return (
    <aside className="unsequenced-rail" aria-labelledby="unsequenced-title">
      <h2 id="unsequenced-title">
        Unsequenced <span>{nodes.length}</span>
      </h2>
      {nodes.length === 0 ? (
        <p>Loose Stops will wait here.</p>
      ) : (
        <ul>
          {nodes.map((node) => {
            const candidates = allNodes.filter(
              (candidate) => candidate.id !== node.id,
            );
            return (
              <li key={node.id}>
                <button
                  type="button"
                  className="unsequenced-rail__stop"
                  onClick={() => onOpen(node.id)}
                >
                  {node.name}
                </button>
                {!readOnly && draft?.stopId === node.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (draft.predecessorId) {
                        onSequence({
                          stopId: node.id,
                          predecessorId: draft.predecessorId,
                        });
                        setDraft(null);
                      }
                    }}
                  >
                    <label>
                      Follows
                      <select
                        value={draft.predecessorId}
                        disabled={busy || candidates.length === 0}
                        onChange={(event) =>
                          setDraft({
                            stopId: node.id,
                            predecessorId: event.target.value as StopId,
                          })
                        }
                      >
                        <option value="" disabled>
                          Choose a Stop…
                        </option>
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {candidates.length === 0 && (
                      <p>Add another Stop before sequencing this one.</p>
                    )}
                    <span>
                      <button
                        type="submit"
                        disabled={busy || !draft.predecessorId}
                      >
                        Sequence
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDraft(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  </form>
                ) : !readOnly ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setDraft({ stopId: node.id, predecessorId: "" })
                    }
                  >
                    Sequence this Stop
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

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
 * One Stop as a waypoint: its medallion (sealed green when done, a filling ring
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
      className="trail-waypoint"
      style={
        {
          "--trail-x": `${x - 96}px`,
          "--trail-y": `${y - R - 16}px`,
        } as CSSProperties
      }
    >
      {isFrontier && (
        <div className="trail-waypoint__frontier">You are here</div>
      )}

      <button
        type="button"
        className="trail-stop-link"
        aria-label={`Open ${node.name}`}
        title={`${node.done} of ${node.total} items done`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpen}
      >
        <span className="trail-medallion">
          {done ? (
            <Seal />
          ) : (
            <span
              className={`trail-medallion__ring${isFrontier ? " is-frontier" : ""}`}
            >
              <ProgressRing
                size={R * 2 - 8}
                stroke={5}
                progress={progressOf(node)}
                track="var(--field-line)"
                fill={isFrontier || underway ? "var(--accent)" : "var(--muted)"}
                center={
                  <span className="trail-progress-label">
                    {node.total === 0 ? "＋" : `${node.done}/${node.total}`}
                  </span>
                }
              />
            </span>
          )}
        </span>
        <span className={`trail-waypoint__name${done ? " is-done" : ""}`}>
          {node.name}
        </span>
      </button>

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
            <div className="trail-authoring-row">
              <Tip label="Add the next stop in sequence">
                <IconButton
                  label="＋"
                  accessibleLabel="Add next Stop"
                  onClick={onNext}
                  busy={busy}
                />
              </Tip>
              <Tip label="Fork a parallel branch">
                <IconButton
                  label="⑃"
                  accessibleLabel="Fork a parallel branch"
                  onClick={onFork}
                  busy={busy}
                />
              </Tip>
              <Tip label="Link to an existing stop">
                <IconButton
                  label="⇢"
                  accessibleLabel="Link to an existing Stop"
                  onClick={onStartLink}
                  busy={busy}
                />
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
      className="trail-draft"
    >
      <input
        autoFocus
        value={name}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="trail-draft__input"
      />
      <button
        type="submit"
        disabled={busy}
        className="trail-draft__button"
        aria-label="Create Stop"
      >
        ✓
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="trail-draft__button"
        aria-label="Cancel new Stop"
      >
        ✕
      </button>
    </form>
  );
}

/**
 * A completed Stop: a sealed green medallion with a check, so completion remains
 * legible without its colour.
 */
function Seal() {
  return (
    <div className="trail-seal">
      <span aria-hidden="true">✓</span>
      <span className="visually-hidden">Completed stop</span>
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

function IconButton({
  label,
  accessibleLabel,
  onClick,
  busy,
}: {
  label: string;
  accessibleLabel: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="trail-icon-button"
      aria-label={accessibleLabel}
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
      className="trail-row-button"
    >
      {label}
    </button>
  );
}

function ErrorLine({ error }: { error: string }) {
  return (
    <div role="alert" className="surface-error">
      Could not change the trail: {error}
    </div>
  );
}

function Tip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="tw-tip">
      {children}
      <span className="tw-tip-label">{label}</span>
    </span>
  );
}
