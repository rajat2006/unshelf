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
  type DailyFocus,
  type DailyFocusId,
  type Item,
  type ItemId,
  type LearningPlan,
  type LearningPlanId,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import { fetchToday, removeItemFromToday } from "../api";
import type { CurrentUser } from "../application-auth/types";
import { PlanTodaySidecar } from "./PlanTodaySidecar";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchToday: vi.fn(),
  removeItemFromToday: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const learningPlanId = "00000000-0000-0000-0000-000000000002" as LearningPlanId;
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
          snapshot: {
            title: item.title,
            type: item.type,
            status: item.status,
            partPercentage: null,
          },
        },
      ],
      total: 1,
    });
    render(
      <MemoryRouter>
        <PlanTodaySidecar learningPlan={learningPlan} user={user} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("From Compiler study")).toBeVisible();
    expect(screen.queryByText("Parsing")).not.toBeInTheDocument();
  });

  it("keeps picking controls out of the current-picks rail", async () => {
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);

    render(
      <MemoryRouter>
        <PlanTodaySidecar learningPlan={learningPlan} user={user} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Nothing selected for Today yet."),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Add from this plan" }),
    ).not.toBeInTheDocument();
  });

  it("removes a current pick without changing its plan placement", async () => {
    vi.mocked(fetchToday).mockResolvedValue({
      ...emptyFocus,
      entries: [
        {
          item,
          origin: null,
          snapshot: {
            title: item.title,
            type: item.type,
            status: item.status,
            partPercentage: null,
          },
        },
      ],
      total: 1,
    });
    vi.mocked(removeItemFromToday).mockResolvedValue(emptyFocus);
    const onStudioChanged = vi.fn();

    render(
      <MemoryRouter>
        <PlanTodaySidecar
          learningPlan={learningPlan}
          user={user}
          onStudioChanged={onStudioChanged}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: `Remove ${item.title} from Today`,
      }),
    );

    await waitFor(() =>
      expect(removeItemFromToday).toHaveBeenCalledWith(
        user,
        emptyFocus.id,
        item.id,
      ),
    );
    expect(
      await screen.findByText("Nothing selected for Today yet."),
    ).toBeVisible();
    expect(onStudioChanged).toHaveBeenCalledOnce();
  });
});
