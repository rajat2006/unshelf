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
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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
vi.mock("../learning-plan/LearningPlanCanvas", () => ({
  LearningPlanCanvas: ({
    onOpenStage,
    readOnly,
  }: {
    onOpenStage: (stageId: StageId) => void;
    readOnly: boolean;
  }) => (
    <section
      aria-label="Learning Plan canvas"
      data-authoring={readOnly ? "withheld" : "available"}
    >
      <button
        type="button"
        onClick={() =>
          onOpenStage("00000000-0000-0000-0000-000000000003" as StageId)
        }
      >
        Open Foundations
      </button>
    </section>
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
vi.mock("../stages/StageSidebar", () => ({
  StageSidebar: ({ onClose }: { onClose: () => void }) => (
    <aside aria-label="Foundations details">
      <button type="button" onClick={onClose}>
        Close details
      </button>
    </aside>
  ),
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

function LocationPath() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  phoneViewport = false;
});

describe("Learning Plan Stage route", () => {
  it("opens and closes Stage detail while retaining its Learning Plan context", async () => {
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
            <Route
              path="/plans/:learningPlanId/stages/:stageId"
              element={<LearningPlanSurface />}
            />
          </Routes>
          <LocationPath />
        </MemoryRouter>
      </ApplicationAuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Distributed systems" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open Foundations" }));

    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      `/plans/${learningPlanId}/stages/${stageId}`,
    );
    expect(
      screen.getByRole("heading", { name: "Distributed systems" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Foundations details" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      `/plans/${learningPlanId}`,
    );
    expect(
      screen.getByRole("heading", { name: "Distributed systems" }),
    ).toBeVisible();
  });

  it("keeps the plan and Today available beside Stage detail on a phone", async () => {
    phoneViewport = true;
    vi.mocked(fetchLearningPlanRecord).mockResolvedValue(record);
    vi.mocked(fetchLearningPlan).mockResolvedValue(topology);

    render(
      <ApplicationAuthProvider auth={auth}>
        <MemoryRouter
          initialEntries={[`/plans/${learningPlanId}/stages/${stageId}`]}
        >
          <Routes>
            <Route
              path="/plans/:learningPlanId/stages/:stageId"
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
      screen.getByRole("region", { name: "Learning Plan canvas" }),
    ).toHaveAttribute("data-authoring", "withheld");
    expect(
      screen.getByRole("complementary", { name: "Today sidecar" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Foundations details" }),
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
      screen.getByRole("region", { name: "Learning Plan canvas" }),
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
      screen.getByRole("region", { name: "Learning Plan canvas" }),
    ).toHaveAttribute("data-authoring", "withheld");
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
      screen.getByRole("region", { name: "Learning Plan canvas" }),
    ).toBeVisible();
  });
});
