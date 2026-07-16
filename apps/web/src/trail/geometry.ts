import type { Stop, StopId, TrailEdge } from "@unshelf/shared";

/**
 * The Trail's layout, derived from its topology — never stored (ADR-0010). The
 * api hands back only the edge set; this turns (Stops + edges) into a grid so the
 * canvas can place each Stop, the same discipline as the derived `pastTarget`
 * (ADR-0005). Nothing here reaches for the DOM or a position column: canvas
 * position is a pure read off the topology, recomputed on every render.
 *
 * This is the prototype's `layers`/`grid` (issue #21) lifted into the shipped
 * Trail, retyped to the real `Stop` / `TrailEdge` contract.
 */

export interface PlacedStop {
  stop: Stop;
  /** Longest-path distance from a root — the Stop's column, left to right. */
  depth: number;
  /** Which parallel thread the Stop sits on, within its column. */
  lane: number;
}

export interface TrailLayout {
  placed: PlacedStop[];
  byId: Map<StopId, PlacedStop>;
  /** Number of columns; at least 1 even for a single unconnected Stop. */
  depthCount: number;
  /** Number of parallel lanes; at least 1. */
  laneCount: number;
}

const push = (map: Map<StopId, StopId[]>, key: StopId, value: StopId) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

const adjacency = (edges: readonly TrailEdge[]) => {
  const out = new Map<StopId, StopId[]>();
  const incoming = new Map<StopId, StopId[]>();
  for (const edge of edges) {
    push(out, edge.fromStopId, edge.toStopId);
    push(incoming, edge.toStopId, edge.fromStopId);
  }
  return { out, incoming };
};

/**
 * Whether `from` can reach `to` by following edges. Used to keep the canvas
 * honest before it asks the api: a target the source can already reach would
 * close a cycle, so the affordance is never offered (the api is still the
 * authority — this only spares the round-trip and the error).
 */
export function reaches(
  edges: readonly TrailEdge[],
  from: StopId,
  to: StopId,
): boolean {
  const { out } = adjacency(edges);
  const seen = new Set<StopId>();
  const stack: StopId[] = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of out.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/**
 * Whether an edge `from → to` may be drawn: no self-loop, no duplicate, and no
 * back-edge (the target must not already reach the source). Mirrors the
 * repository's `connect` rule so the UI and the api agree on what is legal.
 */
export function canConnect(
  edges: readonly TrailEdge[],
  from: StopId,
  to: StopId,
): boolean {
  if (from === to) return false;
  if (edges.some((e) => e.fromStopId === from && e.toStopId === to)) return false;
  return !reaches(edges, to, from);
}

/**
 * Place every Stop at a (depth, lane). Depth is the longest-path distance from a
 * root, so a sequence runs left→right and a fork's branches share a column; lane
 * keeps a fork's branches on stable rows — a Stop inherits its first parent's
 * lane when free, else takes the next open one, so the trunk stays straight and
 * forks peel off predictably. Unconnected Stops are roots at depth 0.
 */
export function layout(
  stops: readonly Stop[],
  edges: readonly TrailEdge[],
): TrailLayout {
  const { incoming } = adjacency(edges);
  const known = new Set(stops.map((s) => s.id));
  // Only consider edges whose endpoints are Stops we hold, so a stale edge never
  // throws the layout off (the api cascades, but a mid-flight read could differ).
  const parentsOf = (id: StopId): StopId[] =>
    (incoming.get(id) ?? []).filter((p) => known.has(p));

  const depth = new Map<StopId, number>();
  const depthOf = (id: StopId, path: Set<StopId>): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (path.has(id)) return 0; // defensive; the api guarantees acyclicity
    path.add(id);
    const parents = parentsOf(id);
    const d =
      parents.length === 0
        ? 0
        : 1 + Math.max(...parents.map((p) => depthOf(p, path)));
    path.delete(id);
    depth.set(id, d);
    return d;
  };

  const columns: StopId[][] = [];
  for (const stop of stops) {
    const d = depthOf(stop.id, new Set());
    (columns[d] ??= []).push(stop.id);
  }

  const laneOf = new Map<StopId, number>();
  const usedPerDepth = new Map<number, Set<number>>();
  const take = (d: number, preferred: number): number => {
    const used = usedPerDepth.get(d) ?? new Set<number>();
    let lane = preferred;
    while (used.has(lane)) lane += 1;
    used.add(lane);
    usedPerDepth.set(d, used);
    return lane;
  };
  columns.forEach((ids, d) => {
    for (const id of ids ?? []) {
      const parents = parentsOf(id);
      const preferred = parents.length
        ? Math.min(...parents.map((p) => laneOf.get(p) ?? 0))
        : 0;
      laneOf.set(id, take(d, preferred));
    }
  });

  const placed: PlacedStop[] = stops.map((stop) => ({
    stop,
    depth: depthOf(stop.id, new Set()),
    lane: laneOf.get(stop.id) ?? 0,
  }));
  const byId = new Map(placed.map((p) => [p.stop.id, p]));
  return {
    placed,
    byId,
    depthCount: Math.max(1, columns.length),
    laneCount: Math.max(1, ...placed.map((p) => p.lane + 1)),
  };
}
