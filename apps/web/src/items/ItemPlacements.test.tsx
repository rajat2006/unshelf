// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type {
  ItemId,
  ItemPlacementCatalog,
  LearningPlanId,
  StageId,
} from "@unshelf/shared";
import {
  addItemToStage,
  fetchItemPlacements,
  removeItemFromStage,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { ItemPlacements } from "./ItemPlacements";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  addItemToStage: vi.fn(),
  fetchItemPlacements: vi.fn(),
  removeItemFromStage: vi.fn(),
}));

const itemId = "00000000-0000-0000-0000-000000000001" as ItemId;
const planId = "00000000-0000-0000-0000-000000000002" as LearningPlanId;
const stageId = "00000000-0000-0000-0000-000000000003" as StageId;
const user: CurrentUser = { getToken: async () => null };
const catalog: ItemPlacementCatalog = {
  itemId,
  learningPlans: [
    {
      kind: "placed",
      learningPlan: { id: planId, name: "Database internals" },
      stage: { id: stageId, name: "Storage engines" },
    },
    {
      kind: "available",
      learningPlan: {
        id: "00000000-0000-0000-0000-000000000004" as LearningPlanId,
        name: "System design",
      },
      stages: [
        {
          id: "00000000-0000-0000-0000-000000000005" as StageId,
          name: "Storage engines",
        },
      ],
    },
    {
      kind: "archived",
      learningPlan: {
        id: "00000000-0000-0000-0000-000000000006" as LearningPlanId,
        name: "Old curriculum",
      },
      placement: null,
    },
  ],
};

function renderPlacements() {
  return render(
    <MemoryRouter>
      <ItemPlacements
        itemId={itemId}
        itemTitle="Database systems"
        user={user}
      />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Learning Plan placements", () => {
  it("distinguishes current, available, and archived Learning Plans", async () => {
    vi.mocked(fetchItemPlacements).mockResolvedValue(catalog);
    renderPlacements();

    const current = await screen.findByRole("list", {
      name: "Current Learning Plan placements",
    });
    expect(current).toHaveTextContent("Database internals");
    expect(current).toHaveTextContent("Storage engines");

    fireEvent.click(
      screen.getByRole("button", { name: "Add to Learning Plan" }),
    );
    expect(screen.getByText("Already in Storage engines")).toBeVisible();
    expect(screen.getByText("Archived · read-only")).toBeVisible();

    const plan = screen.getByRole("listitem", { name: "System design" });
    fireEvent.click(within(plan).getByRole("button", { name: "New Stage" }));
    fireEvent.change(screen.getByLabelText("Stage name on System design"), {
      target: { value: "Storage engines" },
    });
    expect(
      screen.getByText(
        "A Stage on this Learning Plan already has this name. You can still create another.",
      ),
    ).toBeVisible();
  });

  it("contains a placement conflict and offers recovery in place", async () => {
    vi.mocked(fetchItemPlacements).mockResolvedValue(catalog);
    vi.mocked(removeItemFromStage).mockRejectedValue(
      new Error("api responded 409"),
    );
    renderPlacements();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove from Database internals · Storage engines",
      }),
    );

    await waitFor(() => expect(removeItemFromStage).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t update this placement.",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByText("Database internals")).toBeVisible();
  });

  it("does not retry a placement already completed during reconciliation", async () => {
    const availablePlan = catalog.learningPlans[1];
    if (availablePlan.kind !== "available") throw new Error("Invalid fixture");
    const reconciled: ItemPlacementCatalog = {
      itemId,
      learningPlans: [
        {
          kind: "placed",
          learningPlan: availablePlan.learningPlan,
          stage: availablePlan.stages[0],
        },
      ],
    };
    vi.mocked(fetchItemPlacements)
      .mockResolvedValueOnce({ itemId, learningPlans: [availablePlan] })
      .mockResolvedValueOnce(reconciled);
    vi.mocked(addItemToStage).mockRejectedValue(new Error("api responded 409"));
    renderPlacements();

    fireEvent.click(
      await screen.findByRole("button", { name: "Add to Learning Plan" }),
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: "Add to System design" }),
    );
    fireEvent.click(
      await screen.findByRole("option", { name: "Storage engines" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t update this placement.",
    );
    expect(screen.getByText("Already in Storage engines")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });
});
