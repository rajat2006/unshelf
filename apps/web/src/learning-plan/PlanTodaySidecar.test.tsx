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
  type DailyFocus,
  type DailyFocusId,
  type Item,
  type ItemId,
  type LearningPlan,
  type LearningPlanId,
  type LearningPlanView,
  type StageDetail,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import { addItemToToday, fetchLearningPlanStage, fetchToday } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { PlanTodaySidecar } from "./PlanTodaySidecar";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  addItemToToday: vi.fn(),
  fetchLearningPlanStage: vi.fn(),
  fetchToday: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const learningPlanId = "00000000-0000-0000-0000-000000000002" as LearningPlanId;
const stageId = "00000000-0000-0000-0000-000000000003" as StageId;
const originLearningPlanId =
  "00000000-0000-0000-0000-000000000006" as LearningPlanId;
const originStageId = "00000000-0000-0000-0000-000000000007" as StageId;
const item: Item = {
  id: "00000000-0000-0000-0000-000000000004" as ItemId,
  userId,
  title: "Practice query planning",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Course,
  status: Status.InProgress,
  statusMode: StatusMode.Manual,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
};
const learningPlan: LearningPlan = {
  id: learningPlanId,
  userId,
  name: "Practical databases",
  createdAt: "2026-08-14T00:00:00.000Z",
  archivedAt: null,
  done: 0,
  total: 1,
};
const topology: LearningPlanView = {
  nodes: [
    {
      kind: PlanNodeKind.Stage,
      id: stageId,
      name: "Query engines",
      done: 0,
      total: 1,
    },
  ],
  edges: [],
};
const stage: StageDetail = {
  id: stageId,
  userId,
  learningPlanId,
  name: "Query engines",
  items: [item],
};
const emptyFocus: DailyFocus = {
  id: "00000000-0000-0000-0000-000000000005" as DailyFocusId,
  userId,
  date: "2026-08-14",
  entries: [],
  done: 0,
  total: 0,
};
const user: CurrentUser = { getToken: async () => null };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Learning Plan Today sidecar", () => {
  it("keeps a pre-existing Today origin distinct from the current placement", async () => {
    vi.mocked(fetchToday).mockResolvedValue({
      ...emptyFocus,
      entries: [
        {
          item,
          origin: {
            learningPlan: {
              id: originLearningPlanId,
              name: "Compiler study",
            },
            stage: { id: originStageId, name: "Parsing" },
          },
          snapshot: { status: item.status, partPercentage: null },
        },
      ],
      total: 1,
    });
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);

    render(
      <MemoryRouter>
        <PlanTodaySidecar
          learningPlan={learningPlan}
          topology={topology}
          user={user}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Today from Compiler study · Parsing"),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Current placement: Query engines" }),
    ).toHaveAttribute("href", `/plans/${learningPlanId}/stages/${stageId}`);
  });

  it("adds a staged Item with its origin and communicates progress", async () => {
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchLearningPlanStage).mockResolvedValue(stage);
    let finishAdd!: (focus: DailyFocus) => void;
    vi.mocked(addItemToToday).mockReturnValue(
      new Promise((resolve) => {
        finishAdd = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <PlanTodaySidecar
          learningPlan={learningPlan}
          topology={topology}
          user={user}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Add ${item.title} to Today`,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: `Adding ${item.title} to Today…`,
      }),
    ).toBeDisabled();
    expect(addItemToToday).toHaveBeenCalledWith(user, item.id, {
      learningPlanId,
      stageId,
    });

    finishAdd({
      ...emptyFocus,
      entries: [
        {
          item,
          origin: {
            learningPlan: { id: learningPlanId, name: learningPlan.name },
            stage: { id: stageId, name: stage.name },
          },
          snapshot: { status: item.status, partPercentage: null },
        },
      ],
      done: 0,
      total: 1,
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `${item.title} is in Today` }),
      ).toBeDisabled(),
    );
  });
});
