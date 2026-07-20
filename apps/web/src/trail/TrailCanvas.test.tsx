import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StopId, TrailId, TrailView, UserId } from "@unshelf/shared";
import type { CurrentUser } from "../application-auth";
import { TrailCanvas } from "./TrailCanvas";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const trailId = "00000000-0000-0000-0000-0000000000t1" as TrailId;
const a = "00000000-0000-0000-0000-00000000000a" as StopId;
const b = "00000000-0000-0000-0000-00000000000b" as StopId;

const user: CurrentUser = { getToken: async () => null };

// A → B, where A is fully done (its ground is "walked") and B is underway.
const trail: TrailView = {
  nodes: [
    { id: a, name: "Learn CSS", done: 4, total: 4 },
    { id: b, name: "Build the API", done: 1, total: 3 },
  ],
  edges: [{ userId, fromStopId: a, toStopId: b }],
};

const render = (readOnly: boolean, view: TrailView = trail) =>
  renderToStaticMarkup(
    <TrailCanvas
      trailId={trailId}
      trail={view}
      user={user}
      onTrailChanged={() => undefined}
      onRefresh={async () => undefined}
      onOpenStop={() => undefined}
      readOnly={readOnly}
    />,
  );

describe("Trail canvas — Quiet Focus", () => {
  it("draws each Stop as a waypoint with its name and progress", () => {
    const markup = render(false);

    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
    expect(markup).toContain("1/3"); // the underway ring shows its fraction
    expect(markup).toContain("You are here"); // B is the frontier
    expect(markup).toContain("<path"); // the trail is drawn as segments
    expect(markup).toContain("Completed stop");
    expect(markup).toContain("Solid path: walked");
    expect(markup).toContain("Dotted path: ahead");
    expect(markup).not.toContain("Compass");
    expect(markup).not.toContain("ochre");
    expect(markup).not.toContain("pine");
  });

  it("offers arranging controls on desktop", () => {
    const markup = render(false);

    // ＋ next, ⑃ fork, ⇢ link, ✕ remove-link — arranging, not data entry.
    expect(markup).toContain("Add the next stop in sequence");
    expect(markup).toContain("Fork a parallel branch");
    expect(markup).toContain("Remove this link");
  });

  it("is read-only at phone width — viewable, not authored", () => {
    const markup = render(true);

    expect(markup).toContain("Learn CSS"); // still drawn (US 40)…
    expect(markup).toContain("Build the API");
    expect(markup).not.toContain("Add the next stop in sequence"); // …not authored
    expect(markup).not.toContain("Remove this link");
  });

  it("invites the first Stop when the trail is empty (desktop only)", () => {
    expect(render(false, { nodes: [], edges: [] })).toContain("Start your trail");
    expect(render(true, { nodes: [], edges: [] })).not.toContain(
      "Start your trail",
    );
  });
});
