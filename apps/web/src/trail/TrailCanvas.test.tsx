import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Stop, StopId, TrailView, UserId } from "@unshelf/shared";
import type { CurrentUser } from "../auth";
import { TrailCanvas } from "./TrailCanvas";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const a = "00000000-0000-0000-0000-00000000000a" as StopId;
const b = "00000000-0000-0000-0000-00000000000b" as StopId;

const user: CurrentUser = { getToken: async () => null };

const stops: Stop[] = [
  { id: a, userId, name: "Learn CSS" },
  { id: b, userId, name: "Build the API" },
];

const trail: TrailView = {
  edges: [{ userId, fromStopId: a, toStopId: b }],
};

const render = (readOnly: boolean, view: TrailView = trail, s = stops) =>
  renderToStaticMarkup(
    <TrailCanvas
      stops={s}
      trail={view}
      user={user}
      onTrailChanged={() => undefined}
      readOnly={readOnly}
    />,
  );

describe("Trail canvas smoke coverage", () => {
  it("shows each Stop as a node and, on desktop, authoring controls", () => {
    const markup = render(false);

    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
    // Desktop is authorable: link controls and per-edge remove, all tappable.
    expect(markup).toContain("Link →");
    expect(markup).toContain("Remove this link");
    expect(markup).toContain("min-height:44px");
    expect(markup).toContain("overflow-wrap:anywhere");
  });

  it("is read-only at phone width — no authoring controls", () => {
    const markup = render(true);

    // The nodes still render — the Trail is viewable on the phone (US 40)…
    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
    // …but nothing that would author it.
    expect(markup).not.toContain("Link →");
    expect(markup).not.toContain("Remove this link");
    expect(markup).toContain("read-only view");
  });

  it("prompts to create Stops when there are none to arrange", () => {
    const markup = render(false, { edges: [] }, []);

    expect(markup).toContain("No stops to arrange yet");
  });
});
