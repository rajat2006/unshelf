/**
 * PROTOTYPE — throwaway variants. Ticket #219, map #211.
 *
 * A is the shipped derived layout untouched. B keeps that geometry and marks
 * its zero-degree roots. C extracts those same derived roots into a compact
 * presentation rail while leaving the sequenced Trail on the normal canvas.
 */
import type { CSSProperties } from "react";
import type { TrailNode } from "@unshelf/shared";
import {
  fixtureFor,
  SEQUENCED_EDGES,
  SEQUENCED_NODES,
  type LooseCount,
} from "./fixtures";
import {
  CanvasShell,
  PrototypeFrame,
  TrailEdges,
  Waypoint,
  geometryFor,
  usePrototypeInteraction,
  type PrototypeInteraction,
} from "./shared";

export const VARIANT_NAMES = {
  A: "Untreated derived layout",
  B: "Marked staging band",
  C: "Compact staging rail",
} as const;

export function VariantA({ looseCount }: { looseCount: LooseCount }) {
  const fixture = fixtureFor(looseCount);
  const geometry = geometryFor(fixture);
  const interaction = usePrototypeInteraction();
  const looseIds = new Set(fixture.looseNodes.map((node) => node.id));

  return (
    <PrototypeFrame
      nodes={fixture.nodes}
      looseIds={looseIds}
      interaction={interaction}
      treatmentNote="Control: loose Stops are ordinary depth-0 waypoints."
      canvas={
        <CanvasShell geometry={geometry}>
          <TrailEdges
            edges={fixture.edges}
            positions={geometry.positions}
            width={geometry.width}
            height={geometry.height}
          />
          {geometry.placed.map((placed) => (
            <Waypoint
              key={placed.node.id}
              node={placed.node}
              point={geometry.positions.get(placed.node.id)!}
              isLoose={looseIds.has(placed.node.id)}
              treatment="control"
              interaction={interaction}
              sequencedNodes={SEQUENCED_NODES}
            />
          ))}
        </CanvasShell>
      }
    />
  );
}

export function VariantB({ looseCount }: { looseCount: LooseCount }) {
  const fixture = fixtureFor(looseCount);
  const geometry = geometryFor(fixture);
  const interaction = usePrototypeInteraction();
  const looseIds = new Set(fixture.looseNodes.map((node) => node.id));
  const loosePoints = fixture.looseNodes.flatMap((node) => {
    const point = geometry.positions.get(node.id);
    return point ? [point] : [];
  });
  const firstY = Math.min(...loosePoints.map((point) => point.y));
  const lastY = Math.max(...loosePoints.map((point) => point.y));

  return (
    <PrototypeFrame
      nodes={fixture.nodes}
      looseIds={looseIds}
      interaction={interaction}
      treatmentNote="Same layout, with a dashed intake band and an Unsequenced badge."
      canvas={
        <CanvasShell geometry={geometry} className="loose-proto-canvas--band">
          <div
            className="loose-proto-stage-band"
            aria-hidden="true"
            style={
              {
                "--band-top": `${firstY - 72}px`,
                "--band-height": `${lastY - firstY + 144}px`,
              } as CSSProperties
            }
          />
          <TrailEdges
            edges={fixture.edges}
            positions={geometry.positions}
            width={geometry.width}
            height={geometry.height}
          />
          {geometry.placed.map((placed) => (
            <Waypoint
              key={placed.node.id}
              node={placed.node}
              point={geometry.positions.get(placed.node.id)!}
              isLoose={looseIds.has(placed.node.id)}
              treatment="band"
              interaction={interaction}
              sequencedNodes={SEQUENCED_NODES}
            />
          ))}
        </CanvasShell>
      }
    />
  );
}

export function VariantC({ looseCount }: { looseCount: LooseCount }) {
  const fixture = fixtureFor(looseCount);
  const geometry = geometryFor({
    nodes: SEQUENCED_NODES,
    edges: SEQUENCED_EDGES,
  });
  const interaction = usePrototypeInteraction();
  const looseIds = new Set(fixture.looseNodes.map((node) => node.id));

  return (
    <PrototypeFrame
      nodes={fixture.nodes}
      looseIds={looseIds}
      interaction={interaction}
      treatmentNote="Zero-degree roots move into a compact rail; the Trail keeps its full canvas."
      canvas={
        <div
          className="trail-canvas loose-proto-canvas loose-proto-canvas--rail"
          role="region"
          aria-label="Trail canvas with unsequenced Stop rail"
          tabIndex={0}
        >
          <StagingRail
            looseNodes={fixture.looseNodes}
            interaction={interaction}
          />
          <div className="loose-proto-sequenced-viewport">
            <div
              className="trail-canvas__ground"
              style={
                {
                  "--trail-width": `${geometry.width}px`,
                  "--trail-content-height": `${geometry.height}px`,
                } as CSSProperties
              }
            >
              <TrailEdges
                edges={SEQUENCED_EDGES}
                positions={geometry.positions}
                width={geometry.width}
                height={geometry.height}
              />
              {geometry.placed.map((placed) => (
                <Waypoint
                  key={placed.node.id}
                  node={placed.node}
                  point={geometry.positions.get(placed.node.id)!}
                  isLoose={false}
                  treatment="control"
                  interaction={interaction}
                  sequencedNodes={SEQUENCED_NODES}
                />
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

function StagingRail({
  looseNodes,
  interaction,
}: {
  looseNodes: readonly TrailNode[];
  interaction: PrototypeInteraction;
}) {
  return (
    <aside className="loose-proto-rail" aria-label="Unsequenced Stops">
      <div className="loose-proto-rail-heading">
        <div>
          <span>Unsequenced</span>
          <strong>
            {looseNodes.length} {looseNodes.length === 1 ? "Stop" : "Stops"}
          </strong>
        </div>
        <span className="loose-proto-rail-hint">Choose one to place</span>
      </div>
      <ul>
        {looseNodes.map((node) => {
          const selected = interaction.selectedId === node.id;
          return (
            <li key={node.id}>
              <button
                type="button"
                aria-label={`Open ${node.name}`}
                className={`loose-proto-rail-row${
                  selected ? " is-selected" : ""
                }`}
                onClick={() => interaction.openStop(node)}
              >
                <span className="loose-proto-mini-medallion">0/1</span>
                <span>
                  <strong>{node.name}</strong>
                  <small>Not sequenced</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
