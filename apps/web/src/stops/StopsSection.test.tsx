import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  Status,
  Type,
  type Item,
  type ItemId,
  type Stop,
  type StopDetail,
  type StopId,
  type UserId,
} from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { StopsSection } from "./StopsSection";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const stopId = "00000000-0000-0000-0000-000000000002" as StopId;

const user: CurrentUser = {
  getToken: async () => null,
};

const stops: Stop[] = [
  { id: stopId, userId, name: "Learn CSS" },
  {
    id: "00000000-0000-0000-0000-000000000003" as StopId,
    userId,
    name: "Build the API",
  },
];

const item: Item = {
  id: "00000000-0000-0000-0000-000000000004" as ItemId,
  userId,
  title: "Responsive layouts",
  source: "https://example.com/layouts",
  type: Type.Article,
  status: Status.InProgress,
  targetDate: "2026-08-01",
  pastTarget: false,
  completedAt: null,
  labels: [],
};

const renderStops = (openStop: StopDetail | null) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/trails/trail-1/stops/${stopId}`]}>
      <StopsSection
        stops={stops}
        openStop={openStop}
        error={null}
        user={user}
        onStopOpened={() => undefined}
        onStopChanged={() => undefined}
        onItemChanged={() => undefined}
      />
    </MemoryRouter>,
  );

describe("Stops smoke coverage", () => {
  it("renders every Stop as an operable list choice", () => {
    const markup = renderStops(null);

    expect(markup).toContain("Learn CSS");
    expect(markup).toContain("Build the API");
    expect(markup.match(/<button/g)).toHaveLength(2);
  });

  it("renders a Stop detail with the Item facts shared by All", () => {
    const markup = renderStops({ ...stops[0], items: [item] });

    expect(markup).toContain("Responsive layouts");
    expect(markup).toContain("In progress");
    expect(markup).toContain("2026-08-01");
    expect(markup).toContain("https://example.com/layouts");
    expect(markup).toContain("Remove from stop");
    expect(markup).toContain("All stops");
  });
});
