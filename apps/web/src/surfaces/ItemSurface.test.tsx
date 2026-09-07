// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  createMemoryRouter,
  RouterProvider,
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
import {
  confirmChapters,
  fetchItem,
  fetchLabels,
  researchChapters,
} from "../api";
import { itemDetailRouteState } from "../items/item-route-state";
import { ItemSurface } from "./ItemSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  confirmChapters: vi.fn(),
  fetchItem: vi.fn(),
  fetchLabels: vi.fn(),
  researchChapters: vi.fn(),
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
  vi.unstubAllGlobals();
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

  it("omits Learning Plan placement controls from Item details", async () => {
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
    expect(
      screen.queryByRole("heading", { name: "Learning Plan placements" }),
    ).not.toBeInTheDocument();
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
});

it.each([false, true])(
  "guards edited chapters on navigation and starts fresh on return (saving: %s)",
  async (saving) => {
    // JSDOM's signal is from a different realm than Node's Request. This router
    // has no loaders; omit that unused signal at the platform Request boundary.
    vi.stubGlobal(
      "Request",
      class extends Request {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
          super(input, { ...init, signal: undefined });
        }
      },
    );
    vi.mocked(fetchItem).mockResolvedValue(item);
    vi.mocked(fetchLabels).mockResolvedValue([]);
    vi.mocked(researchChapters).mockResolvedValue({
      ok: true,
      preview: {
        kind: "suggestions",
        reason: null,
        title: "Matched",
        author: null,
        edition: null,
        coverage: "unknown",
        chapters: [{ title: "Chapter 1", evidence: ["toc"] }],
        sources: [
          { id: "toc", title: "Contents", url: "https://example.com/contents" },
        ],
      },
    });
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <ApplicationAuthProvider auth={auth}>
              <HistoryControls />
              <Routes>
                <Route path="/items/:itemId" element={<ItemSurface />} />
                <Route path="*" element={<p>Destination room</p>} />
              </Routes>
            </ApplicationAuthProvider>
          ),
        },
      ],
      { initialEntries: ["/library", `/items/${itemId}`] },
    );
    render(<RouterProvider router={router} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Find chapters" }),
    );
    const editor = await screen.findByRole("textbox", {
      name: "Chapter preview",
    });
    fireEvent.change(editor, { target: { value: "My edit" } });
    let finishSave!: (item: ItemDetail) => void;
    if (saving) {
      vi.mocked(confirmChapters).mockReturnValue(
        new Promise((resolve) => {
          finishSave = resolve;
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Add chapters" }));
    }
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("alertdialog")).toBeVisible();
    if (saving)
      expect(screen.getByRole("alertdialog")).toHaveTextContent(
        /may still save/i,
      );
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(editor).toHaveValue("My edit");
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard edits" }),
    );
    expect(await screen.findByText("Destination room")).toBeVisible();
    if (saving) {
      // Completion after unmount must not update the next open flow.
      finishSave(item);
      expect(confirmChapters).toHaveBeenCalledTimes(1);
    }
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      await screen.findByRole("button", { name: "Find chapters" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("textbox", { name: "Chapter preview" }),
    ).not.toBeInTheDocument();
    expect(researchChapters).toHaveBeenCalledTimes(1);
  },
);
