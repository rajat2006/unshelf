/**
 * PROTOTYPE — throwaway canvas primitives. Ticket #219, map #211.
 *
 * Mirrors the shipped TrailCanvas constants exactly (240px columns, 150px
 * lanes, 76px padding, 29px waypoint radius, 560px viewport). The real
 * topology `layout` function supplies every control/band position.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import type { StopId, TrailEdge, TrailNode } from "@unshelf/shared";
import { layout, type Placed } from "../../trail/geometry";
import { itemsFor } from "./fixtures";

export const COL_W = 240;
export const LANE_H = 150;
export const PAD = 76;
export const R = 29;
export const VIEWPORT_HEIGHT = 560;

interface Point {
  x: number;
  y: number;
}

export interface CanvasGeometry {
  height: number;
  placed: readonly Placed<TrailNode>[];
  positions: Map<StopId, Point>;
  width: number;
}

export function geometryFor({
  nodes,
  edges,
}: {
  nodes: readonly TrailNode[];
  edges: readonly TrailEdge[];
}): CanvasGeometry {
  const derived = layout(nodes, edges);
  const positions = new Map<StopId, Point>(
    derived.placed.map((placed) => {
      const wander = Math.sin(placed.depth * 1.1 + placed.lane * 2) * 14;
      return [
        placed.node.id,
        {
          x: PAD + placed.depth * COL_W + R,
          y: PAD + placed.lane * LANE_H + R + wander,
        },
      ];
    }),
  );

  return {
    height: PAD * 2 + derived.laneCount * LANE_H,
    placed: derived.placed,
    positions,
    width: PAD * 2 + derived.depthCount * COL_W,
  };
}

export interface PrototypeInteraction {
  beginSequencing: (node: TrailNode) => void;
  choosePredecessor: (node: TrailNode) => void;
  closeStop: () => void;
  linkingLooseId: StopId | null;
  openStop: (node: TrailNode) => void;
  placementPreview: string | null;
  selectedId: StopId | null;
}

export function usePrototypeInteraction(): PrototypeInteraction {
  const [selectedId, setSelectedId] = useState<StopId | null>(null);
  const [linkingLooseId, setLinkingLooseId] = useState<StopId | null>(null);
  const [placementPreview, setPlacementPreview] = useState<string | null>(null);

  return {
    selectedId,
    linkingLooseId,
    placementPreview,
    openStop: (node) => {
      setSelectedId(node.id);
      setPlacementPreview(null);
    },
    closeStop: () => {
      setSelectedId(null);
      setLinkingLooseId(null);
      setPlacementPreview(null);
    },
    beginSequencing: (node) => {
      setSelectedId(node.id);
      setLinkingLooseId(node.id);
      setPlacementPreview(null);
    },
    choosePredecessor: (node) => {
      setLinkingLooseId(null);
      setPlacementPreview(
        `Preview only: the loose Stop would follow “${node.name}”.`,
      );
    },
  };
}

export function PrototypeFrame({
  canvas,
  interaction,
  looseIds,
  nodes,
  treatmentNote,
}: {
  canvas: ReactNode;
  interaction: PrototypeInteraction;
  looseIds: ReadonlySet<StopId>;
  nodes: readonly TrailNode[];
  treatmentNote: string;
}) {
  const selected = nodes.find((node) => node.id === interaction.selectedId);
  const linking = nodes.find((node) => node.id === interaction.linkingLooseId);

  return (
    <section className="loose-proto-frame" aria-label="Trail prototype">
      <div
        className={`loose-proto-layout${
          selected ? " trail-detail-layout" : ""
        }`}
      >
        <section className="trail-surface">
          <div className="loose-proto-trail-heading">
            <div>
              <p className="loose-proto-eyebrow">Trail</p>
              <h2>Learn React properly</h2>
            </div>
            <span className="loose-proto-saved">Saved</span>
          </div>

          {canvas}

          <p className="trail-legend">
            <strong>
              <span aria-hidden="true">✓</span> Completed Stop
            </strong>
            <span>Solid path: walked</span>
            <span>Dotted path: ahead</span>
            <span>＋ next · ⑃ fork · ⇢ link</span>
          </p>
        </section>

        {selected && (
          <StopDetails
            node={selected}
            isLoose={looseIds.has(selected.id)}
            interaction={interaction}
          />
        )}
      </div>

      <div className="loose-proto-state" aria-live="polite">
        <span>
          <strong>Treatment:</strong> {treatmentNote}
        </span>
        <span>
          <strong>Open:</strong> {selected?.name ?? "none"}
        </span>
        <span>
          <strong>Link state:</strong>{" "}
          {linking
            ? `choose what “${linking.name}” follows`
            : (interaction.placementPreview ?? "idle")}
        </span>
      </div>
    </section>
  );
}

function StopDetails({
  node,
  isLoose,
  interaction,
}: {
  node: TrailNode;
  isLoose: boolean;
  interaction: PrototypeInteraction;
}) {
  const items = itemsFor(node.id);
  const isLinking = interaction.linkingLooseId === node.id;

  return (
    <aside
      className="stop-sidebar loose-proto-sidebar"
      aria-label={`${node.name} details`}
    >
      <div className="stop-view__heading loose-proto-sidebar-heading">
        <div>
          <p className="loose-proto-eyebrow">
            Stop{isLoose ? " · not sequenced" : ""}
          </p>
          <h2>{node.name}</h2>
        </div>
        <button
          type="button"
          className="quiet-button"
          onClick={interaction.closeStop}
        >
          Close
        </button>
      </div>

      <div className="loose-proto-sidebar-section">
        <h3>
          {items.length} {items.length === 1 ? "Item" : "Items"}
        </h3>
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {isLoose && (
        <div className="loose-proto-sequence-action">
          <p>
            This Stop is on the Trail but has no sequence yet. Use the existing
            link relationship to place it.
          </p>
          <button
            type="button"
            className="quiet-button quiet-button--primary"
            onClick={() => interaction.beginSequencing(node)}
          >
            {isLinking
              ? "Choose a Stop on the canvas…"
              : "⇢ Sequence this Stop"}
          </button>
        </div>
      )}
    </aside>
  );
}

export function CanvasShell({
  children,
  geometry,
  className = "",
}: {
  children: ReactNode;
  geometry: CanvasGeometry;
  className?: string;
}) {
  return (
    <div
      className={`trail-canvas loose-proto-canvas ${className}`}
      role="region"
      aria-label="Trail canvas"
      tabIndex={0}
      style={
        {
          "--trail-height": `${Math.min(geometry.height, VIEWPORT_HEIGHT)}px`,
        } as CSSProperties
      }
    >
      <div
        className="trail-canvas__ground"
        style={
          {
            "--trail-width": `${geometry.width}px`,
            "--trail-content-height": `${geometry.height}px`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

export function TrailEdges({
  edges,
  positions,
  width,
  height,
}: {
  edges: readonly TrailEdge[];
  positions: Map<StopId, Point>;
  width: number;
  height: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      className="trail-canvas__edges"
      aria-hidden="true"
    >
      {edges.map((edge) => {
        const from = positions.get(edge.fromStopId);
        const to = positions.get(edge.toStopId);
        if (!from || !to) return null;
        const middleX = (from.x + to.x) / 2;
        const path = `M ${from.x} ${from.y} C ${middleX} ${from.y}, ${middleX} ${to.y}, ${to.x} ${to.y}`;
        return (
          <g key={`${edge.fromStopId}-${edge.toStopId}`}>
            <path
              d={path}
              fill="none"
              stroke="var(--line)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray="1 12"
            />
            {edge.fromStopId === ("foundations" as StopId) && (
              <path
                d={path}
                fill="none"
                stroke="var(--done)"
                strokeWidth={5}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Waypoint({
  interaction,
  isLoose,
  node,
  point,
  sequencedNodes,
  treatment,
}: {
  interaction: PrototypeInteraction;
  isLoose: boolean;
  node: TrailNode;
  point: Point;
  sequencedNodes: readonly TrailNode[];
  treatment: "control" | "band";
}) {
  const done = node.total > 0 && node.done === node.total;
  const isFrontier = node.id === ("component-model" as StopId);
  const selected = interaction.selectedId === node.id;
  const isLinkTarget =
    interaction.linkingLooseId !== null &&
    sequencedNodes.some((candidate) => candidate.id === node.id);

  return (
    <div
      role="group"
      aria-label={`${node.name}: ${node.done} of ${node.total} Items done`}
      className={`trail-waypoint loose-proto-waypoint${
        selected ? " is-selected" : ""
      }${isLoose && treatment === "band" ? " is-loose" : ""}`}
      style={
        {
          "--trail-x": `${point.x - 96}px`,
          "--trail-y": `${point.y - R - 16}px`,
        } as CSSProperties
      }
    >
      {isLoose && treatment === "band" && (
        <span className="loose-proto-badge">Unsequenced</span>
      )}
      {isFrontier && !isLoose && (
        <div className="trail-waypoint__frontier">You are here</div>
      )}

      <div className="trail-medallion">
        {done ? (
          <div className="trail-seal" aria-label="Completed">
            <span aria-hidden="true">✓</span>
          </div>
        ) : (
          <div
            className={`trail-medallion__ring${
              isFrontier ? " is-frontier" : ""
            }`}
          >
            <span className="trail-progress-label">
              {node.done}/{node.total}
            </span>
          </div>
        )}
      </div>

      <div className={`trail-waypoint__name${done ? " is-done" : ""}`}>
        <button
          type="button"
          className="trail-stop-link"
          aria-label={`Open ${node.name}`}
          onClick={() => interaction.openStop(node)}
        >
          {node.name}
        </button>
      </div>

      {isLinkTarget ? (
        <button
          type="button"
          className="trail-row-button loose-proto-link-target"
          onClick={() => interaction.choosePredecessor(node)}
        >
          ⇢ place after this
        </button>
      ) : (
        <div
          className="trail-authoring-row"
          aria-label="Stop authoring actions"
        >
          <button
            type="button"
            className="trail-icon-button"
            aria-label="Add next Stop"
          >
            ＋
          </button>
          <button
            type="button"
            className="trail-icon-button"
            aria-label="Fork a parallel branch"
          >
            ⑃
          </button>
          <button
            type="button"
            className="trail-icon-button"
            aria-label={`Link ${node.name}`}
            onClick={() => {
              if (isLoose) interaction.beginSequencing(node);
            }}
          >
            ⇢
          </button>
        </div>
      )}
    </div>
  );
}
