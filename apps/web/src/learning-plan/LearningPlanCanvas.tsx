import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  StageId,
  LearningPlanId,
  LearningPlanNode,
  LearningPlanView,
} from "@unshelf/shared";
import {
  connectLearningPlanNodes,
  createStage,
  disconnectLearningPlanNodes,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import {
  canConnect,
  deriveTopologyLayout,
  type TopologyPlacement,
} from "../topology";
import { ProgressRing } from "./ProgressRing";

/**
 * The Learning Plan canvas — ADR-0010's topology-as-journey, reskinned to Quiet Focus.
 * User's Stages are waypoints on a horizontal trodden learningPlan; sequence runs
 * left→right, a fork is a Stage with several out-edges, a join several in-edges.
 * Every position is *derived* from the topology (`layout`), never stored, so the
 * same edge set renders here on the desktop and, read-only, on the phone (US 40).
 *
 * Progress reads as a journey: a completed Stage is a sealed green medallion, one
 * underway shows its ring filling, and the ground *behind* a completed Stage is
 * drawn as learningPlan already walked — all derived from Item Statuses, nothing stored
 * on the LearningPlan. On desktop it is authored by arranging, not data entry (US 39):
 * ＋ extends a Stage into the next, ⑃ forks a parallel branch — each creating a
 * Stage and linking it in one gesture — ⇢ links to an existing Stage (a join), and
 * ✕ on a segment rewires (US 37). A link that would close a cycle is never
 * offered (`canConnect`) and refused at the api besides.
 */

const COL_W = 240;
const LANE_H = 150;
const PAD = 76;
const R = 29;

const isDone = (n: LearningPlanNode) => n.total > 0 && n.done >= n.total;
const isUnderway = (n: LearningPlanNode) => n.done > 0 && n.done < n.total;
const progressOf = (n: LearningPlanNode) =>
  n.total > 0 ? n.done / n.total : 0;

interface LearningPlanCanvasProps {
  /** The LearningPlan being authored — every Stage and edge is scoped to it (#94). */
  learningPlanId: LearningPlanId;
  learningPlan: LearningPlanView;
  user: CurrentUser;
  onLearningPlanChanged: (learningPlan: LearningPlanView) => void;
  onRefresh: () => Promise<void>;
  /** Open this LearningPlan's Stage at its URL-owned detail route (#95). */
  onOpenStage: (stageId: StageId) => void;
  /** Phone width views the LearningPlan without authoring it (US 40, ADR-0008). */
  readOnly: boolean;
}

/** A Stage being named before it is created — extend, fork, or the first Stage. */
type Draft = { from: StageId | null; mode: "next" | "fork" | "start" };

export function LearningPlanCanvas({
  learningPlanId,
  learningPlan,
  user,
  onLearningPlanChanged,
  onRefresh,
  onOpenStage,
  readOnly,
}: LearningPlanCanvasProps) {
  const { nodes, edges } = learningPlan;
  const connectedStageIds = new Set(
    edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
  );
  const looseNodes = nodes.filter((node) => !connectedStageIds.has(node.id));
  const sequencedNodes = nodes.filter((node) => connectedStageIds.has(node.id));
  const topologyEdges = edges.map((edge) => ({
    from: edge.fromNodeId,
    to: edge.toNodeId,
  }));
  const topologyLayout = deriveTopologyLayout({
    nodeIds: sequencedNodes.map((node) => node.id),
    edges: topologyEdges,
  });
  const placedNodes = sequencedNodes.map((node) => ({
    node,
    ...topologyLayout.byId.get(node.id)!,
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<StageId | null>(null);
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
  // Per-Stage manual nudge for rearranging — VIEW-ONLY, never written to the model
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

  async function run(change: () => Promise<LearningPlanView>) {
    setBusy(true);
    setError(null);
    try {
      onLearningPlanChanged(await change());
      setLinkingFrom(null);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  /** Create and link a Stage, refresh the LearningPlan, then open its durable detail. */
  async function createAndLink(name: string, from: StageId | null) {
    setBusy(true);
    setError(null);
    try {
      const stage = await createStage(user, learningPlanId, { name });
      if (from)
        await connectLearningPlanNodes(user, learningPlanId, from, stage.id);
      setDraft(null);
      await onRefresh();
      onOpenStage(stage.id);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  const link = (to: StageId) => {
    if (linkingFrom)
      void run(() =>
        connectLearningPlanNodes(user, learningPlanId, linkingFrom, to),
      );
  };
  const unlink = (from: StageId, to: StageId) =>
    void run(() => disconnectLearningPlanNodes(user, learningPlanId, from, to));
  const sequence = ({ stageId, predecessorId }: SequenceStageInput) =>
    void run(() =>
      connectLearningPlanNodes(user, learningPlanId, predecessorId, stageId),
    );

  // ---- geometry: derived positions, plus the view-only pan/offset overlay ----
  const wander = (p: TopologyPlacement) =>
    Math.sin(p.depth * 1.1 + p.lane * 2) * 14;
  const baseX = (p: TopologyPlacement) => PAD + p.depth * COL_W + R;
  const baseY = (p: TopologyPlacement) => PAD + p.lane * LANE_H + R + wander(p);
  const off = (id: string) => offsets[id] ?? { dx: 0, dy: 0 };
  const pos = new Map<string, { x: number; y: number }>(
    placedNodes.map((p) => [
      p.node.id,
      { x: baseX(p) + off(p.node.id).dx, y: baseY(p) + off(p.node.id).dy },
    ]),
  );
  const width = PAD * 2 + topologyLayout.depthCount * COL_W;
  const height = PAD * 2 + topologyLayout.laneCount * LANE_H;

  const frontier = sequencedNodes.find((n) => {
    if (isDone(n)) return false;
    const preds = edges
      .filter((e) => e.toNodeId === n.id)
      .map((e) => e.fromNodeId);
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
      <div className="learning-plan-empty">
        {draft ? (
          <DraftForm
            busy={busy}
            placeholder="Name your first stage"
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
              ＋ Start your Learning Plan
            </button>
          )
        )}
        {readOnly && (
          <p className="quiet-copy">
            No Stages on your Learning Plan yet. Add some on a wider screen to
            arrange them.
          </p>
        )}
        {error && <ErrorLine error={error} />}
      </div>
    );
  }

  const rearranged = Object.keys(offsets).length > 0;

  return (
    <section aria-label="Learning Plan journey">
      <div className="learning-plan-workbench">
        <LooseStageRail
          nodes={looseNodes}
          allNodes={nodes}
          busy={busy}
          readOnly={readOnly}
          onOpen={onOpenStage}
          onSequence={sequence}
        />
        <div
          ref={canvasRef}
          role="region"
          aria-label="Learning Plan canvas"
          tabIndex={0}
          className={`learning-plan-canvas${grabbing ? " is-grabbing" : ""}`}
          onPointerDown={onPanDown}
          onPointerMove={onPanMove}
          onPointerUp={onPanUp}
          onPointerLeave={onPanUp}
          style={
            {
              "--learning-plan-height": `${Math.min(height, 560)}px`,
            } as CSSProperties
          }
        >
          <div
            className="learning-plan-canvas__ground"
            style={
              {
                "--learning-plan-width": `${width}px`,
                "--learning-plan-content-height": `${height}px`,
              } as CSSProperties
            }
          >
            {/* the learningPlan: dotted ahead beneath, solid walked ground on top */}
            <svg
              width={width}
              height={height}
              className="learning-plan-canvas__edges"
              aria-hidden="true"
            >
              {edges.map((e) => (
                <LearningPlanSeg
                  key={`u-${e.fromNodeId}-${e.toNodeId}`}
                  pos={pos}
                  from={e.fromNodeId}
                  to={e.toNodeId}
                  stroke="var(--line)"
                  width={3.5}
                  dotted
                />
              ))}
              {edges
                .filter((e) => isDone(nodeById.get(e.fromNodeId)!))
                .map((e) => (
                  <LearningPlanSeg
                    key={`w-${e.fromNodeId}-${e.toNodeId}`}
                    pos={pos}
                    from={e.fromNodeId}
                    to={e.toNodeId}
                    stroke="var(--done)"
                    width={5}
                  />
                ))}
            </svg>

            {sequencedNodes.length === 0 && (
              <div
                className="learning-plan-canvas__empty"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p>Sequence a Stage to place it on the canvas.</p>
                {!readOnly &&
                  (draft?.from === null ? (
                    <DraftForm
                      busy={busy}
                      placeholder="Name another stage"
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
                      ＋ Add another Stage
                    </button>
                  ))}
              </div>
            )}

            {placedNodes.map((p) => {
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
                    canConnect({
                      edges: topologyEdges,
                      from: linkingFrom,
                      to: n.id,
                    })
                  }
                  linking={linkingFrom !== null}
                  onPointerDown={(e) => startNodeDrag(n.id, e)}
                  onOpen={() => onOpenStage(n.id)}
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
                const a = pos.get(e.fromNodeId);
                const b = pos.get(e.toNodeId);
                if (!a || !b) return null;
                return (
                  <button
                    key={`x-${e.fromNodeId}-${e.toNodeId}`}
                    type="button"
                    title="Remove this link"
                    aria-label="Remove this link"
                    disabled={busy}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={() => unlink(e.fromNodeId, e.toNodeId)}
                    className="learning-plan-edge-remove"
                    style={
                      {
                        "--learning-plan-x": `${(a.x + b.x) / 2 - 22}px`,
                        "--learning-plan-y": `${(a.y + b.y) / 2 - 22}px`,
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
              className="learning-plan-reset quiet-button"
            >
              ↺ reset layout
            </button>
          )}
        </div>
      </div>

      <p className="learning-plan-legend">
        <strong>
          <span aria-hidden="true">✓</span> Completed stage
        </strong>
        <span>Solid path: walked</span>
        <span>Dotted path: ahead</span>
        <span>Ring + “You are here”: current frontier</span>.{" "}
        {readOnly
          ? "Drag the map to pan. Open on a wider screen to arrange it."
          : "Drag to pan; ＋ adds the next stage, ⑃ forks a branch, ⇢ links to another, ✕ removes a link."}
      </p>
      {error && <ErrorLine error={error} />}
    </section>
  );
}

// ---------------------------------------------------------------------------

interface SequenceStageInput {
  stageId: StageId;
  predecessorId: StageId;
}

function LooseStageRail({
  nodes,
  allNodes,
  busy,
  readOnly,
  onOpen,
  onSequence,
}: {
  nodes: LearningPlanNode[];
  allNodes: LearningPlanNode[];
  busy: boolean;
  readOnly: boolean;
  onOpen: (stageId: StageId) => void;
  onSequence: (input: SequenceStageInput) => void;
}) {
  const [draft, setDraft] = useState<{
    stageId: StageId;
    predecessorId: StageId | "";
  } | null>(null);

  return (
    <aside className="unsequenced-rail" aria-labelledby="unsequenced-title">
      <h2 id="unsequenced-title">
        Unsequenced <span>{nodes.length}</span>
      </h2>
      {nodes.length === 0 ? (
        <p>Loose Stages will wait here.</p>
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
                  className="unsequenced-rail__stage"
                  onClick={() => onOpen(node.id)}
                >
                  {node.name}
                </button>
                {!readOnly && draft?.stageId === node.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (draft.predecessorId) {
                        onSequence({
                          stageId: node.id,
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
                            stageId: node.id,
                            predecessorId: event.target.value as StageId,
                          })
                        }
                      >
                        <option value="" disabled>
                          Choose a Stage…
                        </option>
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {candidates.length === 0 && (
                      <p>Add another Stage before sequencing this one.</p>
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
                      setDraft({ stageId: node.id, predecessorId: "" })
                    }
                  >
                    Sequence this Stage
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
  node: LearningPlanNode;
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
 * One Stage as a waypoint: its medallion (sealed green when done, a filling ring
 * while underway, a hollow ring when not started), its name, and — on desktop —
 * the control that fits the moment: the ＋/⑃/⇢ authoring row when idle, a target
 * prompt while a link is being drawn, or the inline name field while a new Stage
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
      className="learning-plan-waypoint"
      style={
        {
          "--learning-plan-x": `${x - 96}px`,
          "--learning-plan-y": `${y - R - 16}px`,
        } as CSSProperties
      }
    >
      {isFrontier && (
        <div className="learning-plan-waypoint__frontier">You are here</div>
      )}

      <button
        type="button"
        className="learning-plan-stage-link"
        aria-label={`Open ${node.name}`}
        title={`${node.done} of ${node.total} items done`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpen}
      >
        <span className="learning-plan-medallion">
          {done ? (
            <Seal />
          ) : (
            <span
              className={`learning-plan-medallion__ring${isFrontier ? " is-frontier" : ""}`}
            >
              <ProgressRing
                size={R * 2 - 8}
                stroke={5}
                progress={progressOf(node)}
                track="var(--field-line)"
                fill={isFrontier || underway ? "var(--accent)" : "var(--muted)"}
                center={
                  <span className="learning-plan-progress-label">
                    {node.total === 0 ? "＋" : `${node.done}/${node.total}`}
                  </span>
                }
              />
            </span>
          )}
        </span>
        <span
          className={`learning-plan-waypoint__name${done ? " is-done" : ""}`}
        >
          {node.name}
        </span>
      </button>

      {!readOnly && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          {isDrafting ? (
            <DraftForm
              busy={busy}
              placeholder="Name the new stage"
              onCancel={onDraftCancel}
              onSubmit={onDraftSubmit}
            />
          ) : isLinkSource ? (
            <RowButton label="Cancel" onClick={onCancelLink} busy={busy} />
          ) : isLinkTarget ? (
            <RowButton label="⇢ link here" onClick={onLinkHere} busy={busy} />
          ) : linking ? null : (
            <div className="learning-plan-authoring-row">
              <Tip label="Add the next stage in sequence">
                <IconButton
                  label="＋"
                  accessibleLabel="Add next Stage"
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
              <Tip label="Link to an existing stage">
                <IconButton
                  label="⇢"
                  accessibleLabel="Link to an existing Stage"
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

/** An inline name field for a Stage about to be created. Enter creates, Esc cancels. */
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
      className="learning-plan-draft"
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
        className="learning-plan-draft__input"
      />
      <button
        type="submit"
        disabled={busy}
        className="learning-plan-draft__button"
        aria-label="Create Stage"
      >
        ✓
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="learning-plan-draft__button"
        aria-label="Cancel new Stage"
      >
        ✕
      </button>
    </form>
  );
}

/**
 * A completed Stage: a sealed green medallion with a check, so completion remains
 * legible without its colour.
 */
function Seal() {
  return (
    <div className="learning-plan-seal">
      <span aria-hidden="true">✓</span>
      <span className="visually-hidden">Completed stage</span>
    </div>
  );
}

function LearningPlanSeg({
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
      className="learning-plan-icon-button"
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
      className="learning-plan-row-button"
    >
      {label}
    </button>
  );
}

function ErrorLine({ error }: { error: string }) {
  return (
    <div role="alert" className="surface-error">
      Could not change the Learning Plan: {error}
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
