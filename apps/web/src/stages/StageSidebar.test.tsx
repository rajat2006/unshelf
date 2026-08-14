// @vitest-environment jsdom

import {
  cleanup,
  act,
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
  fetchStage,
  fetchStageItemCandidates,
  moveLearningPlanItem,
  removeItemFromStage,
  removeStage,
  reorderStageItems,
  updateStage,
} from "../api";
import type { CurrentUser } from "../application-auth/types";
import { StageSidebar } from "./StageSidebar";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  addItemToStage: vi.fn(),
  fetchLearningPlanStage: vi.fn(),
  fetchStage: vi.fn(),
  fetchStageItemCandidates: vi.fn(),
  moveLearningPlanItem: vi.fn(),
  removeItemFromStage: vi.fn(),
  removeStage: vi.fn(),
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

function renderStageSidebar({
  onClose = vi.fn(),
  onLearningPlanChanged = vi.fn().mockResolvedValue(undefined),
}: {
  onClose?: () => void;
  onLearningPlanChanged?: () => Promise<void>;
} = {}) {
  return render(
    <MemoryRouter
      initialEntries={[`/plans/${learningPlanId}/stages/${stageId}`]}
    >
      <StageSidebar
        stageId={stageId}
        learningPlanId={learningPlanId}
        user={user}
        onClose={onClose}
        onLearningPlanChanged={onLearningPlanChanged}
      />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Stage detail panel", () => {
  it("recovers from a contained Stage loading failure", async () => {
    vi.mocked(fetchLearningPlanStage)
      .mockRejectedValueOnce(new Error("api responded 503"))
      .mockResolvedValueOnce(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);

    renderStageSidebar();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this Stage",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("complementary", { name: "Foundations details" }),
    ).toBeVisible();
  });

  it("keeps a late response from a previous Stage out of the current route", async () => {
    const previous = deferred<StageDetail>();
    const current = deferred<StageDetail>();
    const currentStageId = "00000000-0000-0000-0000-000000000010" as StageId;
    const currentStage = {
      ...stage,
      id: currentStageId,
      name: "Practice",
    };
    vi.mocked(fetchLearningPlanStage).mockImplementation(
      (_user, _learningPlanId, requestedStageId) =>
        requestedStageId === stageId ? previous.promise : current.promise,
    );
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);

    const view = renderStageSidebar();
    view.rerender(
      <MemoryRouter
        initialEntries={[`/plans/${learningPlanId}/stages/${currentStageId}`]}
      >
        <StageSidebar
          stageId={currentStageId}
          learningPlanId={learningPlanId}
          user={user}
          onClose={vi.fn()}
          onLearningPlanChanged={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await act(async () => {
      current.resolve(currentStage);
      await current.promise;
    });
    expect(
      await screen.findByRole("complementary", { name: "Practice details" }),
    ).toBeVisible();
    await act(async () => {
      previous.resolve(stage);
      await previous.promise;
    });
    expect(
      screen.queryByRole("complementary", { name: "Foundations details" }),
    ).not.toBeInTheDocument();
  });

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

  it("preserves a proposed name when renaming fails", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);
    vi.mocked(updateStage).mockRejectedValue(new Error("api responded 503"));

    renderStageSidebar();

    const name = await screen.findByLabelText("Rename Stage");
    fireEvent.change(name, { target: { value: "Core ideas" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Stage" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't rename this Stage. Your entered name is still here",
    );
    expect(name).toHaveValue("Core ideas");
  });

  it("keeps a successful rename when the surrounding plan refresh fails", async () => {
    const renamed = { ...stage, name: "Core ideas" };
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);
    vi.mocked(updateStage).mockResolvedValue(renamed);

    renderStageSidebar({
      onLearningPlanChanged: vi
        .fn()
        .mockRejectedValue(new Error("refresh failed")),
    });
    const name = await screen.findByLabelText("Rename Stage");
    fireEvent.change(name, { target: { value: "Core ideas" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Stage" }));

    expect(
      await screen.findByRole("heading", { name: "Core ideas" }),
    ).toBeVisible();
    expect(
      screen.queryByText(/Couldn't rename this Stage/),
    ).not.toBeInTheDocument();
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
    vi.mocked(removeItemFromStage).mockResolvedValue(stage);

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

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(removeItemFromStage).toHaveBeenCalledWith(
        user,
        stageId,
        available.id,
      ),
    );
    expect(screen.queryByText("Added to this Stage")).not.toBeInTheDocument();
  });

  it("reports a successful move separately from a failed detail refresh", async () => {
    const candidateId = "00000000-0000-0000-0000-000000000007" as ItemId;
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([
      {
        id: candidateId,
        title: "Placed in another Stage",
        type: Type.Course,
        kind: "conflict",
        stage: {
          id: "00000000-0000-0000-0000-000000000008" as StageId,
          name: "Practice",
        },
      },
    ]);
    vi.mocked(moveLearningPlanItem).mockResolvedValue({ nodes: [], edges: [] });
    vi.mocked(fetchStage).mockRejectedValue(new Error("refresh failed"));

    renderStageSidebar();
    fireEvent.click(
      await screen.findByRole("button", { name: "Move to this Stage" }),
    );

    expect(moveLearningPlanItem).toHaveBeenCalledWith(
      user,
      learningPlanId,
      candidateId,
      stageId,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Item moved to this Stage. Couldn't refresh the Stage details.",
    );
    expect(screen.queryByText("Nothing changed")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry Stage refresh" }),
    ).toBeVisible();
  });

  it("shows a past-target fact once in the shared editable Item row", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue({
      ...stage,
      items: [{ ...stage.items[0], pastTarget: true }],
    });
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);

    renderStageSidebar();

    await screen.findByRole("link", { name: "Read the handbook" });
    expect(screen.getAllByText("Past target")).toHaveLength(1);
  });

  it("does not describe a successful direct move as a mutation failure", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);
    vi.mocked(moveLearningPlanItem).mockResolvedValue({ nodes: [], edges: [] });
    vi.mocked(fetchStage).mockRejectedValue(new Error("refresh failed"));

    renderStageSidebar();
    const move = (
      await screen.findAllByRole("button", { name: "Move directly in plan" })
    )[0];
    fireEvent.click(move);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Item moved directly in the plan. Couldn't refresh the Stage details.",
    );
    expect(move).toHaveTextContent("Moved directly");
    expect(move).toBeDisabled();
  });

  it("offers both Item dispositions when removing a Stage", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);
    vi.mocked(removeStage).mockResolvedValue({ nodes: [], edges: [] });

    renderStageSidebar();
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Stage" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove Items from plan" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Keep Items directly in plan" }),
    );

    await waitFor(() =>
      expect(removeStage).toHaveBeenCalledWith(user, stageId, "place_directly"),
    );
  });

  it("closes after removal even when the surrounding plan refresh fails", async () => {
    const onClose = vi.fn();
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchStageItemCandidates).mockResolvedValue([]);
    vi.mocked(removeStage).mockResolvedValue({ nodes: [], edges: [] });

    renderStageSidebar({
      onClose,
      onLearningPlanChanged: vi
        .fn()
        .mockRejectedValue(new Error("refresh failed")),
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Stage" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Items from plan" }),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(
      screen.queryByText(/Couldn't remove this Stage/),
    ).not.toBeInTheDocument();
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
