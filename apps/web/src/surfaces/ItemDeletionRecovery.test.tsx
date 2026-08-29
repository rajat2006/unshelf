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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  PlanNodeKind,
  Status,
  StatusMode,
  Type,
  type DailyFocus,
  type DailyFocusHistory,
  type DailyFocusId,
  type DirectItemNodeId,
  type Item,
  type ItemDetail,
  type ItemId,
  type LearningPlan,
  type LearningPlanId,
  type LearningPlanView,
  type UserId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  deleteItem,
  fetchAll,
  fetchDailyFocusHistory,
  fetchDailyPlanning,
  fetchItem,
  fetchItemPlacements,
  fetchLabels,
  fetchLearningPlan,
  fetchLearningPlanItemCandidates,
  fetchLearningPlanRecord,
  fetchToday,
} from "../api";
import { ItemRecoveryNotice } from "../items/ItemRecoveryNotice";
import { itemDetailRouteState } from "../items/item-route-state";
import { CaptureProvider } from "../shell/CaptureProvider";
import { stubMatchMedia } from "../test-support/stub-match-media";
import { DailyFocusHistorySurface } from "./DailyFocusHistorySurface";
import { ItemSurface } from "./ItemSurface";
import { LearningPlanSurface } from "./LearningPlanSurface";
import { LibrarySurface } from "./LibrarySurface";
import { TodaySurface } from "./TodaySurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  deleteItem: vi.fn(),
  fetchAll: vi.fn(),
  fetchDailyFocusHistory: vi.fn(),
  fetchDailyPlanning: vi.fn(),
  fetchItem: vi.fn(),
  fetchItemPlacements: vi.fn(),
  fetchLabels: vi.fn(),
  fetchLearningPlan: vi.fn(),
  fetchLearningPlanItemCandidates: vi.fn(),
  fetchLearningPlanRecord: vi.fn(),
  fetchToday: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const itemId = "00000000-0000-0000-0000-000000000002" as ItemId;
const planId = "00000000-0000-0000-0000-000000000003" as LearningPlanId;
const focusId = "00000000-0000-0000-0000-000000000004" as DailyFocusId;
const directNodeId = "00000000-0000-0000-0000-000000000005" as DirectItemNodeId;
const date = "2026-08-13";
const item: Item = {
  id: itemId,
  userId,
  title: "Distributed systems handbook",
  source: "https://example.com/systems",
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Book,
  status: Status.InProgress,
  statusMode: StatusMode.Automatic,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
};
const itemDetail: ItemDetail = { ...item, parts: [] };
const snapshot = {
  title: item.title,
  type: item.type,
  status: item.status,
  partPercentage: item.partPercentage,
};
const focus = (entries: DailyFocus["entries"]): DailyFocus => ({
  id: focusId,
  userId,
  date: "2026-08-14",
  entries,
  done: 0,
  total: entries.length,
});
const history = (deleted: boolean): DailyFocusHistory => ({
  id: focusId,
  userId,
  date,
  entries: deleted
    ? [{ kind: "deleted", snapshot }]
    : [{ kind: "available", itemId, origin: null, snapshot }],
  done: 0,
  total: 1,
});
const planRecord: LearningPlan = {
  id: planId,
  userId,
  name: "Distributed systems",
  createdAt: "2026-08-14T00:00:00.000Z",
  archivedAt: null,
  done: 0,
  total: 1,
};
const plan = (deleted: boolean): LearningPlanView => ({
  nodes: deleted ? [] : [{ kind: PlanNodeKind.Item, id: directNodeId, item }],
  edges: [],
});
const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};
let itemDeleted = false;

function routeState(pathname: string) {
  return itemDetailRouteState({ pathname, search: "", hash: "" });
}

