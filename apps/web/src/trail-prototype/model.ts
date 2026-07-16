/**
 * PROTOTYPE (issue #21) — throwaway. See ./README.md.
 *
 * The one part of this spike worth keeping: a pure, portable model of the Trail's
 * topology. It answers the hard-to-reverse question — *what persistence shape do
 * the Stop-to-Stop edges take?* — by being the shared state all three authoring
 * variants read and write. If every interaction the variants offer can be
 * expressed as operations on this model, the model is the persistence shape.
 *
 * The proposed shape (confirmed by the spike, see README verdict → ADR-0010):
 *
 *   - The Trail is NOT a table. Like All, it is a derived view: its nodes are
 *     simply the User's Stops, its edges are the rows of one adjacency table.
 *   - An edge is a directed pair `(from_stop, to_stop)` — a Stop-to-Stop link.
 *     A fork is a Stop with several out-edges; a join is a Stop with several
 *     in-edges; the whole is a DAG.
 *   - The edge set carries NO layout. There is no stored x/y and no fork order:
 *     the Trail stays a "lightweight topology" (ADR-0038). Layout (`layers`
 *     below) is derived from the topology on read, exactly as `pastTarget` is.
 *   - Acyclicity is enforced here, at write time (`connect` refuses a back-edge),
 *     the same way the real repository will enforce it at the API seam.
 *
 * Nothing in this file imports React, the DOM, or a database — it is the reducer
 * that lifts into `apps/api` (repository) and `packages/shared` (the `TrailEdge`
 * type) when T8 builds the real Trail.
 */

/**
 * A node on the Trail — a Stop. In the real model `done`/`total` are NOT stored:
 * they are a derived read (count of the Stop's Items whose Status is `done`, over
 * its Item count), the same way `pastTarget` is derived (ADR-0005). The prototype
 * carries them inline only so progress has something to render and advance.
 */
export interface StopNode {
  id: string;
  label: string;
  /** Items in this Stop marked done. */
  done: number;
  /** Items in this Stop in total. */
  total: number;
}

/** A Stop's completion fraction (0..1); an empty Stop reads as 0. */
export function progressOf(n: StopNode): number {
  return n.total > 0 ? n.done / n.total : 0;
}

/** A Stop is done when it has Items and all of them are done. */
export function isDone(n: StopNode): boolean {
  return n.total > 0 && n.done >= n.total;
}

/** A Stop is underway when some — but not all — of its Items are done. */
export function isUnderway(n: StopNode): boolean {
  return n.done > 0 && n.done < n.total;
}

/**
 * A path segment `from → to` reads as "walked" once its earlier Stop is done —
 * you've finished that Stop, so you've covered the ground leading out of it.
 */
export function isWalked(trail: Trail, edge: Edge): boolean {
  const from = trail.nodes.find((n) => n.id === edge.from);
  return !!from && isDone(from);
}

/** A directed Stop-to-Stop edge — one row of the proposed `trail_edges` table. */
export interface Edge {
  from: string;
  to: string;
}

/**
 * The whole Trail as it would persist: the node set (the User's Stops) and the
 * edge set. This object *is* the persistence shape — no positions, no order.
 */
export interface Trail {
  nodes: StopNode[];
  edges: Edge[];
}

export type TrailAction =
  | { kind: "addNode"; label: string }
  | { kind: "addAfter"; from: string | null; label: string }
  | { kind: "removeNode"; id: string }
  | { kind: "rename"; id: string; label: string }
  | { kind: "connect"; from: string; to: string }
  | { kind: "disconnect"; from: string; to: string }
  /** Advance a Stop's completion by one Item, wrapping back to 0 past full. */
  | { kind: "bump"; id: string };

/** Item count a freshly-created Stop pretends to hold, so it has a ring to fill. */
const DEFAULT_ITEMS = 4;

let seq = 0;
/** Throwaway id source — the real model uses `gen_random_uuid()` (see schema.ts). */
function nextId(): string {
  seq += 1;
  return `s${seq}`;
}

export function emptyTrail(): Trail {
  return { nodes: [], edges: [] };
}

/**
 * A realistic starting Trail so every variant opens populated (design principle:
 * evaluate against real content, never an empty canvas). A learning journey with
 * one fork (Frontend ‖ Backend) that rejoins — sequence, fork, and join all
 * present so the visuals have something to show.
 */
export function seedTrail(): Trail {
  const mk = (label: string, done: number, total: number): StopNode => ({
    id: nextId(),
    label,
    done,
    total,
  });
  // A journey walked as far as React: the trunk behind it is done, React is
  // underway (3 of 5), and everything past it is still ahead.
  const foundations = mk("HTML & CSS", 4, 4);
  const js = mk("JavaScript", 3, 3);
  const react = mk("React", 3, 5);
  const routing = mk("State & Routing", 0, 3);
  const node = mk("Node & Express", 2, 2);
  const db = mk("Databases", 1, 4);
  const build = mk("Build a Full-Stack App", 0, 1);
  const deploy = mk("Deploy", 0, 1);
  const nodes = [foundations, js, react, routing, node, db, build, deploy];
  const e = (from: StopNode, to: StopNode): Edge => ({ from: from.id, to: to.id });
  return {
    nodes,
    edges: [
      e(foundations, js),
      e(js, react),
      e(react, routing),
      e(js, node),
      e(node, db),
      e(routing, build),
      e(db, build),
      e(build, deploy),
    ],
  };
}

