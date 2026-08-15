// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import {
  Status,
  StatusMode,
  Type,
  type Item,
  type ItemId,
  type LearningPlanId,
  type LearningPlanView,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import { fetchLearningPlanItemCandidates, placeItemDirectly } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { CaptureContext } from "../shell/capture-context";
import { PlanLibraryDrawer } from "./PlanLibraryDrawer";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchLearningPlanItemCandidates: vi.fn(),
  placeItemDirectly: vi.fn(),
  removeDirectItemFromLearningPlan: vi.fn(),
}));

const learningPlanId = "00000000-0000-0000-0000-000000000001" as LearningPlanId;
const user: CurrentUser = { getToken: async () => null };
const item: Item = {
  id: "00000000-0000-0000-0000-000000000002" as ItemId,
  userId: "00000000-0000-0000-0000-000000000003" as UserId,
  title: "Database Internals",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Book,
  status: Status.NotStarted,
  statusMode: StatusMode.Manual,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
};

function renderDrawer(openCapture = vi.fn()) {
  return {
    openCapture,
    ...render(
      <MemoryRouter>
        <CaptureContext.Provider
          value={{ open: openCapture, subscribe: () => () => undefined }}
        >
          <PlanLibraryDrawer
            learningPlanId={learningPlanId}
            user={user}
            onLearningPlanChanged={vi.fn()}
          />
        </CaptureContext.Provider>
      </MemoryRouter>,
    ),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Learning Plan Library placement drawer", () => {
  it("recovers a failed Library search in place", async () => {
    vi.mocked(fetchLearningPlanItemCandidates)
      .mockRejectedValueOnce(new Error("api unavailable"))
      .mockResolvedValue([]);
    renderDrawer();

    expect(
      await screen.findByText(
        "Couldn’t search your Library. The Learning Plan is still available.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No matching Items.")).toBeVisible();
    expect(fetchLearningPlanItemCandidates).toHaveBeenCalledTimes(2);
  });

  it("keeps an empty placement search inside the existing Library boundary", async () => {
    vi.mocked(fetchLearningPlanItemCandidates).mockResolvedValue([]);
    const { openCapture } = renderDrawer();

    expect(await screen.findByText("No matching Items.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Capture an Item" }),
    ).not.toBeInTheDocument();
    expect(openCapture).not.toHaveBeenCalled();
  });

  it("communicates direct placement progress and publishes the changed plan", async () => {
    vi.mocked(fetchLearningPlanItemCandidates).mockResolvedValue([
      { kind: "available", item },
    ]);
    let finishPlacement!: (topology: LearningPlanView) => void;
    vi.mocked(placeItemDirectly).mockReturnValue(
      new Promise((resolve) => {
        finishPlacement = resolve;
      }),
    );
    const onLearningPlanChanged = vi.fn();
    render(
      <MemoryRouter>
        <CaptureContext.Provider
          value={{ open: vi.fn(), subscribe: () => () => undefined }}
        >
          <PlanLibraryDrawer
            learningPlanId={learningPlanId}
            user={user}
            onLearningPlanChanged={onLearningPlanChanged}
          />
        </CaptureContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Plan Database Internals",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Placing Database Internals…",
      }),
    ).toBeDisabled();

    const changed: LearningPlanView = { nodes: [], edges: [] };
    finishPlacement(changed);

    await waitFor(() =>
      expect(onLearningPlanChanged).toHaveBeenCalledWith(changed),
    );
  });

  it("keeps legacy Stage placements visually folded into the plan", async () => {
    const stageId = "00000000-0000-0000-0000-000000000004" as StageId;
    vi.mocked(fetchLearningPlanItemCandidates).mockResolvedValue([
      {
        kind: "stage",
        item,
        stage: { id: stageId, name: "Storage engines" },
      },
    ]);
    renderDrawer();

    expect(
      await screen.findByRole("link", { name: "Database Internals" }),
    ).toHaveAttribute("href", `/items/${item.id}`);
    expect(screen.getByText("Placed")).toBeVisible();
    expect(screen.queryByText("Storage engines")).not.toBeInTheDocument();
  });
});
