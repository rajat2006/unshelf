// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { fetchLearningPlan, fetchLearningPlanRecord } from "../api";
import { LearningPlanSurface } from "./LearningPlanSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchLearningPlan: vi.fn(),
  fetchLearningPlanRecord: vi.fn(),
}));
vi.mock("../learning-plan/usePhoneViewport", () => ({
  usePhoneViewport: () => false,
}));
vi.mock("../learning-plan/LearningPlanCanvas", () => ({
  LearningPlanCanvas: ({
    onOpenStage,
  }: {
    onOpenStage: (stageId: StageId) => void;
  }) => (
    <section aria-label="Learning Plan canvas">
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
  PlanLibraryDrawer: () => null,
}));
vi.mock("../learning-plan/PlanTodaySidecar", () => ({
  PlanTodaySidecar: () => null,
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
});
