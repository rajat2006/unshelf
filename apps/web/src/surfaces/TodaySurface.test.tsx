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
  addItemToToday,
  fetchDailyFocusHistory,
  fetchDailyPlanning,
  fetchToday,
  suppressDailyPlanningItem,
} from "../api";
import { CaptureProvider } from "../shell/CaptureProvider";
import { DailyFocusHistorySurface } from "./DailyFocusHistorySurface";
import { TodaySurface } from "./TodaySurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  addItemToToday: vi.fn(),
  fetchDailyFocusHistory: vi.fn(),
  fetchDailyPlanning: vi.fn(),
  fetchToday: vi.fn(),
  suppressDailyPlanningItem: vi.fn(),
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
const replacement: Item = {
  ...item,
  id: "00000000-0000-0000-0000-000000000005" as ItemId,
  title: "Practical storage engines",
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
  vi.resetAllMocks();
});

describe("Today room", () => {
  it("presents each current pick as a dated agenda row", async () => {
    vi.mocked(fetchToday).mockResolvedValue(focus);
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [],
      suggestions: [],
    });

    renderToday();

    const focusRegion = await screen.findByRole("region", {
      name: "Today's Daily Focus",
    });
    const itemLink = within(focusRegion).getByRole("link", {
      name: item.title,
    });
    const itemPresentation = within(itemLink.closest("article")!);
    expect(itemPresentation.getByText("01")).toBeVisible();
    expect(itemPresentation.getByText("From Library")).toBeVisible();
    expect(
      itemPresentation.getByRole("button", {
        name: `Mark ${item.title} done`,
      }),
    ).toHaveClass("min-h-11");
    expect(
      itemPresentation.getByRole("button", {
        name: `Remove ${item.title} from Today`,
      }),
    ).toBeVisible();
  });

  it("contains a planning failure beside an available Daily Focus and retries it", async () => {
    let resolvePlanning:
      ((planning: { searchResults: []; suggestions: [] }) => void) | undefined;
    vi.mocked(fetchToday).mockResolvedValue(focus);
    vi.mocked(fetchDailyPlanning)
      .mockRejectedValueOnce(new Error("planning unavailable"))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePlanning = resolve;
        }),
      );

    renderToday();

    const focusRegion = await screen.findByRole("region", {
      name: "Today's Daily Focus",
    });
    expect(within(focusRegion).getByText(item.title)).toBeVisible();
    const planning = screen.getByRole("region", { name: "Daily Planning" });
    expect(
      within(planning).getByText("Couldn't update Daily Planning"),
    ).toBeVisible();

    const retry = within(planning).getByRole("button", { name: "Retry" });
    fireEvent.click(retry);

    expect(retry).toBeDisabled();
    expect(retry).toHaveTextContent("Retrying…");
    resolvePlanning?.({ searchResults: [], suggestions: [] });

    await waitFor(() =>
      expect(
        within(planning).queryByText("Couldn't update Daily Planning"),
      ).not.toBeInTheDocument(),
    );
    expect(fetchDailyPlanning).toHaveBeenCalledTimes(2);
  });

  it("contains a Daily Focus failure without discarding Daily Planning", async () => {
    vi.mocked(fetchToday).mockRejectedValue(new Error("focus unavailable"));
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [item],
      suggestions: [],
    });

    renderToday();

    const focusRegion = await screen.findByRole("region", {
      name: "Today's Daily Focus",
    });
    expect(
      within(focusRegion).getByText("Couldn't load today's Daily Focus"),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Item search results" }),
    ).toHaveTextContent(item.title);
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
          signal: "recent_capture",
          explanation: "Captured recently",
        },
      ],
    });

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    const itemLink = within(suggestions).getByRole("link", {
      name: item.title,
    });
    const itemPresentation = within(itemLink.closest("article")!);
    expect(itemPresentation.getByText("Captured recently")).toBeVisible();
    expect(itemPresentation.getByText("In progress")).toBeVisible();
    expect(
      itemPresentation.getByRole("button", {
        name: `Not today for ${item.title}`,
      }),
    ).toBeVisible();
  });

  it("announces an Item added from planning", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [item],
      suggestions: [],
    });
    vi.mocked(addItemToToday).mockResolvedValue(focus);

    renderToday();

    const searchResults = await screen.findByRole("region", {
      name: "Item search results",
    });
    fireEvent.click(
      within(searchResults).getByRole("button", {
        name: `Add ${item.title} to Today`,
      }),
    );

    expect(
      await screen.findByRole("status", {
        name: `Added ${item.title} to Today`,
      }),
    ).toBeInTheDocument();
  });

  it("keeps confirmed state and reports a failed Add replenishment", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const planning = {
      searchResults: [item],
      suggestions: [
        {
          item,
          signal: "recent_capture" as const,
          explanation: "Captured recently",
        },
      ],
    };
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning)
      .mockResolvedValueOnce(planning)
      .mockRejectedValueOnce(new Error("replenishment unavailable"));
    vi.mocked(addItemToToday).mockResolvedValue(focus);

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    fireEvent.click(
      within(suggestions).getByRole("button", {
        name: `Add ${item.title} to Today`,
      }),
    );

    expect(
      await screen.findByText(
        "Couldn't update Today. Your existing Daily Focus is unchanged; try again.",
      ),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: "Today's Daily Focus" }),
      ).queryByText(item.title),
    ).not.toBeInTheDocument();
    expect(within(suggestions).getByText(item.title)).toBeVisible();
    expect(
      screen.queryByRole("status", {
        name: `Added ${item.title} to Today`,
      }),
    ).not.toBeInTheDocument();
  });

  it("announces a replenished Not today window and disables only that action", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    let finishSuppression: (() => void) | undefined;
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning)
      .mockResolvedValueOnce({
        searchResults: [],
        suggestions: [item, replacement].map((suggestionItem) => ({
          item: suggestionItem,
          signal: "recent_capture" as const,
          explanation: "Captured recently",
        })),
      })
      .mockResolvedValueOnce({
        searchResults: [],
        suggestions: [
          {
            item: replacement,
            signal: "recent_capture",
            explanation: "Captured recently",
          },
        ],
      });
    vi.mocked(suppressDailyPlanningItem).mockReturnValue(
      new Promise((resolve) => {
        finishSuppression = resolve;
      }),
    );

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    const notToday = within(suggestions).getByRole("button", {
      name: `Not today for ${item.title}`,
    });
    fireEvent.click(notToday);

    expect(notToday).toBeDisabled();
    expect(notToday).toHaveTextContent("Updating…");
    expect(
      within(suggestions).getByRole("button", {
        name: `Add ${replacement.title} to Today`,
      }),
    ).toBeEnabled();
    finishSuppression?.();

    expect(
      await screen.findByRole("status", {
        name: `Set Not today for ${item.title}`,
      }),
    ).toBeInTheDocument();
    expect(within(suggestions).queryByText(item.title)).not.toBeInTheDocument();
    expect(within(suggestions).getByText(replacement.title)).toBeVisible();
  });

  it("keeps a stale search response from overwriting a replenished window", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const initialPlanning = {
      searchResults: [],
      suggestions: [
        {
          item,
          signal: "recent_capture" as const,
          explanation: "Captured recently",
        },
      ],
    };
    let finishSearch: ((planning: typeof initialPlanning) => void) | undefined;
    let queriedRequests = 0;
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning).mockImplementation((_user, query) => {
      if (!query.query) return Promise.resolve(initialPlanning);
      queriedRequests += 1;
      if (queriedRequests === 1) {
        return new Promise((resolve) => {
          finishSearch = resolve;
        });
      }
      return Promise.resolve({
        searchResults: [],
        suggestions: [
          {
            item: replacement,
            signal: "recent_capture",
            explanation: "Captured recently",
          },
        ],
      });
    });
    vi.mocked(suppressDailyPlanningItem).mockResolvedValue();

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find an Item" }), {
      target: { value: "distributed" },
    });
    await waitFor(() => expect(fetchDailyPlanning).toHaveBeenCalledTimes(2));
    fireEvent.click(
      within(suggestions).getByRole("button", {
        name: `Not today for ${item.title}`,
      }),
    );
    expect(
      await screen.findByRole("status", {
        name: `Set Not today for ${item.title}`,
      }),
    ).toBeInTheDocument();
    expect(within(suggestions).getByText(replacement.title)).toBeVisible();

    finishSearch?.(initialPlanning);

    await waitFor(() =>
      expect(
        within(suggestions).queryByText(item.title),
      ).not.toBeInTheDocument(),
    );
    expect(within(suggestions).getByText(replacement.title)).toBeVisible();
  });

  it("keeps every concurrent action disabled until its own request finishes", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const finishSuppressions = new Map<ItemId, () => void>();
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [],
      suggestions: [item, replacement].map((suggestionItem) => ({
        item: suggestionItem,
        signal: "recent_capture",
        explanation: "Captured recently",
      })),
    });
    vi.mocked(suppressDailyPlanningItem).mockImplementation(
      (_user, itemId) =>
        new Promise((resolve) => {
          finishSuppressions.set(itemId, resolve);
        }),
    );

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    const firstAction = within(suggestions).getByRole("button", {
      name: `Not today for ${item.title}`,
    });
    const secondAction = within(suggestions).getByRole("button", {
      name: `Not today for ${replacement.title}`,
    });
    fireEvent.click(firstAction);
    fireEvent.click(secondAction);
    expect(firstAction).toBeDisabled();
    expect(secondAction).toBeDisabled();

    finishSuppressions.get(item.id)?.();

    await waitFor(() => expect(firstAction).toBeEnabled());
    expect(secondAction).toBeDisabled();
    finishSuppressions.get(replacement.id)?.();
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
