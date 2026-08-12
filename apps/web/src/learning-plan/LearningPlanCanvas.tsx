import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router";
import { PlanNodeKind, Status } from "@unshelf/shared";
import type {
  PlanNodeId,
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
import {
  itemDetailRouteState,
  planItemBackgroundLocation,
} from "../items/item-route-state";
import { STATUS_LABELS, TYPE_LABELS } from "../items/presentation";

/**
 * The Learning Plan canvas — ADR-0010's topology-as-journey on the warm
 * editorial token layer.
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

const isDone = (node: LearningPlanNode) =>
  node.kind === PlanNodeKind.Item
    ? node.item.status === Status.Done
    : node.total > 0 && node.done >= node.total;
const isUnderway = (node: LearningPlanNode) =>
  node.kind === PlanNodeKind.Item
    ? node.item.status === Status.InProgress
    : node.done > 0 && node.done < node.total;
const progressOf = (n: LearningPlanNode) =>
  n.kind === PlanNodeKind.Item
    ? n.item.status === Status.Done
      ? 1
      : n.item.status === Status.InProgress
        ? 0.5
        : 0
    : n.total > 0
      ? n.done / n.total
      : 0;
const nodeName = (node: LearningPlanNode) =>
  node.kind === PlanNodeKind.Item ? node.item.title : node.name;

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

/** A Stage being named before it is created — extend, fork, or the first node. */
type Draft = { from: PlanNodeId | null; mode: "next" | "fork" | "start" };

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
  const connectedNodeIds = new Set(
    edges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
  );
  const looseNodes = nodes.filter((node) => !connectedNodeIds.has(node.id));
  const sequencedNodes = nodes.filter((node) => connectedNodeIds.has(node.id));
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
  const orderedSequencedNodes = [...placedNodes]
    .sort((left, right) => left.depth - right.depth || left.lane - right.lane)
    .map(({ node }) => node);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [linkingFrom, setLinkingFrom] = useState<PlanNodeId | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Pan the whole map (drag background) — a pure viewport offset, no stored state.
  const canvasRef = useRef<HTMLDivElement>(null);
  const [grabbing, setGrabbing] = useState(false);
  const panStart = useRef<{
    pointerX: number;
    pointerY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  // Per-Stage manual nudge for rearranging — VIEW-ONLY, never written to the model
  // (ADR-0010's "no stored layout" still holds; it resets on reload).
  const [offsets, setOffsets] = useState<
    Record<string, { dx: number; dy: number }>
  >({});
  const draggedNode = useRef<{
    id: string;
    pointerX: number;
    pointerY: number;
    initialOffsetX: number;
    initialOffsetY: number;
  } | null>(null);
  const moved = useRef(false);

  async function applyTopologyChange({
    change,
    successMessage,
  }: {
    change: () => Promise<LearningPlanView>;
    successMessage: string;
  }) {
    setBusy(true);
    setError(null);
    setAnnouncement("");
    try {
      onLearningPlanChanged(await change());
      setLinkingFrom(null);
      setAnnouncement(successMessage);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  /** Create and link a Stage, refresh the LearningPlan, then open its durable detail. */
  async function createAndLink(name: string, from: PlanNodeId | null) {
    setBusy(true);
    setError(null);
    try {
      const stage = await createStage(user, learningPlanId, { name });
      if (from)
        await connectLearningPlanNodes(user, learningPlanId, {
          fromNodeId: from,
          toNodeId: stage.id,
        });
      setDraft(null);
      await onRefresh();
      onOpenStage(stage.id);
    } catch (caught: unknown) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function retryAfterError() {
    setBusy(true);
    setError(null);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error ? (
    <ErrorLine
      error={error}
      busy={busy}
      onRetry={() => void retryAfterError()}
    />
  ) : null;

  const link = (to: PlanNodeId) => {
    if (linkingFrom) {
      const fromName = nodeName(nodeById.get(linkingFrom)!);
      const toName = nodeName(nodeById.get(to)!);
      void applyTopologyChange({
        change: () =>
          connectLearningPlanNodes(user, learningPlanId, {
            fromNodeId: linkingFrom,
            toNodeId: to,
          }),
        successMessage: `Linked ${fromName} to ${toName}`,
      });
    }
  };
  const unlink = ({ from, to }: { from: PlanNodeId; to: PlanNodeId }) =>
    void applyTopologyChange({
      change: () =>
        disconnectLearningPlanNodes(user, learningPlanId, {
          fromNodeId: from,
          toNodeId: to,
        }),
      successMessage: `Disconnected ${nodeName(nodeById.get(from)!)} from ${nodeName(nodeById.get(to)!)}`,
    });
  const sequence = ({ nodeId, predecessorId }: SequenceNodeInput) =>
    void applyTopologyChange({
      change: () =>
        connectLearningPlanNodes(user, learningPlanId, {
          fromNodeId: predecessorId,
          toNodeId: nodeId,
        }),
      successMessage: `Sequenced ${nodeName(nodeById.get(nodeId)!)} after ${nodeName(nodeById.get(predecessorId)!)}`,
    });
  const sequenceBefore = ({ nodeId, successorId }: SequenceBeforeInput) =>
    void applyTopologyChange({
      change: () =>
        connectLearningPlanNodes(user, learningPlanId, {
          fromNodeId: nodeId,
          toNodeId: successorId,
        }),
      successMessage: `Linked ${nodeName(nodeById.get(nodeId)!)} to ${nodeName(nodeById.get(successorId)!)}`,
    });

  // ---- geometry: derived positions, plus the view-only pan/offset overlay ----
  const laneWander = (placement: TopologyPlacement) =>
    Math.sin(placement.depth * 1.1 + placement.lane * 2) * 14;
  const baseX = (placement: TopologyPlacement) =>
    PAD + placement.depth * COL_W + R;
  const baseY = (placement: TopologyPlacement) =>
    PAD + placement.lane * LANE_H + R + laneWander(placement);
  const offsetFor = (id: string) => offsets[id] ?? { dx: 0, dy: 0 };
  const positions = new Map<string, { x: number; y: number }>(
    placedNodes.map((placement) => [
      placement.node.id,
      {
        x: baseX(placement) + offsetFor(placement.node.id).dx,
        y: baseY(placement) + offsetFor(placement.node.id).dy,
      },
    ]),
  );
  const width = PAD * 2 + topologyLayout.depthCount * COL_W;
  const height = PAD * 2 + topologyLayout.laneCount * LANE_H;

  const frontier = sequencedNodes.find((node) => {
    if (isDone(node)) return false;
    const predecessorIds = edges
      .filter((edge) => edge.toNodeId === node.id)
      .map((edge) => edge.fromNodeId);
    return predecessorIds.every((predecessorId) =>
      isDone(nodeById.get(predecessorId)!),
    );
  });

  // ---- pointer handlers (desktop authoring; pan works read-only too) ----
  const onPanDown = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    panStart.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setGrabbing(true);
  };
  const startNodeDrag = (id: string, e: ReactPointerEvent) => {
    if (readOnly) return;
    const initialOffset = offsetFor(id);
    draggedNode.current = {
      id,
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialOffsetX: initialOffset.dx,
      initialOffsetY: initialOffset.dy,
    };
    moved.current = false;
    setGrabbing(true);
  };
  const onPanMove = (e: ReactPointerEvent) => {
    const dragState = draggedNode.current;
    if (dragState) {
      const deltaX = e.clientX - dragState.pointerX;
      const deltaY = e.clientY - dragState.pointerY;
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) moved.current = true;
      setOffsets((prev) => ({
        ...prev,
        [dragState.id]: {
          dx: dragState.initialOffsetX + deltaX,
          dy: dragState.initialOffsetY + deltaY,
        },
      }));
      return;
    }
    const panState = panStart.current;
    const canvas = canvasRef.current;
    if (!panState || !canvas) return;
    canvas.scrollLeft = panState.scrollLeft - (e.clientX - panState.pointerX);
    canvas.scrollTop = panState.scrollTop - (e.clientY - panState.pointerY);
  };
  const onPanUp = () => {
    panStart.current = null;
    draggedNode.current = null;
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
        {errorLine}
      </div>
    );
  }

  const rearranged = Object.keys(offsets).length > 0;

  return (
    <section
      aria-label="Learning Plan journey"
      className="learning-plan-journey"
    >
      <div className="learning-plan-workbench">
        <LooseNodeRail
          learningPlanId={learningPlanId}
          nodes={looseNodes}
          allNodes={nodes}
          busy={busy}
          readOnly={readOnly}
          onOpen={onOpenStage}
          onSequence={sequence}
          onSequenceBefore={sequenceBefore}
        />
        {orderedSequencedNodes.length > 0 && (
          <PlanStructurePath
            learningPlanId={learningPlanId}
            nodes={orderedSequencedNodes}
            frontierId={frontier?.id}
            onOpenStage={onOpenStage}
          />
        )}
        {orderedSequencedNodes.length > 0 && !readOnly && (
          <details className="learning-plan-topology-toggle">
            <summary>Edit connections</summary>
          </details>
        )}
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
                  positions={positions}
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
                    positions={positions}
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

            {placedNodes.map((placement) => {
              const node = placement.node;
              const position = positions.get(node.id)!;
              return (
                <Waypoint
                  key={node.id}
                  node={node}
                  learningPlanId={learningPlanId}
                  x={position.x}
                  y={position.y}
                  isFrontier={frontier?.id === node.id}
                  readOnly={readOnly}
                  busy={busy}
                  isDrafting={draft?.from === node.id}
                  isLinkSource={linkingFrom === node.id}
                  isLinkTarget={
                    linkingFrom !== null &&
                    linkingFrom !== node.id &&
                    canConnect({
                      edges: topologyEdges,
                      from: linkingFrom,
                      to: node.id,
                    })
                  }
                  linking={linkingFrom !== null}
                  linkingSourceName={
                    linkingFrom
                      ? nodeName(nodeById.get(linkingFrom)!)
                      : undefined
                  }
                  onPointerDown={(event) => startNodeDrag(node.id, event)}
                  controls={{
                    onOpen:
                      node.kind === PlanNodeKind.Stage
                        ? () => onOpenStage(node.id)
                        : undefined,
                    onNext: () => setDraft({ from: node.id, mode: "next" }),
                    onFork: () => setDraft({ from: node.id, mode: "fork" }),
                    onStartLink: () => setLinkingFrom(node.id),
                    onCancelLink: () => setLinkingFrom(null),
                    onLinkHere: () => link(node.id),
                    onDraftSubmit: (name) => void createAndLink(name, node.id),
                    onDraftCancel: () => setDraft(null),
                  }}
                />
              );
            })}

            {!readOnly &&
              edges.map((e) => {
                const fromPosition = positions.get(e.fromNodeId);
                const toPosition = positions.get(e.toNodeId);
                if (!fromPosition || !toPosition) return null;
                const fromName = nodeName(nodeById.get(e.fromNodeId)!);
                const toName = nodeName(nodeById.get(e.toNodeId)!);
                const accessibleLabel = `Disconnect ${fromName} from ${toName}`;
                return (
                  <button
                    key={`x-${e.fromNodeId}-${e.toNodeId}`}
                    type="button"
                    title={accessibleLabel}
                    aria-label={accessibleLabel}
                    disabled={busy}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={() =>
                      unlink({ from: e.fromNodeId, to: e.toNodeId })
                    }
                    className="learning-plan-edge-remove"
                    style={
                      {
                        "--learning-plan-x": `${(fromPosition.x + toPosition.x) / 2 - 22}px`,
                        "--learning-plan-y": `${(fromPosition.y + toPosition.y) / 2 - 22}px`,
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
      {errorLine}
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------

function PlanStructurePath({
  learningPlanId,
  nodes,
  frontierId,
  onOpenStage,
}: {
  learningPlanId: LearningPlanId;
  nodes: LearningPlanNode[];
  frontierId?: PlanNodeId;
  onOpenStage: (stageId: StageId) => void;
}) {
  return (
    <section className="plan-structure-path" aria-label="Plan structure">
      <header>
        <span>Local workspace</span>
        <strong>Plan structure</strong>
      </header>
      <ol>
        {nodes.map((node, index) => (
          <li
            key={node.id}
            className={frontierId === node.id ? "is-current" : undefined}
          >
            <span className="plan-structure-path__marker">{index + 1}</span>
            <article>
              <span className="plan-structure-path__kind">
                {node.kind === PlanNodeKind.Stage ? "Stage" : "Direct Item"}
              </span>
              {node.kind === PlanNodeKind.Stage ? (
                <button type="button" onClick={() => onOpenStage(node.id)}>
                  {node.name}
                </button>
              ) : (
                <div className="plan-structure-path__item">
                  <span
                    className={`plan-structure-path__status is-${node.item.status.replace("_", "-")}`}
                    aria-hidden="true"
                  />
                  <div>
                    <Link
                      to={`/items/${node.item.id}`}
                      state={itemDetailRouteState(
                        planItemBackgroundLocation({ learningPlanId }),
                      )}
                    >
                      {node.item.title}
                    </Link>
                    <small>
                      {TYPE_LABELS[node.item.type]} ·{" "}
                      {STATUS_LABELS[node.item.status]}
                    </small>
                  </div>
                </div>
              )}
              {node.kind === PlanNodeKind.Stage ? (
                <small>
                  {node.done}/${node.total} Items done
                </small>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface SequenceNodeInput {
  nodeId: PlanNodeId;
  predecessorId: PlanNodeId;
}

interface SequenceBeforeInput {
  nodeId: PlanNodeId;
  successorId: PlanNodeId;
}

function LooseNodeRail({
  learningPlanId,
  nodes,
  allNodes,
  busy,
  readOnly,
  onOpen,
  onSequence,
  onSequenceBefore,
}: {
  learningPlanId: LearningPlanId;
  nodes: LearningPlanNode[];
  allNodes: LearningPlanNode[];
  busy: boolean;
  readOnly: boolean;
  onOpen: (stageId: StageId) => void;
  onSequence: (input: SequenceNodeInput) => void;
  onSequenceBefore: (input: SequenceBeforeInput) => void;
}) {
  const [draft, setDraft] = useState<{
    nodeId: PlanNodeId;
    mode: "after" | "before";
    otherNodeId: PlanNodeId | "";
  } | null>(null);

  return (
    <aside
      className={`unsequenced-rail${nodes.length === 0 ? " is-empty" : ""}`}
      aria-labelledby="unsequenced-title"
    >
      <h2 id="unsequenced-title">
        <span>Local workspace</span>
        <strong>Plan structure</strong>
        <small>
          Unsequenced <b>{nodes.length}</b>
        </small>
      </h2>
      {nodes.length === 0 ? (
        <p>Loose Items and Stages will wait here.</p>
      ) : (
        <ul>
          {nodes.map((node) => {
            const candidates = allNodes.filter(
              (candidate) => candidate.id !== node.id,
            );
            const name = nodeName(node);
            return (
              <li key={node.id}>
                {node.kind === PlanNodeKind.Item ? (
                  <Link
                    to={`/items/${node.item.id}`}
                    state={itemDetailRouteState(
                      planItemBackgroundLocation({ learningPlanId }),
                    )}
                    aria-label={`Open ${name}`}
                    className="unsequenced-rail__stage"
                  >
                    {name}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="unsequenced-rail__stage"
                    onClick={() => onOpen(node.id)}
                  >
                    {name}
                  </button>
                )}
                {node.kind === PlanNodeKind.Item && (
                  <span>{node.item.status.replace("_", " ")}</span>
                )}
                {!readOnly && draft?.nodeId === node.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (draft.otherNodeId) {
                        if (draft.mode === "after") {
                          onSequence({
                            nodeId: node.id,
                            predecessorId: draft.otherNodeId,
                          });
                        } else {
                          onSequenceBefore({
                            nodeId: node.id,
                            successorId: draft.otherNodeId,
                          });
                        }
                        setDraft(null);
                      }
                    }}
                  >
                    <label>
                      {draft.mode === "after" ? "Follows" : "Before"}
                      <select
                        value={draft.otherNodeId}
                        disabled={busy || candidates.length === 0}
                        onChange={(event) =>
                          setDraft({
                            nodeId: node.id,
                            mode: draft.mode,
                            otherNodeId: event.target.value as PlanNodeId,
                          })
                        }
                      >
                        <option value="" disabled>
                          Choose a Plan Node…
                        </option>
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {nodeName(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {candidates.length === 0 && (
                      <p>Add another node before sequencing this one.</p>
                    )}
                    <span>
                      <button
                        type="submit"
                        disabled={busy || !draft.otherNodeId}
                      >
                        {draft.mode === "after" ? "Sequence" : "Link"}
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
                  <span>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Sequence ${name}`}
                      onClick={() =>
                        setDraft({
                          nodeId: node.id,
                          mode: "after",
                          otherNodeId: "",
                        })
                      }
                    >
                      Sequence this{" "}
                      {node.kind === PlanNodeKind.Item ? "Item" : "Stage"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Link from ${name} to another node`}
                      onClick={() =>
                        setDraft({
                          nodeId: node.id,
                          mode: "before",
                          otherNodeId: "",
                        })
                      }
                    >
                      Link forward
                    </button>
                  </span>
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
  learningPlanId: LearningPlanId;
  x: number;
  y: number;
  isFrontier: boolean;
  readOnly: boolean;
  busy: boolean;
  isDrafting: boolean;
  isLinkSource: boolean;
  isLinkTarget: boolean;
  linking: boolean;
  linkingSourceName?: string;
  onPointerDown: (e: ReactPointerEvent) => void;
  controls: NodeWaypointControls;
}

interface NodeWaypointControls {
  onOpen?: () => void;
  onNext: () => void;
  onFork: () => void;
  onStartLink: () => void;
  onCancelLink: () => void;
  onLinkHere: () => void;
  onDraftSubmit: (name: string) => void;
  onDraftCancel: () => void;
}

/**
 * One Plan Node as a waypoint: its medallion (sealed green when done, a filling
 * ring while underway, a hollow ring when not started), its name, and — for a
 * Stage on desktop — the control that fits the moment: the ＋/⑃/⇢ authoring row
 * when idle, a target prompt while a link is being drawn, or the inline name
 * field while a new Stage is being added from here.
 */
function Waypoint({
  node,
  learningPlanId,
  x,
  y,
  isFrontier,
  readOnly,
  busy,
  isDrafting,
  isLinkSource,
  isLinkTarget,
  linking,
  linkingSourceName,
  onPointerDown,
  controls,
}: WaypointProps) {
  const done = isDone(node);
  const underway = isUnderway(node);
  const name = nodeName(node);
  const progressLabel =
    node.kind === PlanNodeKind.Item
      ? node.item.status.replace("_", " ")
      : node.total === 0
        ? "No items added yet"
        : `${node.done} of ${node.total} items done`;
  return (
    <div
      role="group"
      aria-label={`${name}: ${progressLabel}`}
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

      {node.kind === PlanNodeKind.Item ? (
        <Link
          to={`/items/${node.item.id}`}
          state={itemDetailRouteState(
            planItemBackgroundLocation({ learningPlanId }),
          )}
          className="learning-plan-stage-link"
          aria-label={`Open ${name}`}
          title={progressLabel}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <WaypointContents
            node={node}
            name={name}
            done={done}
            isFrontier={isFrontier}
            underway={underway}
          />
        </Link>
      ) : (
        <button
          type="button"
          className="learning-plan-stage-link"
          aria-label={`Open ${name}`}
          title={progressLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={controls.onOpen}
        >
          <WaypointContents
            node={node}
            name={name}
            done={done}
            isFrontier={isFrontier}
            underway={underway}
          />
        </button>
      )}

      {!readOnly && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          {isDrafting ? (
            <DraftForm
              busy={busy}
              placeholder="Name the new stage"
              onCancel={controls.onDraftCancel}
              onSubmit={controls.onDraftSubmit}
            />
          ) : isLinkSource ? (
            <RowButton
              label="Cancel"
              onClick={controls.onCancelLink}
              busy={busy}
            />
          ) : isLinkTarget ? (
            <RowButton
              label="⇢ link here"
              accessibleLabel={
                linkingSourceName
                  ? `Link ${linkingSourceName} to ${name}`
                  : undefined
              }
              onClick={controls.onLinkHere}
              busy={busy}
            />
          ) : linking ? null : (
            <div className="learning-plan-authoring-row">
              <Tip label="Add the next stage in sequence">
                <IconButton
                  label="＋"
                  accessibleLabel="Add next Stage"
                  onClick={controls.onNext}
                  busy={busy}
                />
              </Tip>
              <Tip label="Fork a parallel branch">
                <IconButton
                  label="⑃"
                  accessibleLabel="Fork a parallel branch"
                  onClick={controls.onFork}
                  busy={busy}
                />
              </Tip>
              <Tip label="Link to another node">
                <IconButton
                  label="⇢"
                  accessibleLabel={`Link from ${name} to another node`}
                  onClick={controls.onStartLink}
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

function WaypointContents({
  node,
  name,
  done,
  isFrontier,
  underway,
}: {
  node: LearningPlanNode;
  name: string;
  done: boolean;
  isFrontier: boolean;
  underway: boolean;
}) {
  const emptyStage = node.kind === PlanNodeKind.Stage && node.total === 0;
  const progressText =
    node.kind === PlanNodeKind.Item
      ? node.item.status === Status.Done
        ? "✓"
        : node.item.status === Status.InProgress
          ? "½"
          : "○"
      : emptyStage
        ? "Empty"
        : `${node.done}/${node.total}`;
  return (
    <>
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
                  {progressText}
                </span>
              }
            />
          </span>
        )}
      </span>
      <span className={`learning-plan-waypoint__name${done ? " is-done" : ""}`}>
        {name}
      </span>
    </>
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
  positions,
  from,
  to,
  stroke,
  width,
  dotted,
}: {
  positions: Map<string, { x: number; y: number }>;
  from: string;
  to: string;
  stroke: string;
  width: number;
  dotted?: boolean;
}) {
  const fromPosition = positions.get(from);
  const toPosition = positions.get(to);
  if (!fromPosition || !toPosition) return null;
  const midpointX = (fromPosition.x + toPosition.x) / 2;
  return (
    <path
      d={`M ${fromPosition.x} ${fromPosition.y} C ${midpointX} ${fromPosition.y}, ${midpointX} ${toPosition.y}, ${toPosition.x} ${toPosition.y}`}
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
  accessibleLabel,
  onClick,
  busy,
}: {
  label: string;
  accessibleLabel?: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="learning-plan-row-button"
      aria-label={accessibleLabel}
    >
      {label}
    </button>
  );
}

function ErrorLine({
  error,
  busy,
  onRetry,
}: {
  error: string;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="surface-error">
      <p>Could not change the Learning Plan: {error}</p>
      <button type="button" disabled={busy} onClick={onRetry}>
        Retry
      </button>
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
