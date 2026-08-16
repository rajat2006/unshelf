// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
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
import { stubMatchMedia } from "@/test-support/stub-match-media";

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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

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

function HistoryTestControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Test location">
        {location.pathname}
        {location.search}
      </output>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Forward
      </button>
    </>
  );
}

function renderHistory(
  initialEntries: Parameters<typeof MemoryRouter>[0]["initialEntries"] = [
    "/today/2026-08-13",
  ],
  initialIndex?: number,
) {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <HistoryTestControls />
        <Routes>
          <Route path="/today/:date" element={<DailyFocusHistorySurface />} />
        </Routes>
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

beforeEach(() => stubMatchMedia(true));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("Today room", () => {
  it("presents Daily Focus and Suggestions as one ledger beside deliberate Library search", async () => {
    vi.mocked(fetchToday).mockResolvedValue(focus);
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [replacement],
      suggestions: [
        {
          item: replacement,
          signal: "recent_capture",
          explanation: "Captured recently",
        },
      ],
    });

    renderToday();

    const ledger = await screen.findByRole("region", {
      name: "Today's daily ledger",
    });
    const focusRegion = within(ledger).getByRole("region", {
      name: "Today's Daily Focus",
    });
    const suggestions = within(ledger).getByRole("region", {
      name: "Suggestions",
    });
    expect(
      focusRegion.compareDocumentPosition(suggestions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "Library search" }),
    ).not.toBe(ledger);
  });

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
    const planningRetry = deferred<{
      searchResults: [];
      suggestions: [];
    }>();
    vi.mocked(fetchToday).mockResolvedValue(focus);
    vi.mocked(fetchDailyPlanning)
      .mockRejectedValueOnce(new Error("planning unavailable"))
      .mockReturnValueOnce(planningRetry.promise);

    renderToday();

    const focusRegion = await screen.findByRole("region", {
      name: "Today's Daily Focus",
    });
    expect(within(focusRegion).getByText(item.title)).toBeVisible();
    const planning = screen.getByRole("region", { name: "Daily Planning" });
    expect(
      within(planning).getByText("Couldn't update Daily Planning"),
    ).toBeVisible();
    const suggestions = screen.getByRole("region", { name: "Suggestions" });
    expect(
      within(suggestions).getByText("Suggestions unavailable"),
    ).toBeVisible();
    expect(
      within(suggestions).queryByText("No Suggestions are current for Today."),
    ).not.toBeInTheDocument();

    const retry = within(planning).getByRole("button", { name: "Retry" });
    fireEvent.click(retry);

    expect(retry).toBeDisabled();
    expect(retry).toHaveTextContent("Retrying…");
    planningRetry.resolve({ searchResults: [], suggestions: [] });

    await waitFor(() =>
      expect(
        within(planning).queryByText("Couldn't update Daily Planning"),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(suggestions).getByText("No Suggestions are current for Today."),
    ).toBeVisible();
    expect(fetchDailyPlanning).toHaveBeenCalledTimes(2);
  });

  it("contains a Daily Focus failure without discarding Daily Planning", async () => {
    vi.mocked(fetchToday)
      .mockRejectedValueOnce(new Error("focus unavailable"))
      .mockResolvedValueOnce(focus);
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

    fireEvent.click(within(focusRegion).getByRole("button", { name: "Retry" }));

    expect(await within(focusRegion).findByText(item.title)).toBeVisible();
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

  it("keeps a confirmed Add when planning replenishment fails", async () => {
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
      await screen.findByText("Couldn't update Daily Planning"),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: "Today's Daily Focus" }),
      ).getByText(item.title),
    ).toBeVisible();
    expect(within(suggestions).queryByText(item.title)).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", {
        name: `Added ${item.title} to Today`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Couldn't update Today. Your existing Daily Focus is unchanged; try again.",
      ),
    ).not.toBeInTheDocument();
  });

  it("announces a replenished Not today window and disables only that action", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const suppression = deferred<void>();
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
    vi.mocked(suppressDailyPlanningItem).mockReturnValue(suppression.promise);

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
    suppression.resolve();

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
    const searchRequest = deferred<typeof initialPlanning>();
    let queriedRequests = 0;
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning).mockImplementation((_user, query) => {
      if (!query.query) return Promise.resolve(initialPlanning);
      queriedRequests += 1;
      if (queriedRequests === 1) {
        return searchRequest.promise;
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

    searchRequest.resolve(initialPlanning);

    await waitFor(() =>
      expect(
        within(suggestions).queryByText(item.title),
      ).not.toBeInTheDocument(),
    );
    expect(within(suggestions).getByText(replacement.title)).toBeVisible();
  });

  it("keeps every concurrent action disabled until its own request finishes", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const suppressions = new Map<ItemId, Deferred<void>>();
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning).mockResolvedValue({
      searchResults: [],
      suggestions: [item, replacement].map((suggestionItem) => ({
        item: suggestionItem,
        signal: "recent_capture",
        explanation: "Captured recently",
      })),
    });
    vi.mocked(suppressDailyPlanningItem).mockImplementation((_user, itemId) => {
      const suppression = deferred<void>();
      suppressions.set(itemId, suppression);
      return suppression.promise;
    });

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

    suppressions.get(item.id)!.resolve();

    await waitFor(() => expect(firstAction).toBeEnabled());
    expect(secondAction).toBeDisabled();
    suppressions.get(replacement.id)!.resolve();
  });

  it("keeps an older mutation refresh from replacing the newest window", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const initialPlanning = {
      searchResults: [],
      suggestions: [item, replacement].map((suggestionItem) => ({
        item: suggestionItem,
        signal: "recent_capture" as const,
        explanation: "Captured recently",
      })),
    };
    const suppressions = new Map<ItemId, Deferred<void>>();
    const olderPlanning = deferred<typeof initialPlanning>();
    const newestPlanning = deferred<typeof initialPlanning>();
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning)
      .mockResolvedValueOnce(initialPlanning)
      .mockReturnValueOnce(olderPlanning.promise)
      .mockReturnValueOnce(newestPlanning.promise);
    vi.mocked(suppressDailyPlanningItem).mockImplementation((_user, itemId) => {
      const suppression = deferred<void>();
      suppressions.set(itemId, suppression);
      return suppression.promise;
    });

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    fireEvent.click(
      within(suggestions).getByRole("button", {
        name: `Not today for ${item.title}`,
      }),
    );
    fireEvent.click(
      within(suggestions).getByRole("button", {
        name: `Not today for ${replacement.title}`,
      }),
    );
    suppressions.get(item.id)!.resolve();
    await waitFor(() => expect(fetchDailyPlanning).toHaveBeenCalledTimes(2));
    suppressions.get(replacement.id)!.resolve();
    await waitFor(() => expect(fetchDailyPlanning).toHaveBeenCalledTimes(3));

    newestPlanning.resolve({ searchResults: [], suggestions: [] });
    expect(
      await within(suggestions).findByText(
        "No Suggestions are current for Today.",
      ),
    ).toBeVisible();
    olderPlanning.resolve(initialPlanning);

    await waitFor(() =>
      expect(
        within(suggestions).queryByText(item.title),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(suggestions).queryByText(replacement.title),
    ).not.toBeInTheDocument();
  });

  it("merges concurrent confirmed Adds without accepting stale planning", async () => {
    const emptyFocus = { ...focus, entries: [], done: 0, total: 0 };
    const focusWithBoth: DailyFocus = {
      ...focus,
      entries: [
        ...focus.entries,
        {
          item: replacement,
          origin: null,
          snapshot: {
            status: replacement.status,
            partPercentage: replacement.partPercentage,
          },
        },
      ],
      total: 2,
    };
    const initialPlanning = {
      searchResults: [],
      suggestions: [item, replacement].map((suggestionItem) => ({
        item: suggestionItem,
        signal: "recent_capture" as const,
        explanation: "Captured recently",
      })),
    };
    const adds = new Map<ItemId, Deferred<DailyFocus>>();
    const olderPlanning = deferred<typeof initialPlanning>();
    const newestPlanning = deferred<typeof initialPlanning>();
    vi.mocked(fetchToday).mockResolvedValue(emptyFocus);
    vi.mocked(fetchDailyPlanning)
      .mockResolvedValueOnce(initialPlanning)
      .mockReturnValueOnce(olderPlanning.promise)
      .mockReturnValueOnce(newestPlanning.promise);
    vi.mocked(addItemToToday).mockImplementation((_user, itemId) => {
      const add = deferred<DailyFocus>();
      adds.set(itemId, add);
      return add.promise;
    });

    renderToday();

    const suggestions = await screen.findByRole("region", {
      name: "Suggestions",
    });
    fireEvent.click(
      within(suggestions).getByRole("button", {
        name: `Add ${item.title} to Today`,
      }),
    );
    fireEvent.click(
      within(suggestions).getByRole("button", {
        name: `Add ${replacement.title} to Today`,
      }),
    );
    adds.get(item.id)!.resolve(focus);
    await waitFor(() => expect(fetchDailyPlanning).toHaveBeenCalledTimes(2));
    adds.get(replacement.id)!.resolve(focusWithBoth);
    await waitFor(() => expect(fetchDailyPlanning).toHaveBeenCalledTimes(3));

    const focusRegion = screen.getByRole("region", {
      name: "Today's Daily Focus",
    });
    expect(await within(focusRegion).findByText(item.title)).toBeVisible();
    expect(within(focusRegion).getByText(replacement.title)).toBeVisible();

    newestPlanning.resolve({ searchResults: [], suggestions: [] });
    olderPlanning.resolve(initialPlanning);

    expect(
      await screen.findByRole("status", {
        name: `Added ${replacement.title} to Today`,
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(suggestions).queryByText(item.title),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(suggestions).queryByText(replacement.title),
    ).not.toBeInTheDocument();
    expect(within(focusRegion).getByText(replacement.title)).toBeVisible();
    expect(within(focusRegion).getByText(item.title)).toBeVisible();
  });
});

