import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  Status,
  StatusMode,
  Type,
  type Item,
  type ItemId,
  type LabelId,
  type UserId,
} from "@unshelf/shared";
import { ItemSummary } from "./ItemSummary";

const userId = "00000000-0000-0000-0000-000000000001" as UserId;

const item: Item = {
  id: "00000000-0000-0000-0000-000000000002" as ItemId,
  userId,
  title: "Designing Data-Intensive Applications",
  source: "https://example.com/library/ddia",
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Book,
  status: Status.InProgress,
  statusMode: StatusMode.Automatic,
  targetDate: "2026-08-01",
  pastTarget: true,
  completedAt: null,
  labels: [
    {
      id: "00000000-0000-0000-0000-000000000003" as LabelId,
      userId,
      name: "Systems",
    },
  ],
  partPercentage: 75,
};

describe("Item summary", () => {
  it("presents the recognizable shared Item facts and canonical detail link", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/library?q=design"]}>
        <ItemSummary item={item} />
      </MemoryRouter>,
    );

    expect(markup).toContain("Designing Data-Intensive Applications");
    expect(markup).toContain(
      'href="/items/00000000-0000-0000-0000-000000000002"',
    );
    expect(markup).toContain("Book");
    expect(markup).toContain("https://example.com/library/ddia");
    expect(markup).toContain("Systems");
    expect(markup).toContain("In progress");
    expect(markup).toContain("Target Aug 1, 2026");
    expect(markup).toContain("Past target");
    expect(markup).toContain("75% of Parts complete");
  });

  it("names absent optional facts without inventing progress", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ItemSummary
          item={{
            ...item,
            source: null,
            status: Status.NotStarted,
            statusMode: StatusMode.Manual,
            targetDate: null,
            pastTarget: false,
            labels: [],
            partPercentage: null,
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("No Source");
    expect(markup).toContain("No Labels");
    expect(markup).toContain("Not started");
    expect(markup).toContain("No Target date");
    expect(markup).not.toContain("Parts complete");
  });
});
