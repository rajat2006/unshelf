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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import {
  Status,
  StatusMode,
  Type,
  type Item,
  type ItemId,
  type Label,
  type LabelId,
  type UserId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { fetchAll, fetchLabels } from "../api";
import { CaptureProvider } from "../shell/CaptureProvider";
import { LibrarySurface } from "./LibrarySurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchAll: vi.fn(),
  fetchLabels: vi.fn(),
}));

const userId = "00000000-0000-0000-0000-000000000001" as UserId;
const label: Label = {
  id: "00000000-0000-0000-0000-000000000002" as LabelId,
  userId,
  name: "Systems",
};
const item: Item = {
  id: "00000000-0000-0000-0000-000000000003" as ItemId,
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
  labels: [label],
  partPercentage: 50,
};

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function renderLibrary(initialEntry = "/library", labelFilterEnabled = true) {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CaptureProvider>
          <LibrarySurface labelFilterEnabled={labelFilterEnabled} />
          <LocationState />
        </CaptureProvider>
      </MemoryRouter>
    </ApplicationAuthProvider>,
  );
}

function LocationState() {
  const location = useLocation();
  return (
    <output aria-label="Test location">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        state: location.state as unknown,
      })}
    </output>
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.mocked(fetchAll).mockReset();
  vi.mocked(fetchLabels).mockReset();
});

describe("Library room", () => {
  it("preserves and announces the room while its Item rows load", () => {
    vi.mocked(fetchAll).mockReturnValue(new Promise(() => undefined));
    vi.mocked(fetchLabels).mockReturnValue(new Promise(() => undefined));

    renderLibrary();

    expect(screen.getByRole("region", { name: "Library" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("status", { name: "Loading Library" }),
    ).toBeVisible();
  });

  it("contains a loading failure in the room and recovers in place", async () => {
    vi.mocked(fetchAll)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockResolvedValueOnce([item]);
    vi.mocked(fetchLabels).mockResolvedValue([label]);

    renderLibrary();

    expect(await screen.findByText("Couldn't load your Library")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Library" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Distributed systems handbook" }),
      ).toBeVisible(),
    );
    expect(fetchAll).toHaveBeenCalledTimes(2);
  });

  it("offers global Capture from the empty room", async () => {
    vi.mocked(fetchAll).mockResolvedValue([]);
    vi.mocked(fetchLabels).mockResolvedValue([]);

    renderLibrary();

    expect(await screen.findByText("Nothing captured yet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Capture your first Item" }),
    ).toBeVisible();
  });

  it("retrieves recognizable Item facts through the URL-owned search view", async () => {
    vi.mocked(fetchAll).mockResolvedValue([item]);
    vi.mocked(fetchLabels).mockResolvedValue([label]);

    renderLibrary("/library?q=systems");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Library Items" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search Library" }),
    ).toHaveValue("systems");
    const itemName = screen.getByRole("button", {
      name: "Distributed systems handbook",
    });
    const editDetails = screen.getByRole("link", {
      name: "Edit Distributed systems handbook",
    });
    expect(editDetails).toHaveAttribute(
      "href",
      "/items/00000000-0000-0000-0000-000000000003",
    );
    const itemPresentation = within(itemName.closest("article")!);
    expect(itemPresentation.getByText("Book")).toBeVisible();
    expect(itemPresentation.getByText("Systems")).toBeVisible();
    expect(itemPresentation.getByText("In progress")).toBeVisible();
    const detail = within(
      screen.getByRole("complementary", {
        name: "Edit Distributed systems handbook",
      }),
    );
    expect(detail.getByText("https://example.com/systems")).toBeVisible();
    expect(detail.getByText("Past target")).toBeVisible();
    expect(
      detail.getByRole("progressbar", {
        name: "50% of Parts complete",
      }),
    ).toBeVisible();
    expect(screen.queryByText(/Variant D/)).not.toBeInTheDocument();

    fireEvent.click(itemName);
    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      '"pathname":"/library","search":"?q=systems"',
    );
  });

  it("previews an Item from its name and opens full details from Edit details", async () => {
    const otherItem = {
      ...item,
      id: "00000000-0000-0000-0000-000000000004" as ItemId,
      title: "Reliable distributed systems",
    };
    vi.mocked(fetchAll).mockResolvedValue([item, otherItem]);
    vi.mocked(fetchLabels).mockResolvedValue([label]);

    renderLibrary();

    const itemName = await screen.findByText("Reliable distributed systems");
    const itemPresentation = within(itemName.closest("article")!);
    expect(itemName).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(itemName);

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      '"pathname":"/library"',
    );
    expect(
      screen.getByRole("complementary", {
        name: "Edit Reliable distributed systems",
      }),
    ).toBeVisible();
    expect(itemName).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(itemPresentation.getByText("Edit details"));

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      '"pathname":"/items/00000000-0000-0000-0000-000000000004"',
    );
  });

  it("filters by the User's Label through the bookmarked URL", async () => {
    const unlabelled = {
      ...item,
      id: "00000000-0000-0000-0000-000000000004" as ItemId,
      title: "Unlabelled course",
      source: null,
      labels: [],
    };
    vi.mocked(fetchAll).mockResolvedValue([item, unlabelled]);
    vi.mocked(fetchLabels).mockResolvedValue([label]);
    renderLibrary();

    fireEvent.click(
      await screen.findByRole("combobox", { name: "Filter by Label" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Systems" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Test location")).toHaveTextContent(
        `?label=${label.id}`,
      ),
    );
    expect(
      screen.getByRole("button", { name: "Distributed systems handbook" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Unlabelled course" }),
    ).not.toBeInTheDocument();
  });

  it("uses Library as the context for details opened from a cold Item URL", async () => {
    vi.mocked(fetchAll).mockResolvedValue([item]);
    vi.mocked(fetchLabels).mockResolvedValue([label]);
    renderLibrary("/items/00000000-0000-0000-0000-000000000099", false);

    fireEvent.click(
      await screen.findByRole("link", {
        name: "Edit Distributed systems handbook",
      }),
    );

    expect(screen.getByLabelText("Test location")).toHaveTextContent(
      '"pathname":"/library","search":"","hash":""',
    );
  });
});
