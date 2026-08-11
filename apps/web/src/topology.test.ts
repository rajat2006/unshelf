import { describe, expect, it } from "vitest";
import {
  canConnect,
  deriveTopologyLayout,
  reaches,
  type TopologyEdge,
} from "./topology";

type OpaqueNodeId = string & { readonly opaqueNodeId: unique symbol };

const nodeId = (value: string) => value as OpaqueNodeId;
const edge = ({
  from,
  to,
}: {
  from: string;
  to: string;
}): TopologyEdge<OpaqueNodeId> => ({
  from: nodeId(from),
  to: nodeId(to),
});

const placementOf = (
  layout: ReturnType<typeof deriveTopologyLayout<OpaqueNodeId>>,
  id: string,
) => layout.byId.get(nodeId(id));

describe("topology layout", () => {
  it("lays a sequence out from left to right", () => {
    const layout = deriveTopologyLayout({
      nodeIds: [nodeId("a"), nodeId("b"), nodeId("c")],
      edges: [edge({ from: "a", to: "b" }), edge({ from: "b", to: "c" })],
    });

    expect(placementOf(layout, "a")).toEqual({ depth: 0, lane: 0 });
    expect(placementOf(layout, "b")).toEqual({ depth: 1, lane: 0 });
    expect(placementOf(layout, "c")).toEqual({ depth: 2, lane: 0 });
    expect(layout.depthCount).toBe(3);
  });

  it("places disconnected roots in deterministic separate lanes", () => {
    const layout = deriveTopologyLayout({
      nodeIds: [nodeId("first"), nodeId("second")],
      edges: [],
    });

    expect(placementOf(layout, "first")).toEqual({ depth: 0, lane: 0 });
    expect(placementOf(layout, "second")).toEqual({ depth: 0, lane: 1 });
    expect(layout.laneCount).toBe(2);
  });

  it("lays out a fork and rejoin by longest-path depth", () => {
    const layout = deriveTopologyLayout({
      nodeIds: [
        nodeId("root"),
        nodeId("left"),
        nodeId("right"),
        nodeId("joined"),
      ],
      edges: [
        edge({ from: "root", to: "left" }),
        edge({ from: "root", to: "right" }),
        edge({ from: "left", to: "joined" }),
        edge({ from: "right", to: "joined" }),
      ],
    });

    expect(placementOf(layout, "root")).toEqual({ depth: 0, lane: 0 });
    expect(placementOf(layout, "left")).toEqual({ depth: 1, lane: 0 });
    expect(placementOf(layout, "right")).toEqual({ depth: 1, lane: 1 });
    expect(placementOf(layout, "joined")).toEqual({ depth: 2, lane: 0 });
  });

  it("derives the same layout when nodes and edges arrive in another order", () => {
    const first = deriveTopologyLayout({
      nodeIds: [
        nodeId("root"),
        nodeId("left"),
        nodeId("right"),
        nodeId("joined"),
        nodeId("loose"),
      ],
      edges: [
        edge({ from: "root", to: "left" }),
        edge({ from: "root", to: "right" }),
        edge({ from: "left", to: "joined" }),
        edge({ from: "right", to: "joined" }),
      ],
    });
    const reordered = deriveTopologyLayout({
      nodeIds: [
        nodeId("joined"),
        nodeId("right"),
        nodeId("loose"),
        nodeId("left"),
        nodeId("root"),
      ],
      edges: [
        edge({ from: "right", to: "joined" }),
        edge({ from: "left", to: "joined" }),
        edge({ from: "root", to: "right" }),
        edge({ from: "root", to: "left" }),
      ],
    });
    const placements = (layout: typeof first) =>
      [...layout.byId].sort(([left], [right]) => left.localeCompare(right));

    expect(placements(reordered)).toEqual(placements(first));
    expect(reordered.depthCount).toBe(first.depthCount);
    expect(reordered.laneCount).toBe(first.laneCount);
  });
});

describe("topology validation", () => {
  const edges = [edge({ from: "a", to: "b" }), edge({ from: "b", to: "c" })];

  it("finds transitive reachability", () => {
    expect(reaches({ edges, from: nodeId("a"), to: nodeId("c") })).toBe(true);
    expect(reaches({ edges, from: nodeId("c"), to: nodeId("a") })).toBe(false);
  });

  it("rejects duplicate edges", () => {
    expect(canConnect({ edges, from: nodeId("a"), to: nodeId("b") })).toBe(
      false,
    );
  });

  it("rejects self-loops", () => {
    expect(canConnect({ edges, from: nodeId("a"), to: nodeId("a") })).toBe(
      false,
    );
  });

  it("rejects edges that would create a cycle", () => {
    expect(canConnect({ edges, from: nodeId("c"), to: nodeId("a") })).toBe(
      false,
    );
  });

  it("allows a fresh edge that rejoins two paths", () => {
    expect(canConnect({ edges, from: nodeId("a"), to: nodeId("c") })).toBe(
      true,
    );
  });
});