/** Add a Stop already linked after `from`, returning the new trail and node id. */
export function addAfter(
  trail: Trail,
  from: string | null,
  label: string,
): { trail: Trail; id: string } {
  const node: StopNode = { id: nextId(), label, done: 0, total: DEFAULT_ITEMS };
  const withNode: Trail = { ...trail, nodes: [...trail.nodes, node] };
  const linked =
    from && canConnect(withNode, from, node.id)
      ? { ...withNode, edges: [...withNode.edges, { from, to: node.id }] }
      : withNode;
  return { trail: linked, id: node.id };
}

/**
 * The reducer. Pure `(state, action) => state`. Illegal writes (a duplicate
 * edge, a self-loop, or a back-edge that would break the DAG) are refused by
 * returning the state unchanged — the same contract the API seam will enforce.
 */
export function reduce(trail: Trail, action: TrailAction): Trail {
  switch (action.kind) {
    case "addNode":
      return {
        ...trail,
        nodes: [
          ...trail.nodes,
          { id: nextId(), label: action.label, done: 0, total: DEFAULT_ITEMS },
        ],
      };

    case "addAfter":
      return addAfter(trail, action.from, action.label).trail;

    case "bump":
      return {
        ...trail,
        nodes: trail.nodes.map((n) =>
          n.id === action.id
            ? { ...n, done: n.done >= n.total ? 0 : n.done + 1 }
            : n,
        ),
      };

    case "removeNode":
      return {
        nodes: trail.nodes.filter((n) => n.id !== action.id),
        edges: trail.edges.filter(
          (e) => e.from !== action.id && e.to !== action.id,
        ),
      };

    case "rename":
      return {
        ...trail,
        nodes: trail.nodes.map((n) =>
          n.id === action.id ? { ...n, label: action.label } : n,
        ),
      };

    case "connect": {
      if (!canConnect(trail, action.from, action.to)) return trail;
      return { ...trail, edges: [...trail.edges, { from: action.from, to: action.to }] };
    }

    case "disconnect":
      return {
        ...trail,
        edges: trail.edges.filter(
          (e) => !(e.from === action.from && e.to === action.to),
        ),
      };
  }
}

/** Whether an edge from→to may be added: no self-loop, no dup, no cycle. */
export function canConnect(trail: Trail, from: string, to: string): boolean {
  if (from === to) return false;
  if (trail.edges.some((e) => e.from === from && e.to === to)) return false;
  // A back-edge is one whose target can already reach its source.
  return !reaches(trail, to, from);
}

/** Does `from` reach `to` by following edges? (Reachability over the DAG.) */
export function reaches(trail: Trail, from: string, to: string): boolean {
  const out = new Map<string, string[]>();
  for (const e of trail.edges) {
    const list = out.get(e.from) ?? [];
    list.push(e.to);
    out.set(e.from, list);
  }
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of out.get(cur) ?? []) stack.push(n);
  }
  return false;
}

/**
 * Whether the edge set contains a cycle (a real path of length ≥ 1 back to a
 * node). `connect` makes this impossible by construction; the state panel calls
 * it only to keep that invariant visible. Note this is NOT `reaches(n, n)` —
 * every node reaches itself in zero steps, so that would always report a cycle.
 */
export function hasCycle(trail: Trail): boolean {
  const out = new Map<string, string[]>();
  for (const e of trail.edges) {
    const list = out.get(e.from) ?? [];
    list.push(e.to);
    out.set(e.from, list);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0 visiting, 2 done
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true; // back-edge → cycle
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const n of out.get(id) ?? []) if (visit(n)) return true;
    state.set(id, 2);
    return false;
  };
  return trail.nodes.some((n) => visit(n.id));
}

/** Stops with no incoming edge — where a thread of the Trail begins. */
export function roots(trail: Trail): StopNode[] {
  const targets = new Set(trail.edges.map((e) => e.to));
  return trail.nodes.filter((n) => !targets.has(n.id));
}

/** Stops with no outgoing edge — where a thread of the Trail ends. */
export function leaves(trail: Trail): StopNode[] {
  const sources = new Set(trail.edges.map((e) => e.from));
  return trail.nodes.filter((n) => !sources.has(n.id));
}

/**
 * The derived layout: each Stop's column = its longest distance from a root.
 * Sequence runs left→right; parallel forks land in the same column and stack.
 * This is the proof that no x/y need be stored — the canvas position is a pure
 * read off the topology, recomputed on every render.
 */
export function layers(trail: Trail): string[][] {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const n of trail.nodes) incoming.set(n.id, []);
  for (const e of trail.edges) incoming.get(e.to)?.push(e.from);

  // Longest-path depth via memoised DFS (the graph is acyclic by construction).
  function depthOf(id: string, path: Set<string>): number {
    if (depth.has(id)) return depth.get(id)!;
    if (path.has(id)) return 0; // defensive; connect() prevents real cycles
    path.add(id);
    const preds = incoming.get(id) ?? [];
    const d = preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => depthOf(p, path)));
    path.delete(id);
    depth.set(id, d);
    return d;
  }

  const cols: string[][] = [];
  for (const n of trail.nodes) {
    const d = depthOf(n.id, new Set());
    (cols[d] ??= []).push(n.id);
  }
  return cols.map((c) => c ?? []);
}

/** A one-line human summary of the whole edge set — what the state panel shows. */
export function describe(trail: Trail): string {
  if (trail.edges.length === 0) return "(no edges yet)";
  return trail.edges
    .map((e) => `${labelOf(trail, e.from)} → ${labelOf(trail, e.to)}`)
    .join("\n");
}

export function labelOf(trail: Trail, id: string): string {
  return trail.nodes.find((n) => n.id === id)?.label ?? id;
}