describe("Daily Focus history", () => {
  it("stages a localized date until View date preserves the query", async () => {
    vi.mocked(fetchDailyFocusHistory).mockImplementation(
      async (_user, requestedDate) => ({ ...focus, date: requestedDate }),
    );

    renderHistory(["/today/2026-08-13?source=plan"]);

    await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-13",
    });

    const dateField = screen.getByLabelText("Daily Focus date");
    expect(dateField).toHaveAttribute("type", "text");
    expect(dateField).toHaveValue("08/13/2026");

    fireEvent.change(dateField, { target: { value: "08/12/2026" } });
    expect(fireEvent.keyDown(dateField, { key: "Enter" })).toBe(false);

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/today/2026-08-13?source=plan",
    );
    expect(
      screen.getByRole("region", { name: "Daily Focus for 2026-08-13" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "View date" }));

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/today/2026-08-12?source=plan",
    );
    await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-12",
    });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Daily Focus date")).toHaveValue(
        "08/13/2026",
      ),
    );
  });

  it("keeps an invalid draft visible and prevents submitting the older date", async () => {
    vi.mocked(fetchDailyFocusHistory).mockResolvedValue({
      ...focus,
      date: "2026-08-13",
    });

    renderHistory();

    const dateField = screen.getByLabelText("Daily Focus date");
    fireEvent.change(dateField, { target: { value: "08/1" } });
    fireEvent.keyDown(dateField, { key: "Enter" });

    expect(dateField).toHaveValue("08/1");
    expect(dateField).toHaveAccessibleDescription(
      "Complete the date in MM/DD/YYYY format.",
    );
    expect(screen.getByRole("button", { name: "View date" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("replaces an invalid draft when Back and Forward change the routed date", async () => {
    vi.mocked(fetchDailyFocusHistory).mockImplementation(
      async (_user, requestedDate) => ({ ...focus, date: requestedDate }),
    );

    renderHistory(
      ["/today/2026-08-12?source=plan", "/today/2026-08-13?source=plan"],
      1,
    );
    await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-13",
    });

    const dateField = screen.getByLabelText("Daily Focus date");
    fireEvent.change(dateField, { target: { value: "08/1" } });
    fireEvent.keyDown(dateField, { key: "Enter" });
    expect(screen.getByRole("button", { name: "View date" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Daily Focus date")).toHaveValue(
        "08/12/2026",
      ),
    );
    expect(screen.getByRole("button", { name: "View date" })).toBeEnabled();
    expect(screen.getByLabelText("Daily Focus date")).not.toHaveAttribute(
      "aria-invalid",
    );

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Daily Focus date")).toHaveValue(
        "08/13/2026",
      ),
    );
    await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-13",
    });
  });

  it("keeps browsing usable while loading and ignores an older route response", async () => {
    const older = deferred<DailyFocus>();
    const newest = deferred<DailyFocus>();
    vi.mocked(fetchDailyFocusHistory).mockImplementation(
      (_user, requestedDate) =>
        requestedDate === "2026-08-13" ? older.promise : newest.promise,
    );

    renderHistory();

    const dateField = screen.getByLabelText("Daily Focus date");
    fireEvent.change(dateField, { target: { value: "08/12/2026" } });
    fireEvent.keyDown(dateField, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "View date" }));

    await screen.findByRole("status", {
      name: "Loading Daily Focus history",
    });
    const liveDateField = screen.getByLabelText("Daily Focus date");
    expect(liveDateField).toBeEnabled();
    fireEvent.change(liveDateField, { target: { value: "08/11/2026" } });
    fireEvent.keyDown(liveDateField, { key: "Enter" });
    expect(liveDateField).toHaveValue("08/11/2026");

    newest.resolve({ ...focus, date: "2026-08-12" });
    await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-12",
    });

    await act(async () => {
      older.resolve({ ...focus, date: "2026-08-13" });
    });
    expect(
      screen.queryByRole("region", { name: "Daily Focus for 2026-08-13" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Daily Focus for 2026-08-12" }),
    ).toBeVisible();
  });

  it("retries an unavailable record without discarding the staged date", async () => {
    vi.mocked(fetchDailyFocusHistory)
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ ...focus, date: "2026-08-13" });

    renderHistory();

    expect(await screen.findByText("Daily Focus unavailable")).toBeVisible();
    const dateField = screen.getByLabelText("Daily Focus date");
    fireEvent.change(dateField, { target: { value: "08/12/2026" } });
    fireEvent.keyDown(dateField, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByRole("region", {
      name: "Daily Focus for 2026-08-13",
    });
    expect(dateField).toHaveValue("08/12/2026");
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/today/2026-08-13",
    );
  });

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
