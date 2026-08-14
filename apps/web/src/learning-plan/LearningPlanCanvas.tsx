import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  GitBranch,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Unlink,
  X,
} from "lucide-react";
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
import { ItemStatusBadge } from "../items/ItemStatusBadge";
import { STATUS_LABELS } from "../items/presentation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
      <div className="grid min-h-48 place-items-center rounded-[var(--radius-panel)] border border-dashed bg-muted/40 p-6 text-center">
        {draft ? (
          <DraftForm
            busy={busy}
            placeholder="Name your first stage"
            onCancel={() => setDraft(null)}
            onSubmit={(name) => void createAndLink(name, null)}
          />
        ) : (
          !readOnly && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => setDraft({ from: null, mode: "start" })}
            >
              <Plus />
              Start your Learning Plan
            </Button>
          )
        )}
        {readOnly && (
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
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
      aria-busy={busy}
      className="min-w-0 space-y-3"
    >
      {busy && (
        <Badge variant="neutral">
          <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          Updating plan…
        </Badge>
      )}
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-[minmax(11rem,14rem)_minmax(0,1fr)]">
        {looseNodes.length > 0 && (
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
        )}
        <div
          ref={canvasRef}
          role="region"
          aria-label="Learning Plan canvas"
          tabIndex={0}
          className={cn(
            "relative h-(--learning-plan-height) min-h-48 w-full min-w-0 overflow-auto rounded-[var(--radius-panel)] border bg-background select-none [overscroll-behavior:contain] [touch-action:pan-x_pan-y] md:col-span-1",
            looseNodes.length === 0 && "md:col-span-2",
            grabbing ? "cursor-grabbing" : "cursor-grab",
          )}
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
            className="relative h-(--learning-plan-content-height) min-h-full w-(--learning-plan-width) min-w-full bg-background [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:40px_40px]"
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
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            >
              {edges.map((e) => (
                <LearningPlanSeg
                  key={`u-${e.fromNodeId}-${e.toNodeId}`}
                  positions={positions}
                  from={e.fromNodeId}
                  to={e.toNodeId}
                  stroke="var(--border)"
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
                    stroke="var(--status-completed)"
                    width={5}
                  />
                ))}
            </svg>

            {sequencedNodes.length === 0 && (
              <div
                className="absolute top-1/2 left-1/2 grid -translate-1/2 justify-items-center gap-2 text-center text-sm text-muted-foreground"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p className="m-0">
                  Sequence a Stage to place it on the canvas.
                </p>
                {!readOnly &&
                  (draft?.from === null ? (
                    <DraftForm
                      busy={busy}
                      placeholder="Name another stage"
                      onCancel={() => setDraft(null)}
                      onSubmit={(name) => void createAndLink(name, null)}
                    />
                  ) : (
                    <Button
                      type="button"
                      disabled={busy}
                      variant="secondary"
                      onClick={() => setDraft({ from: null, mode: "start" })}
                    >
                      <Plus />
                      Add another Stage
                    </Button>
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
                  <Button
                    key={`x-${e.fromNodeId}-${e.toNodeId}`}
                    type="button"
                    title={accessibleLabel}
                    aria-label={accessibleLabel}
                    disabled={busy}
                    variant="secondary"
                    size="icon"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={() =>
                      unlink({ from: e.fromNodeId, to: e.toNodeId })
                    }
                    className="absolute left-(--learning-plan-x) top-(--learning-plan-y) rounded-full bg-background"
                    style={
                      {
                        "--learning-plan-x": `${(fromPosition.x + toPosition.x) / 2 - 22}px`,
                        "--learning-plan-y": `${(fromPosition.y + toPosition.y) / 2 - 22}px`,
                      } as CSSProperties
                    }
                  >
                    <Unlink />
                  </Button>
                );
              })}
          </div>

          {rearranged && (
            <Button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOffsets({})}
              variant="secondary"
              size="compact"
              className="sticky bottom-3 left-[calc(100%-9rem)]"
            >
              <RotateCcw />
              Reset layout
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-normal text-muted-foreground">
        <Badge variant="completed">
          <Check /> Completed stage
        </Badge>
        <span>Solid path: walked</span>
        <span>Dotted path: ahead</span>
        <Badge variant="progress">Current · You are here</Badge>
        <span>
          {readOnly
            ? "Drag the map to pan. Open on a wider screen to arrange it."
            : "Drag to pan; the labelled controls add, fork, connect, or disconnect nodes."}
        </span>
      </div>
      {errorLine}
      <p role="status" className="sr-only">
        {announcement}
      </p>
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
      className="max-h-56 min-w-0 overflow-y-auto rounded-[var(--radius-panel)] border bg-card p-3 [overscroll-behavior:contain] md:max-h-[35rem]"
      aria-labelledby="unsequenced-title"
    >
      <h2
        id="unsequenced-title"
        className="mb-3 grid grid-cols-[1fr_auto] items-center gap-2"
      >
        <span className="col-span-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Local workspace
        </span>
        <strong className="font-serif text-lg font-medium">
          Plan structure
        </strong>
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Unsequenced <Badge variant="neutral">{nodes.length}</Badge>
        </span>
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0">
        {nodes.map((node) => {
          const candidates = allNodes.filter(
            (candidate) => candidate.id !== node.id,
          );
          const name = nodeName(node);
          return (
            <li
              key={node.id}
              className="grid min-w-0 gap-2 border-b pb-3 last:border-b-0 last:pb-0"
            >
              {node.kind === PlanNodeKind.Item ? (
                <Button
                  variant="quiet"
                  className="h-auto justify-start px-0 text-left whitespace-normal"
                  asChild
                >
                  <Link
                    to={`/items/${node.item.id}`}
                    state={itemDetailRouteState(
                      planItemBackgroundLocation({ learningPlanId }),
                    )}
                    aria-label={`Open ${name}`}
                  >
                    {name}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="quiet"
                  className="h-auto justify-start px-0 text-left whitespace-normal"
                  onClick={() => onOpen(node.id)}
                >
                  {name}
                </Button>
              )}
              {node.kind === PlanNodeKind.Item && (
                <ItemStatusBadge status={node.item.status} />
              )}
              {!readOnly && draft?.nodeId === node.id ? (
                <form
                  className="grid gap-2"
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
                  <Field>
                    <FieldLabel>
                      {draft.mode === "after" ? "Follows" : "Before"}
                    </FieldLabel>
                    <Select
                      value={draft.otherNodeId}
                      disabled={busy || candidates.length === 0}
                      onValueChange={(value) =>
                        setDraft({
                          nodeId: node.id,
                          mode: draft.mode,
                          otherNodeId: value as PlanNodeId,
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label={
                          draft.mode === "after" ? "Follows" : "Before"
                        }
                        className="w-full"
                      >
                        <SelectValue placeholder="Choose a Plan Node…" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {nodeName(candidate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {candidates.length === 0 && (
                    <FieldDescription>
                      Add another node before sequencing this one.
                    </FieldDescription>
                  )}
                  <span className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      size="compact"
                      disabled={busy || !draft.otherNodeId}
                    >
                      {draft.mode === "after" ? "Sequence" : "Link"}
                    </Button>
                    <Button
                      type="button"
                      variant="quiet"
                      size="compact"
                      disabled={busy}
                      onClick={() => setDraft(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                </form>
              ) : !readOnly ? (
                <span className="grid gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
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
                    <ArrowRight />
                    Sequence this{" "}
                    {node.kind === PlanNodeKind.Item ? "Item" : "Stage"}
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    size="compact"
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
                    <Link2 />
                    Link forward
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
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
      ? STATUS_LABELS[node.item.status]
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
      className="absolute left-(--learning-plan-x) top-(--learning-plan-y) flex w-48 touch-none cursor-grab flex-col items-center gap-2"
      style={
        {
          "--learning-plan-x": `${x - 96}px`,
          "--learning-plan-y": `${y - R - 16}px`,
        } as CSSProperties
      }
    >
      {isFrontier && <Badge variant="progress">Current · You are here</Badge>}
      {isLinkSource && <Badge variant="neutral">Link source</Badge>}

      {node.kind === PlanNodeKind.Item ? (
        <Button
          variant="quiet"
          className="h-auto min-h-11 min-w-11 flex-col whitespace-normal px-2 py-1"
          asChild
        >
          <Link
            to={`/items/${node.item.id}`}
            state={itemDetailRouteState(
              planItemBackgroundLocation({ learningPlanId }),
            )}
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
        </Button>
      ) : (
        <Button
          type="button"
          variant="quiet"
          className="h-auto min-h-11 min-w-11 flex-col whitespace-normal px-2 py-1"
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
        </Button>
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
            <div className="flex items-center gap-1">
              <Tip label="Add the next stage in sequence">
                <IconButton
                  icon={<Plus />}
                  accessibleLabel="Add the next stage in sequence"
                  onClick={controls.onNext}
                  busy={busy}
                />
              </Tip>
              <Tip label="Fork a parallel branch">
                <IconButton
                  icon={<GitBranch />}
                  accessibleLabel="Fork a parallel branch"
                  onClick={controls.onFork}
                  busy={busy}
                />
              </Tip>
              <Tip label="Link to another node">
                <IconButton
                  icon={<Link2 />}
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
      <span className="rounded-full">
        {done ? (
          <Seal />
        ) : (
          <span
            className={cn(
              "flex size-[58px] items-center justify-center rounded-full border bg-card",
              isFrontier &&
                "outline-3 outline-offset-2 outline-double outline-primary",
            )}
          >
            <ProgressRing
              size={R * 2 - 8}
              stroke={5}
              progress={progressOf(node)}
              track="var(--input)"
              fill={
                isFrontier || underway
                  ? "var(--status-progress)"
                  : "var(--muted-foreground)"
              }
              center={
                <span className="text-xs font-bold text-foreground tabular-nums">
                  {progressText}
                </span>
              }
            />
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-center text-sm leading-tight font-semibold tracking-wide text-foreground [overflow-wrap:anywhere]",
          done &&
            "decoration-3 underline decoration-status-completed underline-offset-4",
        )}
      >
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
      className="flex max-w-full items-center gap-1"
    >
      <Input
        autoFocus
        value={name}
        placeholder={placeholder}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="w-36 text-sm"
      />
      <Button
        type="submit"
        disabled={busy}
        size="icon"
        aria-label="Create Stage"
      >
        <Check />
      </Button>
      <Button
        type="button"
        disabled={busy}
        onClick={onCancel}
        variant="quiet"
        size="icon"
        aria-label="Cancel new Stage"
      >
        <X />
      </Button>
    </form>
  );
}

/**
 * A completed Stage: a sealed green medallion with a check, so completion remains
 * legible without its colour.
 */
function Seal() {
  return (
    <div className="grid size-[58px] place-items-center rounded-full border-4 border-double border-primary-foreground bg-status-completed text-primary-foreground">
      <Check aria-hidden="true" />
      <span className="sr-only">Completed stage</span>
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
  icon,
  accessibleLabel,
  onClick,
  busy,
}: {
  icon: React.ReactNode;
  accessibleLabel: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <Button
      type="button"
      disabled={busy}
      onClick={onClick}
      variant="secondary"
      size="icon-compact"
      aria-label={accessibleLabel}
    >
      {icon}
    </Button>
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
    <Button
      type="button"
      disabled={busy}
      onClick={onClick}
      variant="secondary"
      size="compact"
      aria-label={accessibleLabel}
    >
      {label}
    </Button>
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
    <Alert className="flex flex-wrap items-center justify-between gap-3">
      <p className="m-0">Could not change the Learning Plan: {error}</p>
      <Button
        type="button"
        variant="secondary"
        size="compact"
        disabled={busy}
        onClick={onRetry}
      >
        Retry
      </Button>
    </Alert>
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
