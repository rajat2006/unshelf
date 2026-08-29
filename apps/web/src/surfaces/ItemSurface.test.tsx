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
import { useEffect, type ReactNode } from "react";
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
  deleteItem,
  fetchItem,
  fetchItemPlacements,
  fetchLabels,
  ItemRequestError,
  removeItemFromStage,
} from "../api";
import { ItemRecoveryNotice } from "../items/ItemRecoveryNotice";
import { itemDetailRouteState } from "../items/item-route-state";
import { ItemSurface } from "./ItemSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  deleteItem: vi.fn(),
  fetchItem: vi.fn(),
  fetchItemPlacements: vi.fn(),
  fetchLabels: vi.fn(),
  removeItemFromStage: vi.fn(),
}));
vi.mock("./LibrarySurface", () => ({
  LibrarySurface: backgroundRoom("Library room"),
}));
vi.mock("./TodaySurface", () => ({
  TodaySurface: backgroundRoom("Today room"),
}));
vi.mock("./DailyFocusHistorySurface", () => ({
  DailyFocusHistorySurface: backgroundRoom("History room"),
}));
vi.mock("./LearningPlanSurface", () => ({
  LearningPlanSurface: ({
    onItemRemovedFromPlan,
    onLoadSettled,
  }: {
    onItemRemovedFromPlan?: (removedItemId: ItemId) => void;
    onLoadSettled?: () => void;
  }) => (
    <BackgroundRoom name="Learning Plan room" onLoadSettled={onLoadSettled}>
      <button type="button" onClick={() => onItemRemovedFromPlan?.(itemId)}>
        Remove open Item from Learning Plan sidebar
      </button>
    </BackgroundRoom>
  ),
}));

let settleBackgroundAutomatically = true;
let backgroundSettlements: Array<() => void> = [];

function backgroundRoom(name: string) {
  return ({ onLoadSettled }: { onLoadSettled?: () => void }) => (
    <BackgroundRoom name={name} onLoadSettled={onLoadSettled} />
  );
}

function BackgroundRoom({
  name,
  onLoadSettled,
  children,
}: {
  name: string;
  onLoadSettled?: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    if (!onLoadSettled) return;
    backgroundSettlements.push(onLoadSettled);
    if (settleBackgroundAutomatically) onLoadSettled();
  }, [onLoadSettled]);
  return (
    <main>
      {name}
      {children}
    </main>
  );
}

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

function DestinationRoom() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <main>
      Destination room
      <ItemRecoveryNotice />
      <button
        type="button"
        onClick={() =>
          void navigate(`${location.pathname}${location.search}`, {
            replace: true,
          })
        }
      >
        Replace destination
      </button>
    </main>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function renderItemSurface(
  initialEntries: Parameters<typeof MemoryRouter>[0]["initialEntries"],
  initialIndex?: number,
  placementCatalog: ItemPlacementCatalog = {
    itemId,
    learningPlans: [],
  },
  itemRead: Promise<ItemDetail> = Promise.resolve(item),
) {
  vi.mocked(fetchItem).mockReturnValue(itemRead);
  vi.mocked(fetchLabels).mockResolvedValue([]);
  vi.mocked(fetchItemPlacements).mockResolvedValue(placementCatalog);

  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <HistoryControls />
        <Routes>
          <Route path="/items/:itemId" element={<ItemSurface />} />
          <Route path="*" element={<DestinationRoom />} />
        </Routes>
        <LocationState />
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  settleBackgroundAutomatically = true;
  backgroundSettlements = [];
});

