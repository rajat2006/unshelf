/**
 * PROTOTYPE — throwaway fixtures. Ticket #219, map #211.
 *
 * The sequenced Trail stays fixed while the scenario adds 1, 5, or 15
 * unconnected roots. All positions are derived by the real `layout` function.
 */
import type { StopId, TrailEdge, TrailNode, UserId } from "@unshelf/shared";

export type LooseCount = 1 | 5 | 15;

const stopId = (value: string) => value as StopId;
const userId = "prototype-user" as UserId;

export const SEQUENCED_NODES: readonly TrailNode[] = [
  {
    id: stopId("foundations"),
    name: "Foundations",
    done: 3,
    total: 3,
  },
  {
    id: stopId("component-model"),
    name: "Component model",
    done: 2,
    total: 4,
  },
  {
    id: stopId("state-and-effects"),
    name: "State & effects",
    done: 0,
    total: 3,
  },
  {
    id: stopId("testing"),
    name: "Test the behaviour",
    done: 0,
    total: 2,
  },
  {
    id: stopId("ship"),
    name: "Build something real",
    done: 0,
    total: 3,
  },
];

export const SEQUENCED_EDGES: readonly TrailEdge[] = [
  {
    userId,
    fromStopId: stopId("foundations"),
    toStopId: stopId("component-model"),
  },
  {
    userId,
    fromStopId: stopId("component-model"),
    toStopId: stopId("state-and-effects"),
  },
  {
    userId,
    fromStopId: stopId("component-model"),
    toStopId: stopId("testing"),
  },
  {
    userId,
    fromStopId: stopId("state-and-effects"),
    toStopId: stopId("ship"),
  },
  {
    userId,
    fromStopId: stopId("testing"),
    toStopId: stopId("ship"),
  },
];

const LOOSE_STOP_DATA = [
  ["CSS Grid notes", "A Complete Guide to Grid"],
  ["Design tokens", "Design Systems Handbook"],
  ["React rendering", "Visual Guide to React Rendering"],
  ["Accessible forms", "Inclusive Components: Forms"],
  ["TypeScript narrowing", "Narrowing in TypeScript"],
  ["State machines", "Statecharts in UI Development"],
  ["Testing Library", "Common Testing Mistakes"],
  ["Optimistic UI", "Optimistic Updates in Practice"],
  ["Error boundaries", "Resilient React Interfaces"],
  ["Web performance", "Core Web Vitals Field Guide"],
  ["React Router", "Routing Patterns"],
  ["CSS container queries", "Container Queries Unleashed"],
  ["Server components", "RSC from First Principles"],
  ["Form validation", "Constraint Validation API"],
  ["Animation restraint", "Designing Interface Animation"],
] as const;

export const LOOSE_NODES: readonly TrailNode[] = LOOSE_STOP_DATA.map(
  ([name], index) => ({
    id: stopId(`loose-${index + 1}`),
    name,
    done: 0,
    total: 1,
  }),
);

const ITEMS_BY_STOP = new Map<StopId, readonly string[]>([
  ...LOOSE_STOP_DATA.map(
    ([, item], index) => [stopId(`loose-${index + 1}`), [item]] as const,
  ),
  [stopId("foundations"), ["React in 100 Seconds", "Thinking in React"]],
  [
    stopId("component-model"),
    ["Component Composition", "React.dev: Components"],
  ],
  [stopId("state-and-effects"), ["You Might Not Need an Effect"]],
  [stopId("testing"), ["Testing User Behaviour"]],
  [stopId("ship"), ["Build a Tiny App"]],
]);

export function fixtureFor(looseCount: LooseCount): {
  nodes: readonly TrailNode[];
  edges: readonly TrailEdge[];
  looseNodes: readonly TrailNode[];
} {
  const looseNodes = LOOSE_NODES.slice(0, looseCount);
  return {
    nodes: [...SEQUENCED_NODES, ...looseNodes],
    edges: SEQUENCED_EDGES,
    looseNodes,
  };
}

export function itemsFor(stopIdToRead: StopId): readonly string[] {
  return ITEMS_BY_STOP.get(stopIdToRead) ?? [];
}