function renderRecovery(destination: string) {
  render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter
        initialEntries={[
          destination,
          { pathname: `/items/${itemId}`, state: routeState(destination) },
        ]}
        initialIndex={1}
      >
        <CaptureProvider>
          <ItemRecoveryNotice />
          <Routes>
            <Route path="/items/:itemId" element={<ItemSurface />} />
            <Route
              path="/library"
              element={<LibrarySurface labelFilterEnabled />}
            />
            <Route path="/today" element={<TodaySurface />} />
            <Route path="/today/:date" element={<DailyFocusHistorySurface />} />
            <Route
              path="/plans/:learningPlanId"
              element={<LearningPlanSurface />}
            />
          </Routes>
        </CaptureProvider>
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

async function deleteOpenItem() {
  fireEvent.click(await screen.findByRole("button", { name: "Delete Item" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete Item",
    }),
  );
  expect(await screen.findByText("Item deleted.")).toBeVisible();
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  itemDeleted = false;
  stubMatchMedia(false);
  vi.mocked(deleteItem).mockImplementation(async () => {
    itemDeleted = true;
  });
  vi.mocked(fetchItem).mockResolvedValue(itemDetail);
  vi.mocked(fetchItemPlacements).mockResolvedValue({
    itemId,
    learningPlans: [],
  });
  vi.mocked(fetchLabels).mockResolvedValue([]);
  vi.mocked(fetchAll).mockImplementation(async () =>
    itemDeleted ? [] : [item],
  );
  vi.mocked(fetchToday).mockImplementation(async () =>
    focus(itemDeleted ? [] : [{ item, origin: null, snapshot }]),
  );
  vi.mocked(fetchDailyPlanning).mockResolvedValue({
    searchResults: [],
    suggestions: [],
  });
  vi.mocked(fetchDailyFocusHistory).mockImplementation(async () =>
    history(itemDeleted),
  );
  vi.mocked(fetchLearningPlanRecord).mockImplementation(async () => ({
    ...planRecord,
    total: itemDeleted ? 0 : 1,
  }));
  vi.mocked(fetchLearningPlan).mockImplementation(async () =>
    plan(itemDeleted),
  );
  vi.mocked(fetchLearningPlanItemCandidates).mockImplementation(async () =>
    itemDeleted ? [] : [{ kind: "direct", item }],
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("routed Item deletion recovery", () => {
  it("reloads the real Library without the deleted Item", async () => {
    renderRecovery("/library");
    expect(await screen.findByRole("link", { name: item.title })).toBeVisible();

    await deleteOpenItem();

    expect(await screen.findByText("Nothing captured yet")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: item.title }),
    ).not.toBeInTheDocument();
    expect(fetchAll).toHaveBeenCalledTimes(3);
  });

  it("reloads the real Today room without the deleted Item", async () => {
    renderRecovery("/today");
    expect(await screen.findByRole("link", { name: item.title })).toBeVisible();

    await deleteOpenItem();

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: item.title }),
      ).not.toBeInTheDocument(),
    );
    expect(vi.mocked(fetchToday).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("reloads real Daily Focus history as an inert deleted snapshot", async () => {
    renderRecovery(`/today/${date}`);
    expect(await screen.findByRole("link", { name: item.title })).toBeVisible();

    await deleteOpenItem();

    const deletedTitle = await screen.findByText(item.title);
    const presentation = within(deletedTitle.closest("article")!);
    expect(presentation.getByText("Item deleted")).toBeVisible();
    expect(presentation.queryByRole("link")).not.toBeInTheDocument();
    expect(presentation.queryByRole("button")).not.toBeInTheDocument();
    expect(fetchDailyFocusHistory).toHaveBeenCalledTimes(3);
  });

  it("reloads the real Learning Plan without its direct placement", async () => {
    renderRecovery(`/plans/${planId}`);
    expect(
      (await screen.findAllByRole("link", { name: item.title })).length,
    ).toBeGreaterThan(0);

    await deleteOpenItem();

    expect(
      await screen.findByText(
        "No Items in this Learning Plan yet. Add one from the Library.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: item.title }),
    ).not.toBeInTheDocument();
    expect(fetchLearningPlan).toHaveBeenCalledTimes(3);
  });
});
