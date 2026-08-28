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
  type ItemDetail,
  type ItemId,
  type ItemPlacementCatalog,
  type LearningPlanId,
  type StageId,
  type UserId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  fetchItem,
  fetchItemPlacements,
  fetchLabels,
  removeItemFromStage,
} from "../api";
import { itemDetailRouteState } from "../items/item-route-state";
import { ItemSurface } from "./ItemSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchItem: vi.fn(),
  fetchItemPlacements: vi.fn(),
  fetchLabels: vi.fn(),
  removeItemFromStage: vi.fn(),
}));
vi.mock("./LibrarySurface", () => ({
  LibrarySurface: () => <main>Library room</main>,
}));
vi.mock("./TodaySurface", () => ({
  TodaySurface: () => <main>Today room</main>,
}));
vi.mock("./DailyFocusHistorySurface", () => ({
  DailyFocusHistorySurface: () => <main>History room</main>,
}));
vi.mock("./LearningPlanSurface", () => ({
  LearningPlanSurface: ({
    onItemRemovedFromPlan,
  }: {
    onItemRemovedFromPlan?: (removedItemId: ItemId) => void;
  }) => (
    <main>
      Learning Plan room
      <button type="button" onClick={() => onItemRemovedFromPlan?.(itemId)}>
        Remove open Item from Learning Plan sidebar
      </button>
    </main>
  ),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const itemId = "00000000-0000-0000-0000-000000000002" as ItemId;
const planId = "00000000-0000-0000-0000-000000000003" as LearningPlanId;
const otherPlanId = "00000000-0000-0000-0000-000000000004" as LearningPlanId;
const stageId = "00000000-0000-0000-0000-000000000005" as StageId;
const item: ItemDetail = {
  id: itemId,
  userId,
  title: "Designing Data-Intensive Applications",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Book,
  status: Status.NotStarted,
  statusMode: StatusMode.Manual,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
  parts: [],
};
const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function LocationState() {
  const location = useLocation();
  return (
    <output aria-label="Test location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Forward
      </button>
    </>
  );
}

function renderItemSurface(
  initialEntries: Parameters<typeof MemoryRouter>[0]["initialEntries"],
  initialIndex?: number,
  placementCatalog: ItemPlacementCatalog = {
    itemId,
    learningPlans: [],
  },
) {
  vi.mocked(fetchItem).mockResolvedValue(item);
  vi.mocked(fetchLabels).mockResolvedValue([]);
  vi.mocked(fetchItemPlacements).mockResolvedValue(placementCatalog);

  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <HistoryControls />
        <Routes>
          <Route path="/items/:itemId" element={<ItemSurface />} />
          <Route path="*" element={<p>Destination room</p>} />
        </Routes>
        <LocationState />
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("canonical Item route", () => {
  it("presents routed detail before the retained room in single-column source order", async () => {
    renderItemSurface([
      {
        pathname: `/items/${itemId}`,
        state: itemDetailRouteState({
          pathname: "/library",
          search: "",
          hash: "",
        }),
      },
    ]);

    const detail = await screen.findByRole("complementary", {
      name: `${item.title} details`,
    });
    const room = screen.getByText("Library room");

    expect(
      detail.compareDocumentPosition(room) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ["Library room", "/library?q=systems"],
    ["Today room", "/today"],
    ["History room", "/today/2026-08-13"],
    [
      "Learning Plan room",
      `/plans/${planId}/stages/00000000-0000-0000-0000-000000000004`,
    ],
  ])("returns from %s to its retained location", async (room, destination) => {
    const [pathname, search = ""] = destination.split("?");
    renderItemSurface([
      {
        pathname: `/items/${itemId}`,
        state: itemDetailRouteState({
          pathname,
          search: search ? `?${search}` : "",
          hash: "",
        }),
      },
    ]);

    expect(await screen.findByText(room)).toBeVisible();
    expect(
      await screen.findByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      `/items/${itemId}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      destination,
    );
  });

  it("restores canonical detail through browser back and forward", async () => {
    const libraryLocation = {
      pathname: "/library",
      search: "?q=systems",
      hash: "",
    };
    renderItemSurface(
      [
        `${libraryLocation.pathname}${libraryLocation.search}`,
        {
          pathname: `/items/${itemId}`,
          state: itemDetailRouteState(libraryLocation),
        },
      ],
      1,
    );

    expect(
      await screen.findByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/library?q=systems",
    );

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(
      await screen.findByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      `/items/${itemId}`,
    );
  });

  it("closes details after removing the Item from the retained Learning Plan", async () => {
    const placement: ItemPlacementCatalog = {
      itemId,
      learningPlans: [
        {
          kind: "placed",
          learningPlan: { id: planId, name: "Database internals" },
          stage: { id: stageId, name: "Storage engines" },
        },
      ],
    };
    vi.mocked(removeItemFromStage).mockResolvedValue({
      id: stageId,
      userId,
      learningPlanId: planId,
      name: "Storage engines",
      items: [],
    });
    renderItemSurface(
      [
        {
          pathname: `/items/${itemId}`,
          state: itemDetailRouteState({
            pathname: `/plans/${planId}`,
            search: "",
            hash: "",
          }),
        },
      ],
      undefined,
      placement,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove from Database internals · Storage engines",
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Test location")).toHaveTextContent(
        `/plans/${planId}`,
      ),
    );
    expect(
      screen.queryByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).not.toBeInTheDocument();
  });

  it("closes details when the Learning Plan sidebar removes the open Item", async () => {
    renderItemSurface([
      {
        pathname: `/items/${itemId}`,
        state: itemDetailRouteState({
          pathname: `/plans/${planId}`,
          search: "",
          hash: "",
        }),
      },
    ]);

    expect(
      await screen.findByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove open Item from Learning Plan sidebar",
      }),
    );

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      `/plans/${planId}`,
    );
    expect(
      screen.queryByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps details open after removing the Item from another Learning Plan", async () => {
    const placement: ItemPlacementCatalog = {
      itemId,
      learningPlans: [
        {
          kind: "placed",
          learningPlan: { id: otherPlanId, name: "System design" },
          stage: { id: stageId, name: "Storage engines" },
        },
      ],
    };
    vi.mocked(removeItemFromStage).mockResolvedValue({
      id: stageId,
      userId,
      learningPlanId: otherPlanId,
      name: "Storage engines",
      items: [],
    });
    renderItemSurface(
      [
        {
          pathname: `/items/${itemId}`,
          state: itemDetailRouteState({
            pathname: `/plans/${planId}`,
            search: "",
            hash: "",
          }),
        },
      ],
      undefined,
      placement,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove from System design · Storage engines",
      }),
    );

    await waitFor(() => expect(removeItemFromStage).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("complementary", {
        name: `${item.title} details`,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      `/items/${itemId}`,
    );
  });
});
