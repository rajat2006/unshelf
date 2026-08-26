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
  PlanNodeKind,
  Status,
  StatusMode,
  Type,
  type DirectItemNodeId,
  type DailyFocus,
  type DailyFocusId,
  type Item,
  type ItemId,
  type LearningPlanId,
  type LearningPlanView,
  type StageDetail,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import { addItemToToday, fetchLearningPlanStage, fetchToday } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { LearningPlanItems } from "./LearningPlanItems";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  addItemToToday: vi.fn(),
  fetchLearningPlanStage: vi.fn(),
  fetchToday: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const learningPlanId = "00000000-0000-0000-0000-000000000002" as LearningPlanId;
const stageId = "00000000-0000-0000-0000-000000000003" as StageId;
const item = (id: ItemId, title: string): Item => ({
  id,
  userId,
  title,
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
});
const stagedItem = item(
  "00000000-0000-0000-0000-000000000004" as ItemId,
  "Database Internals",
);
const directItem = item(
  "00000000-0000-0000-0000-000000000005" as ItemId,
  "Designing Data-Intensive Applications",
);
const topology: LearningPlanView = {
  nodes: [
    {
      kind: PlanNodeKind.Stage,
      id: stageId,
      name: "Storage",
      done: 0,
      total: 1,
    },
    {
      kind: PlanNodeKind.Item,
      id: "00000000-0000-0000-0000-000000000006" as DirectItemNodeId,
      item: directItem,
    },
  ],
  edges: [],
};
const stage: StageDetail = {
  id: stageId,
  userId,
  learningPlanId,
  name: "Storage",
  items: [stagedItem],
};
const user: CurrentUser = { getToken: async () => null };
const emptyFocus: DailyFocus = {
  id: "00000000-0000-0000-0000-000000000007" as DailyFocusId,
  userId,
  date: "2026-08-14",
  entries: [],
  done: 0,
  total: 0,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Learning Plan Item list", () => {
  it("renders staged and direct placements as a numbered vertical sequence", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);

    render(
      <MemoryRouter>
        <LearningPlanItems
          learningPlanId={learningPlanId}
          topology={topology}
          user={user}
        />
      </MemoryRouter>,
    );

    const list = await screen.findByRole("list", {
      name: "Learning Plan sequence",
    });
    expect(list.children).toHaveLength(2);
    expect(screen.getByText("Database Internals")).toBeVisible();
    expect(
      screen.getByText("Designing Data-Intensive Applications"),
    ).toBeVisible();
    expect(screen.getByText("Storage")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Pick Database Internals for Today",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Pick Designing Data-Intensive Applications for Today",
      }),
    ).toBeEnabled();
  });

  it("picks an Item from its plan row with durable Stage origin", async () => {
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(addItemToToday).mockResolvedValue({
      ...emptyFocus,
      entries: [
        {
          item: stagedItem,
          origin: {
            learningPlan: { id: learningPlanId, name: "Plan" },
            stage: { id: stageId, name: stage.name },
          },
          snapshot: {
            title: stagedItem.title,
            type: stagedItem.type,
            status: stagedItem.status,
            partPercentage: null,
          },
        },
      ],
      total: 1,
    });
    const onStudioChanged = vi.fn();

    render(
      <MemoryRouter>
        <LearningPlanItems
          learningPlanId={learningPlanId}
          topology={topology}
          user={user}
          onStudioChanged={onStudioChanged}
        />
      </MemoryRouter>,
    );

    const itemLink = await screen.findByRole("link", {
      name: stagedItem.title,
    });
    fireEvent.click(itemLink.closest("li")!.querySelector("button")!);

    await waitFor(() =>
      expect(addItemToToday).toHaveBeenCalledWith(user, stagedItem.id, {
        learningPlanId,
        stageId,
      }),
    );
    expect(onStudioChanged).toHaveBeenCalledOnce();
  });

  it("recovers a failed legacy placement read in place", async () => {
    vi.mocked(fetchLearningPlanStage)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(stage);
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);

    render(
      <MemoryRouter>
        <LearningPlanItems
          learningPlanId={learningPlanId}
          topology={topology}
          user={user}
        />
      </MemoryRouter>,
    );

    (await screen.findByRole("button", { name: "Retry" })).click();

    await waitFor(() =>
      expect(screen.getByText("Database Internals")).toBeVisible(),
    );
    expect(fetchLearningPlanStage).toHaveBeenCalledTimes(2);
  });
});
