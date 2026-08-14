// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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
  type LabelId,
  type UserId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  fetchDailyFocusHistory,
  fetchDailyPlanning,
  fetchLearningPlans,
  fetchToday,
} from "../api";
import { CaptureProvider } from "../shell/CaptureProvider";
import { DailyFocusHistorySurface } from "./DailyFocusHistorySurface";
import { TodaySurface } from "./TodaySurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchDailyFocusHistory: vi.fn(),
  fetchDailyPlanning: vi.fn(),
  fetchLearningPlans: vi.fn(),
  fetchToday: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const item: Item = {
  id: "00000000-0000-0000-0000-000000000002" as ItemId,
  userId,
  title: "Distributed systems handbook",
  source: "https://example.com/systems",
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Book,
  status: Status.InProgress,
  statusMode: StatusMode.Automatic,
  targetDate: "2026-08-01",
  pastTarget: true,
  completedAt: null,
  labels: [
    {
      id: "00000000-0000-0000-0000-000000000003" as LabelId,
      userId,
      name: "Systems",
    },
  ],
  partPercentage: 50,
};
const focus: DailyFocus = {
  id: "00000000-0000-0000-0000-000000000004" as DailyFocusId,
  userId,
  date: "2026-08-14",
  entries: [
    {
      item,
      origin: null,
      snapshot: { status: item.status, partPercentage: item.partPercentage },
    },
  ],
  done: 0,
  total: 1,
};
const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function renderToday() {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={["/today"]}>
        <CaptureProvider>
          <TodaySurface />
        </CaptureProvider>
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

function renderHistory() {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={["/today/2026-08-13"]}>
        <DailyFocusHistorySurface selectedDate="2026-08-13" />
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Today room", () => {
  it("presents each current pick with the shared Item facts", async () => {
    vi.mocked(fetchToday).mockResolvedValue(focus);
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [],
      suggestions: [],
    });
    vi.mocked(fetchLearningPlans).mockResolvedValue([]);

    renderToday();

    const focusRegion = await screen.findByRole("region", {
      name: "Today's Daily Focus",
    });
    const itemLink = within(focusRegion).getByRole("link", {
      name: item.title,
    });
    const itemPresentation = within(itemLink.closest("article")!);
    expect(itemPresentation.getByText("Book")).toBeVisible();
    expect(itemPresentation.getByText("In progress")).toBeVisible();
    expect(itemPresentation.getByText("Systems")).toBeVisible();
    expect(itemPresentation.getByText("Target Aug 1, 2026")).toBeVisible();
    expect(itemPresentation.getByText("Past target")).toBeVisible();
    expect(itemPresentation.getByText("50% of Parts complete")).toBeVisible();
    expect(
      itemPresentation.getByText("https://example.com/systems"),
    ).toBeVisible();
  });

  it("presents explained suggestions even without a Learning Plan origin", async () => {
    vi.mocked(fetchToday).mockResolvedValue({
      ...focus,
      entries: [],
      done: 0,
      total: 0,
    });
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [],
      suggestions: [
        {
          item,
          signal: "recently_captured_uncommitted",
          explanation: "Recently captured and not in an active Learning Plan",
          origin: null,
        },
      ],
    });
    vi.mocked(fetchLearningPlans).mockResolvedValue([]);

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    const itemLink = within(suggestions).getByRole("link", {
      name: item.title,
    });
    const itemPresentation = within(itemLink.closest("article")!);
    expect(
      itemPresentation.getByText(
        "Recently captured and not in an active Learning Plan",
      ),
    ).toBeVisible();
    expect(itemPresentation.getByText("In progress")).toBeVisible();
    expect(
      itemPresentation.getByRole("button", {
        name: `Not today for ${item.title}`,
      }),
    ).toBeVisible();
  });
});

describe("Daily Focus history", () => {
  it("presents frozen day-end progress through the shared Item language", async () => {
    vi.mocked(fetchDailyFocusHistory).mockResolvedValue({
      ...focus,
      date: "2026-08-13",
      entries: [
        {
          item: {
            ...item,
            status: Status.Done,
            pastTarget: false,
            partPercentage: 100,
          },
          origin: null,
          snapshot: { status: Status.InProgress, partPercentage: 50 },
        },
      ],
    });

    renderHistory();

    const historyRegion = await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-13",
    });
    const itemLink = within(historyRegion).getByRole("link", {
      name: item.title,
    });
    const itemPresentation = within(itemLink.closest("article")!);
    expect(itemPresentation.getByText("Book")).toBeVisible();
    expect(itemPresentation.getByText("In progress")).toBeVisible();
    expect(itemPresentation.queryByText("Done")).not.toBeInTheDocument();
    expect(itemPresentation.getByText("50% of Parts complete")).toBeVisible();
    expect(
      itemPresentation.queryByText("100% of Parts complete"),
    ).not.toBeInTheDocument();
  });
});