describe("canonical Item route", () => {
  it.each(["Keep Item", "Close", "Escape", "outside click"])(
    "dismisses deletion confirmation with %s before submission",
    async (dismissal) => {
      renderItemSurface([`/items/${itemId}`]);

      fireEvent.click(
        await screen.findByRole("button", { name: "Delete Item" }),
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(item.title);
      expect(dialog).toHaveTextContent(
        "This permanently removes its Parts, Labels, Today entry, and Learning Plan placements. Past Daily Focus keeps an unlinked snapshot. If it came from Discover, it becomes available there again. This can’t be undone.",
      );

      if (dismissal === "Escape") {
        fireEvent.keyDown(document, { key: "Escape" });
      } else if (dismissal === "outside click") {
        await new Promise((resolve) => setTimeout(resolve, 0));
        fireEvent.pointerDown(
          document.querySelector('[data-slot="dialog-overlay"]')!,
          {
            button: 0,
            ctrlKey: false,
            pointerType: "mouse",
          },
        );
        fireEvent.click(
          document.querySelector('[data-slot="dialog-overlay"]')!,
        );
      } else {
        fireEvent.click(
          within(dialog).getByRole("button", { name: dismissal }),
        );
      }

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(deleteItem).not.toHaveBeenCalled();
    },
  );

  it("locks dismissal while pending and restores retry after an uncertain result", async () => {
    const pending = deferred<void>();
    vi.mocked(deleteItem)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce();
    renderItemSurface([`/items/${itemId}`]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Item" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Item" }),
    );

    expect(
      within(dialog).getByRole("button", { name: "Deleting…" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Keep Item" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!);
    expect(screen.getByRole("dialog")).toBeVisible();

    pending.reject(new ItemRequestError("temporary"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t confirm whether this Item was deleted. Try again.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Keep Item" }),
    ).toBeEnabled();
    expect(fetchItem).toHaveBeenCalledOnce();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Item" }),
    );
    await waitFor(() => expect(deleteItem).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["/library?q=systems&label=architecture", "Library room"],
    ["/today", "Today room"],
    ["/today/2026-08-13", "History room"],
    [`/plans/${planId}`, "Learning Plan room"],
  ])(
    "reconciles %s and replacement-navigates with one success notice",
    async (destination, room) => {
      vi.mocked(deleteItem).mockResolvedValue();
      const [pathname, search = ""] = destination.split("?");
      renderItemSurface(
        [
          destination,
          {
            pathname: `/items/${itemId}`,
            state: itemDetailRouteState({
              pathname,
              search: search ? `?${search}` : "",
              hash: "",
            }),
          },
        ],
        1,
      );

      expect(await screen.findByText(room)).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Delete Item" }));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Delete Item",
        }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Item deleted.",
      );
      expect(screen.getByLabelText("Test location")).toHaveTextContent(
        destination,
      );
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(screen.queryByText("Item deleted.")).not.toBeInTheDocument();
    },
  );

  it("waits for retained-background reconciliation before replacement navigation", async () => {
    settleBackgroundAutomatically = false;
    vi.mocked(deleteItem).mockResolvedValue();
    renderItemSurface([
      {
        pathname: `/items/${itemId}`,
        state: itemDetailRouteState({
          pathname: "/today",
          search: "",
          hash: "",
        }),
      },
    ]);

    await waitFor(() => expect(backgroundSettlements).toHaveLength(1));

    fireEvent.click(await screen.findByRole("button", { name: "Delete Item" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete Item",
      }),
    );

    await waitFor(() => expect(backgroundSettlements).toHaveLength(2));
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      `/items/${itemId}`,
    );

    await act(async () => backgroundSettlements[0]?.());
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      `/items/${itemId}`,
    );

    await act(async () => backgroundSettlements[1]?.());
    expect(await screen.findByRole("alert")).toHaveTextContent("Item deleted.");
    expect(screen.getByLabelText("Test location")).toHaveTextContent("/today");
  });

  it("returns a cold Item route to Library after confirmed deletion", async () => {
    vi.mocked(deleteItem).mockResolvedValue();
    renderItemSurface([`/items/${itemId}`]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Item" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete Item",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Item deleted.");
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/library",
    );
  });

  it("recovers neutrally at the retained destination when deletion finds no Item", async () => {
    vi.mocked(deleteItem).mockRejectedValue(new ItemRequestError("not_found"));
    renderItemSurface([
      {
        pathname: `/items/${itemId}`,
        state: itemDetailRouteState({
          pathname: "/today",
          search: "",
          hash: "",
        }),
      },
    ]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Item" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete Item",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That Item is no longer in your Library.",
    );
    expect(screen.getByLabelText("Test location")).toHaveTextContent("/today");
  });

  it("recovers neutrally when the canonical Item read is unavailable", async () => {
    renderItemSurface(
      [`/items/${itemId}`],
      undefined,
      undefined,
      Promise.reject(new ItemRequestError("not_found")),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That Item is no longer in your Library.",
    );
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/library",
    );
  });

  it("sends an unavailable canonical read to Library even with a retained room", async () => {
    renderItemSurface(
      [
        {
          pathname: `/items/${itemId}`,
          state: itemDetailRouteState({
            pathname: "/today",
            search: "",
            hash: "",
          }),
        },
      ],
      undefined,
      undefined,
      Promise.reject(new ItemRequestError("not_found")),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That Item is no longer in your Library.",
    );
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      "/library",
    );
  });

  it("does not retain a consumed notice through a later replacement visit", async () => {
    vi.mocked(deleteItem).mockResolvedValue();
    renderItemSurface([`/items/${itemId}`]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Item" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete Item",
      }),
    );
    expect(await screen.findByText("Item deleted.")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Replace destination" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Item deleted.")).not.toBeInTheDocument(),
    );
  });

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
