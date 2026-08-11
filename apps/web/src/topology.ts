/** A directed edge between two opaque node identities. */
export interface TopologyEdge<NodeId extends string> {
  from: NodeId;
  to: NodeId;
}

export interface TopologyPlacement {
  /** Longest-path distance from a root, from left to right. */
  depth: number;
  /** The deterministic parallel lane within a depth. */
  lane: number;
}

export interface TopologyLayout<NodeId extends string> {
  byId: Map<NodeId, TopologyPlacement>;
  /** Number of columns; at least one. */
  depthCount: number;
  /** Number of parallel lanes; at least one. */
  laneCount: number;
}

interface Topology<NodeId extends string> {
  nodeIds: readonly NodeId[];
  edges: readonly TopologyEdge<NodeId>[];
}

interface TopologyTraversal<NodeId extends string> {
  edges: readonly TopologyEdge<NodeId>[];
  from: NodeId;
  to: NodeId;
}

const appendMapValue = <NodeId extends string>({
  map,
  key,
  value,
}: {
  map: Map<NodeId, NodeId[]>;
  key: NodeId;
  value: NodeId;
}) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

const adjacency = <NodeId extends string>(
  edges: readonly TopologyEdge<NodeId>[],
) => {
  const out = new Map<NodeId, NodeId[]>();
  const incoming = new Map<NodeId, NodeId[]>();
  for (const edge of edges) {
    appendMapValue({ map: out, key: edge.from, value: edge.to });
    appendMapValue({ map: incoming, key: edge.to, value: edge.from });
  }
  return { out, incoming };
};

/** Whether one opaque node identity can reach another by following edges. */
export function reaches<NodeId extends string>({
  edges,
  from,
  to,
}: TopologyTraversal<NodeId>): boolean {
  const { out } = adjacency(edges);
  const seen = new Set<NodeId>();
  const stack: NodeId[] = [from];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of out.get(current) ?? []) stack.push(next);
  }
  return false;
}

/** Whether an edge is new, is not a self-loop, and would keep the graph acyclic. */
export function canConnect<NodeId extends string>({
  edges,
  from,
  to,
}: TopologyTraversal<NodeId>): boolean {
  if (from === to) return false;
  if (edges.some((edge) => edge.from === from && edge.to === to)) return false;
  return !reaches({ edges, from: to, to: from });
}

/**
 * Derive deterministic grid positions from opaque node identities and a DAG.
 * Layout is recomputed from topology and is never a persisted domain fact.
 */
export function deriveTopologyLayout<NodeId extends string>({
  nodeIds,
  edges,
}: Topology<NodeId>): TopologyLayout<NodeId> {
  const { incoming } = adjacency(edges);
  const known = new Set(nodeIds);
  const parentsOf = (id: NodeId): NodeId[] =>
    (incoming.get(id) ?? []).filter((parent) => known.has(parent));

  const depthById = new Map<NodeId, number>();
  const depthOf = (id: NodeId, path: Set<NodeId>): number => {
    const cached = depthById.get(id);
    if (cached !== undefined) return cached;
    if (path.has(id)) return 0;
    path.add(id);
    const parents = parentsOf(id);
    const depth =
      parents.length === 0
        ? 0
        : 1 + Math.max(...parents.map((parent) => depthOf(parent, path)));
    path.delete(id);
    depthById.set(id, depth);
    return depth;
  };

  const columns: NodeId[][] = [];
  for (const id of nodeIds) {
    const depth = depthOf(id, new Set());
    (columns[depth] ??= []).push(id);
  }

  const laneById = new Map<NodeId, number>();
  const usedLanesByDepth = new Map<number, Set<number>>();
  const takeLane = ({
    depth,
    preferred,
  }: {
    depth: number;
    preferred: number;
  }): number => {
    const used = usedLanesByDepth.get(depth) ?? new Set<number>();
    let lane = preferred;
    while (used.has(lane)) lane += 1;
    used.add(lane);
    usedLanesByDepth.set(depth, used);
    return lane;
  };

  columns.forEach((ids, depth) => {
    for (const id of ids ?? []) {
      const parents = parentsOf(id);
      const preferred = parents.length
        ? Math.min(...parents.map((parent) => laneById.get(parent) ?? 0))
        : 0;
      laneById.set(id, takeLane({ depth, preferred }));
    }
  });

  const byId = new Map<NodeId, TopologyPlacement>();
  for (const id of nodeIds) {
    byId.set(id, {
      depth: depthOf(id, new Set()),
      lane: laneById.get(id) ?? 0,
    });
  }

  return {
    byId,
    depthCount: Math.max(1, columns.length),
    laneCount: Math.max(
      1,
      ...Array.from(byId.values(), (placement) => placement.lane + 1),
    ),
  };
}
