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
import { MemoryRouter, Route, Routes } from "react-router";
import {
  PlanNodeKind,
  type LearningPlan,
  type LearningPlanId,
  type LearningPlanView,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  fetchLearningPlan,
  fetchLearningPlanRecord,
  updateLearningPlan,
} from "../api";
import { LearningPlanSurface } from "./LearningPlanSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchLearningPlan: vi.fn(),
  fetchLearningPlanRecord: vi.fn(),
  updateLearningPlan: vi.fn(),
}));
let phoneViewport = false;
vi.mock("../learning-plan/usePhoneViewport", () => ({
  usePhoneViewport: () => phoneViewport,
}));
vi.mock("../learning-plan/LearningPlanItems", () => ({
  LearningPlanItems: () => (
    <section aria-label="Learning Plan Items">Items</section>
  ),
}));
vi.mock("../learning-plan/PlanLibraryDrawer", () => ({
  PlanLibraryDrawer: ({
    onLearningPlanChanged,
  }: {
    onLearningPlanChanged: (learningPlan: LearningPlanView) => void;
  }) => (
    <aside aria-label="Library placement drawer">
      Library
      <button
        type="button"
        onClick={() => onLearningPlanChanged({ nodes: [], edges: [] })}
      >
        Place sample Item
      </button>
    </aside>
  ),
}));
vi.mock("../learning-plan/PlanTodaySidecar", () => ({
  PlanTodaySidecar: () => <aside aria-label="Today sidecar">Today</aside>,
}));
const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const learningPlanId = "00000000-0000-0000-0000-000000000002" as LearningPlanId;
const stageId = "00000000-0000-0000-0000-000000000003" as StageId;
const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};
const record: LearningPlan = {
  id: learningPlanId,
  userId,
  name: "Distributed systems",
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
      name: "Foundations",
      done: 0,
      total: 1,
    },
  ],
  edges: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  phoneViewport = false;
});

describe("Learning Plan route", () => {
  it("keeps the plan and Today consultable on a phone", async () => {
    phoneViewport = true;
    vi.mocked(fetchLearningPlanRecord).mockResolvedValue(record);
    vi.mocked(fetchLearningPlan).mockResolvedValue(topology);

    render(
      <ApplicationAuthProvider auth={auth}>
        <MemoryRouter initialEntries={[`/plans/${learningPlanId}`]}>
          <Routes>
            <Route
              path="/plans/:learningPlanId"
              element={<LearningPlanSurface />}
            />
          </Routes>
        </MemoryRouter>
      </ApplicationAuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Distributed systems" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Learning Plan Items" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Today sidecar" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("complementary", {
        name: "Library placement drawer",
      }),
    ).not.toBeInTheDocument();
  });

  it("contains a rename failure without discarding the studio", async () => {
    vi.mocked(fetchLearningPlanRecord).mockResolvedValue(record);
    vi.mocked(fetchLearningPlan).mockResolvedValue(topology);
    let rejectRename!: (reason: Error) => void;
    vi.mocked(updateLearningPlan).mockReturnValue(
      new Promise((_, reject) => {
        rejectRename = reject;
      }),
    );

    render(
      <ApplicationAuthProvider auth={auth}>
        <MemoryRouter initialEntries={[`/plans/${learningPlanId}`]}>
          <Routes>
            <Route
              path="/plans/:learningPlanId"
              element={<LearningPlanSurface />}
            />
          </Routes>
        </MemoryRouter>
      </ApplicationAuthProvider>,
    );

    fireEvent.click(await screen.findByText("Rename"));
    const name = screen.getByRole("textbox", {
      name: "Learning Plan name",
    });
    fireEvent.change(name, { target: { value: "Database foundations" } });
    fireEvent.submit(name.closest("form")!);

    expect(screen.getByRole("button", { name: "Renaming…" })).toBeDisabled();
    rejectRename(new Error("api responded 503"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t rename this Learning Plan",
    );
    expect(name).toHaveValue("Database foundations");
    expect(
      screen.getByRole("region", { name: "Learning Plan Items" }),
    ).toBeVisible();
    await waitFor(() => expect(updateLearningPlan).toHaveBeenCalledOnce());
  });

  it("refreshes derived progress after a Library placement", async () => {
    vi.mocked(fetchLearningPlanRecord)
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, done: 1, total: 2 });
    vi.mocked(fetchLearningPlan).mockResolvedValue(topology);

    render(
      <ApplicationAuthProvider auth={auth}>
        <MemoryRouter initialEntries={[`/plans/${learningPlanId}`]}>
          <Routes>
            <Route
              path="/plans/:learningPlanId"
              element={<LearningPlanSurface />}
            />
          </Routes>
        </MemoryRouter>
      </ApplicationAuthProvider>,
    );

    await screen.findByRole("heading", { name: "Distributed systems" });
    fireEvent.click(screen.getByRole("button", { name: "Place sample Item" }));

    expect(await screen.findByText("1 of 2 Items done")).toBeVisible();
    expect(fetchLearningPlanRecord).toHaveBeenCalledTimes(2);
  });

  it("keeps an archived plan consultable while withholding authoring", async () => {
    vi.mocked(fetchLearningPlanRecord).mockResolvedValue({
      ...record,
      archivedAt: "2026-08-14T09:00:00.000Z",
    });
    vi.mocked(fetchLearningPlan).mockResolvedValue(topology);

    render(
      <ApplicationAuthProvider auth={auth}>
        <MemoryRouter initialEntries={[`/plans/${learningPlanId}`]}>
          <Routes>
            <Route
              path="/plans/:learningPlanId"
              element={<LearningPlanSurface />}
            />
          </Routes>
        </MemoryRouter>
      </ApplicationAuthProvider>,
    );

    expect(await screen.findByText("Archived · read-only")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Learning Plan Items" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Today sidecar" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("complementary", {
        name: "Library placement drawer",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Rename")).not.toBeInTheDocument();
  });

  it("recovers the studio after its initial request fails", async () => {
    vi.mocked(fetchLearningPlanRecord)
      .mockRejectedValueOnce(new Error("api unavailable"))
      .mockResolvedValue(record);
    vi.mocked(fetchLearningPlan).mockResolvedValue(topology);

    render(
      <ApplicationAuthProvider auth={auth}>
        <MemoryRouter initialEntries={[`/plans/${learningPlanId}`]}>
          <Routes>
            <Route
              path="/plans/:learningPlanId"
              element={<LearningPlanSurface />}
            />
          </Routes>
        </MemoryRouter>
      </ApplicationAuthProvider>,
    );

    expect(
      await screen.findByText("Couldn’t load this Learning Plan"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("heading", { name: "Distributed systems" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Learning Plan Items" }),
    ).toBeVisible();
  });
});
