// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  type LearningPlanId,
  type UserId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { fetchItem, fetchItemPlacements, fetchLabels } from "../api";
import { itemDetailRouteState } from "../items/item-route-state";
import { ItemSurface } from "./ItemSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchItem: vi.fn(),
  fetchItemPlacements: vi.fn(),
  fetchLabels: vi.fn(),
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
  LearningPlanSurface: () => <main>Learning Plan room</main>,
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const itemId = "00000000-0000-0000-0000-000000000002" as ItemId;
const planId = "00000000-0000-0000-0000-000000000003" as LearningPlanId;
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
) {
  vi.mocked(fetchItem).mockResolvedValue(item);
  vi.mocked(fetchLabels).mockResolvedValue([]);
  vi.mocked(fetchItemPlacements).mockResolvedValue({
    itemId,
    learningPlans: [],
  });

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
});
