import { describe, expect, it } from "vitest";
import type { Stop, StopId, TrailEdge, UserId } from "@unshelf/shared";
import { canConnect, layout, reaches } from "./geometry";

const userId = "u" as UserId;
const id = (n: string) => n as StopId;
const stop = (n: string): Stop => ({ id: id(n), userId, name: n.toUpperCase() });
const edge = (from: string, to: string): TrailEdge => ({
  userId,
  fromStopId: id(from),
  toStopId: id(to),
});

/** A Stop's derived column, or undefined if absent. */
const depthOf = (
  placed: ReturnType<typeof layout>["placed"],
  n: string,
): number | undefined => placed.find((p) => p.stop.id === id(n))?.depth;

describe("layout — derived from topology, never stored", () => {
  it("lays a sequence out left→right by longest-path depth", () => {
    const { placed, depthCount } = layout(
      [stop("a"), stop("b"), stop("c")],
      [edge("a", "b"), edge("b", "c")],
    );

    expect(depthOf(placed, "a")).toBe(0);
    expect(depthOf(placed, "b")).toBe(1);
    expect(depthOf(placed, "c")).toBe(2);
    expect(depthCount).toBe(3);
  });

  it("puts a fork's branches in the same column on separate lanes", () => {
    const { placed, byId } = layout(
      [stop("root"), stop("left"), stop("right")],
      [edge("root", "left"), edge("root", "right")],
    );

    expect(depthOf(placed, "left")).toBe(1);
    expect(depthOf(placed, "right")).toBe(1);
    expect(byId.get(id("left"))!.lane).not.toBe(byId.get(id("right"))!.lane);
  });

  it("uses the longest path when a Stop joins two threads of unequal length", () => {
    // a→b→d and a→d: d must land past b, at the longer distance.
    const { placed } = layout(
      [stop("a"), stop("b"), stop("d")],
      [edge("a", "b"), edge("b", "d"), edge("a", "d")],
    );

    expect(depthOf(placed, "d")).toBe(2);
  });

  it("places an unconnected Stop as a root at depth 0", () => {
    const { placed } = layout([stop("lonely")], []);
    expect(depthOf(placed, "lonely")).toBe(0);
  });
});

describe("canConnect / reaches — the client mirror of the DAG rule", () => {
  const edges = [edge("a", "b"), edge("b", "c")];

  it("follows edges transitively", () => {
    expect(reaches(edges, id("a"), id("c"))).toBe(true);
    expect(reaches(edges, id("c"), id("a"))).toBe(false);
  });

  it("refuses a self-loop, a duplicate, and a back-edge", () => {
    expect(canConnect(edges, id("a"), id("a"))).toBe(false); // self
    expect(canConnect(edges, id("a"), id("b"))).toBe(false); // duplicate
    expect(canConnect(edges, id("c"), id("a"))).toBe(false); // would cycle
  });

  it("allows a fresh forward edge, including a rejoining diamond", () => {
    expect(canConnect(edges, id("a"), id("c"))).toBe(true);
  });
});
