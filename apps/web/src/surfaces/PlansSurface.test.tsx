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
import type { LearningPlan, LearningPlanId, UserId } from "@unshelf/shared";
import type { ApplicationAuth } from "../application-auth/types";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import {
  archiveLearningPlan,
  createLearningPlan,
  fetchLearningPlans,
  restoreLearningPlan,
} from "../api";
import { PlansSurface } from "./PlansSurface";

vi.mock("../api", () => ({
  archiveLearningPlan: vi.fn(),
  createLearningPlan: vi.fn(),
  fetchLearningPlans: vi.fn(),
  restoreLearningPlan: vi.fn(),
}));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

const userId = "00000000-0000-0000-0000-000000000001" as UserId;

function learningPlan({
  id,
  name,
  done = 0,
  total = 0,
  archivedAt = null,
}: {
  id: string;
  name: string;
  done?: number;
  total?: number;
  archivedAt?: string | null;
}): LearningPlan {
  return {
    id: id as LearningPlanId,
    userId,
    name,
    createdAt: "2026-08-14T00:00:00.000Z",
    archivedAt,
    done,
    total,
  };
}

function renderPlans() {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={["/plans"]}>
        <PlansSurface />
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(archiveLearningPlan).mockReset();
  vi.mocked(createLearningPlan).mockReset();
  vi.mocked(fetchLearningPlans).mockReset();
  vi.mocked(restoreLearningPlan).mockReset();
});

describe("Plans room", () => {
  it("preserves and announces the room while Learning Plans load", () => {
    vi.mocked(fetchLearningPlans).mockReturnValue(new Promise(() => undefined));

    renderPlans();

    expect(
      screen.getByRole("region", { name: "Learning Plans" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("status", { name: "Loading Learning Plans" }),
    ).toBeVisible();
  });

  it("contains a loading failure in the room and recovers in place", async () => {
    vi.mocked(fetchLearningPlans)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockResolvedValueOnce([]);

    renderPlans();

    expect(
      await screen.findByText("Couldn't load your Learning Plans"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Learning Plans" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByText(/No Learning Plans yet/)).toBeVisible(),
    );
    expect(fetchLearningPlans).toHaveBeenCalledTimes(2);
  });

  it("explains a missing Learning Plan name beside the field", async () => {
    vi.mocked(fetchLearningPlans).mockResolvedValue([]);
    renderPlans();

    await screen.findByLabelText("Learning Plan name");
    fireEvent.click(
      screen.getByRole("button", { name: "Start a Learning Plan" }),
    );

    expect(screen.getByText("Enter a Learning Plan name.")).toBeVisible();
    expect(screen.getByLabelText("Learning Plan name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Learning Plan name")).toHaveFocus();
    expect(createLearningPlan).not.toHaveBeenCalled();
  });

  it("contains creation failure, preserves the name, and blocks a duplicate retry", async () => {
    vi.mocked(fetchLearningPlans).mockResolvedValue([]);
    vi.mocked(createLearningPlan)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockReturnValueOnce(new Promise(() => undefined));
    renderPlans();

    await screen.findByLabelText("Learning Plan name");
    const name = screen.getByLabelText("Learning Plan name");
    fireEvent.change(name, { target: { value: "Distributed systems" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Start a Learning Plan" }),
    );

    expect(
      await screen.findByText(
        "Couldn't create this Learning Plan. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(name).toHaveValue("Distributed systems");

    fireEvent.click(
      screen.getByRole("button", { name: "Start a Learning Plan" }),
    );
    const creating = await screen.findByRole("button", {
      name: "Creating Learning Plan…",
    });
    expect(creating).toBeDisabled();
    fireEvent.click(creating);
    expect(createLearningPlan).toHaveBeenCalledTimes(2);
  });

  it("creates a named Learning Plan and presents its derived progress at its stable URL", async () => {
    const created = learningPlan({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Distributed systems",
    });
    vi.mocked(fetchLearningPlans).mockResolvedValue([]);
    vi.mocked(createLearningPlan).mockResolvedValue(created);
    renderPlans();

    await screen.findByLabelText("Learning Plan name");
    const name = screen.getByLabelText("Learning Plan name");
    fireEvent.change(name, { target: { value: "  Distributed systems  " } });
    fireEvent.click(
      screen.getByRole("button", { name: "Start a Learning Plan" }),
    );

    const planLink = await screen.findByRole("link", {
      name: "Distributed systems",
    });
    expect(planLink).toHaveAttribute(
      "href",
      "/plans/11111111-1111-1111-1111-111111111111",
    );
    expect(
      screen.getByRole("progressbar", {
        name: "Distributed systems progress",
      }),
    ).toHaveAttribute("aria-valuetext", "No Items added yet");
    expect(name).toHaveValue("");
    expect(createLearningPlan).toHaveBeenCalledWith(auth.user, {
      name: "Distributed systems",
    });
  });

  it("contains archive failure on its plan and blocks a duplicate retry", async () => {
    const active = learningPlan({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Distributed systems",
      done: 2,
      total: 5,
    });
    vi.mocked(fetchLearningPlans).mockResolvedValue([active]);
    vi.mocked(archiveLearningPlan)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockReturnValueOnce(new Promise(() => undefined));
    renderPlans();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Archive Distributed systems",
      }),
    );

    expect(
      await screen.findByText(
        "Couldn't archive Distributed systems. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Distributed systems" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Archive Distributed systems" }),
    );
    const archiving = await screen.findByRole("button", {
      name: "Archiving Distributed systems…",
    });
    expect(archiving).toBeDisabled();
    fireEvent.click(archiving);
    expect(archiveLearningPlan).toHaveBeenCalledTimes(2);
  });

  it("separates active and archived commitments and completes both lifecycle actions", async () => {
    const active = learningPlan({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Distributed systems",
      done: 2,
      total: 5,
    });
    const archived = learningPlan({
      id: "22222222-2222-2222-2222-222222222222",
      name: "Compiler foundations",
      archivedAt: "2026-08-11T12:00:00.000Z",
    });
    vi.mocked(fetchLearningPlans).mockResolvedValue([active, archived]);
    vi.mocked(archiveLearningPlan).mockResolvedValue({
      ...active,
      archivedAt: "2026-08-14T10:00:00.000Z",
    });
    vi.mocked(restoreLearningPlan).mockResolvedValue({
      ...archived,
      archivedAt: null,
    });
    renderPlans();

    const activeGroup = await screen.findByRole("region", {
      name: "Active Learning Plans",
    });
    expect(
      within(activeGroup).getByRole("progressbar", {
        name: "Distributed systems progress",
      }),
    ).toHaveAttribute("aria-valuetext", "2 of 5 done");
    expect(
      screen.getByText("Archived Learning Plans are read-only until restored."),
    ).toBeVisible();

    fireEvent.click(
      within(activeGroup).getByRole("button", {
        name: "Archive Distributed systems",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Restore Distributed systems",
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Restore Compiler foundations" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Archive Compiler foundations",
      }),
    ).toBeVisible();
    expect(archiveLearningPlan).toHaveBeenCalledWith(auth.user, active.id);
    expect(restoreLearningPlan).toHaveBeenCalledWith(auth.user, archived.id);
  });
});
