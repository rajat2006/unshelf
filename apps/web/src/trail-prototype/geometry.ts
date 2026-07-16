/**
 * PROTOTYPE (issue #21) — throwaway. Shared positioning math for the visual
 * variants: turn the topology into a (depth, lane) grid so each variant can map
 * it to pixels its own way (vertical path, horizontal metro, roadmap rails).
 * This is layout DERIVED from the edge set — the whole point of ADR-0010's "no
 * stored position". Rendering is NOT shared; only this grid math is.
 */
import { layers, type Trail } from "./model";

export interface Placed {
  id: string;
  label: string;
  depth: number; // distance from a root (column in the DAG)
  lane: number; // which parallel thread, within a depth
}

export interface Grid {
  placed: Placed[];
  byId: Map<string, Placed>;
  depthCount: number;
  laneCount: number;
}

/**
 * Assign every Stop a (depth, lane). Depth is longest-path distance from a root
 * (from `layers`). Lane keeps a fork's branches on stable rows: a node inherits
 * its first parent's lane when free, otherwise takes the next open lane — so the
 * trunk stays straight and forks peel off predictably.
 */
export function grid(trail: Trail): Grid {
  const cols = layers(trail);
  const depthOf = new Map<string, number>();
  cols.forEach((ids, d) => ids.forEach((id) => depthOf.set(id, d)));

  const parents = new Map<string, string[]>();
  for (const n of trail.nodes) parents.set(n.id, []);
  for (const e of trail.edges) parents.get(e.to)?.push(e.from);

  const laneOf = new Map<string, number>();
  const usedPerDepth = new Map<number, Set<number>>();
  const take = (depth: number, preferred: number): number => {
    const used = usedPerDepth.get(depth) ?? new Set<number>();
    let lane = preferred;
    while (used.has(lane)) lane += 1;
    used.add(lane);
    usedPerDepth.set(depth, used);
    return lane;
  };

  // Walk depth by depth so a parent's lane is known before its children.
  cols.forEach((ids, d) => {
    for (const id of ids) {
      const ps = parents.get(id) ?? [];
      const preferred = ps.length
        ? Math.min(...ps.map((p) => laneOf.get(p) ?? 0))
        : 0;
      laneOf.set(id, take(d, preferred));
    }
  });

  const placed: Placed[] = trail.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    depth: depthOf.get(n.id) ?? 0,
    lane: laneOf.get(n.id) ?? 0,
  }));
  const byId = new Map(placed.map((p) => [p.id, p]));
  const laneCount = Math.max(1, ...placed.map((p) => p.lane + 1));
  const depthCount = Math.max(1, cols.length);
  return { placed, byId, depthCount, laneCount };
}
