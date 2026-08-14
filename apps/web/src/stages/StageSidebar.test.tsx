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
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import {
  Status,
  StatusMode,
  Type,
  type Item,
  type ItemId,
  type LearningPlanId,
  type StageDetail,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import {
  addItemToStage,
  fetchLearningPlanStage,
  fetchStageItemCandidates,
  reorderStageItems,
  updateStage,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { StageSidebar } from "./StageSidebar";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  addItemToStage: vi.fn(),
  fetchLearningPlanStage: vi.fn(),
  fetchStageItemCandidates: vi.fn(),
  reorderStageItems: vi.fn(),
  updateStage: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const learningPlanId = "00000000-0000-0000-0000-000000000002" as LearningPlanId;
const stageId = "00000000-0000-0000-0000-000000000003" as StageId;
const user: CurrentUser = { getToken: async () => null };

function item({
  id,
  title,
  status,
  source = null,
}: {
  id: string;
  title: string;
  status: Status;
  source?: string | null;
}): Item {
  return {
    id: id as ItemId,
    userId,
    title,
    source,
    createdAt: "2026-08-14T00:00:00.000Z",
    type: Type.Book,
    status,
    statusMode: StatusMode.Manual,
    targetDate: "2026-09-01",
    pastTarget: false,
    completedAt: status === Status.Done ? "2026-08-14T00:00:00.000Z" : null,
    labels: [],
    partPercentage: null,
  };
}

const stage: StageDetail = {
  id: stageId,
  userId,
  learningPlanId,
  name: "Foundations",
  items: [
    item({
      id: "00000000-0000-0000-0000-000000000004",
      title: "Read the handbook",
      status: Status.Done,
      source: "https://example.com/handbook",
    }),
    item({
      id: "00000000-0000-0000-0000-000000000005",
      title: "Practice the concepts",
      status: Status.InProgress,
    }),
  ],
};

function renderStageSidebar() {
  return render(
    <MemoryRouter
      initialEntries={[`/plans/${learningPlanId}/stages/${stageId}`]}
    >
      <StageSidebar
        stageId={stageId}
        learningPlanId={learningPlanId}
        user={user}
        onClose={vi.fn()}
        onLearningPlanChanged={vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Stage detail panel", () => {
  it("presents shared Item facts and progress derived from Item Statuses", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);

    renderStageSidebar();

    const panel = await screen.findByRole("complementary", {
      name: "Foundations details",
    });
    expect(
      within(panel).getByRole("progressbar", { name: "Foundations progress" }),
    ).toHaveAttribute("aria-valuetext", "1 of 2 Items done");
    const itemPresentation = within(
      within(panel)
        .getByRole("link", { name: "Read the handbook" })
        .closest("li")!,
    );
    expect(itemPresentation.getByText("Book")).toBeVisible();
    expect(
      itemPresentation.getByText("https://example.com/handbook"),
    ).toBeVisible();
    expect(
      itemPresentation.getByRole("combobox", {
        name: "Status for Read the handbook",
      }),
    ).toBeVisible();
    expect(
      itemPresentation.getByLabelText("Target date for Read the handbook"),
    ).toHaveValue("2026-09-01");
  });

  it("explains an empty Stage name beside the field", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);

    renderStageSidebar();

    const name = await screen.findByLabelText("Rename Stage");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Stage" }));

    expect(screen.getByText("Enter a Stage name.")).toBeVisible();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveFocus();
    expect(updateStage).not.toHaveBeenCalled();
  });

  it("distinguishes available and already-placed Library Items during intake", async () => {
    const available = item({
      id: "00000000-0000-0000-0000-000000000006",
      title: "Available book",
      status: Status.NotStarted,
    });
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([
      {
        id: available.id,
        title: available.title,
        type: available.type,
        kind: "available",
      },
      {
        id: "00000000-0000-0000-0000-000000000007" as ItemId,
        title: "Placed in another Stage",
        type: Type.Course,
        kind: "conflict",
        stage: {
          id: "00000000-0000-0000-0000-000000000008" as StageId,
          name: "Practice",
        },
      },
      {
        id: "00000000-0000-0000-0000-000000000009" as ItemId,
        title: "Placed directly",
        type: Type.Article,
        kind: "direct_conflict",
      },
    ]);
    vi.mocked(addItemToStage).mockResolvedValue({
      ...stage,
      items: [...stage.items, available],
    });

    renderStageSidebar();

    expect(await screen.findByText("In Practice")).toBeVisible();
    expect(
      screen.getByText("Placed directly on this Learning Plan"),
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "Move to this Stage" }),
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Add to this Stage" }));

    expect(await screen.findByText("Added to this Stage")).toBeVisible();
    expect(addItemToStage).toHaveBeenCalledWith(user, stageId, available.id);
  });

  it("contains an ordering failure without changing the visible local order", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);
    vi.mocked(reorderStageItems).mockRejectedValue(
      new Error("api responded 503"),
    );

    renderStageSidebar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Move Practice the concepts up",
      }),
    );

    await waitFor(() => expect(reorderStageItems).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reorder this Stage. Nothing changed; check your connection and try again.",
    );
    const visibleItems = within(
      screen.getByRole("list", { name: "Items in Foundations" }),
    ).getAllByRole("listitem");
    expect(visibleItems[0]).toHaveTextContent("Read the handbook");
    expect(visibleItems[1]).toHaveTextContent("Practice the concepts");
  });
});
