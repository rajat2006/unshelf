// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Status,
  StatusMode,
  Type,
  type Item,
  type ItemId,
  type UserId,
} from "@unshelf/shared";
import type { CurrentUser } from "../application-auth/types";
import { fetchServerCalendar, updateItemTargetDate } from "../api";
import { ItemTargetDate } from "./ItemTargetDate";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { ServerCalendarProvider } from "../server-calendar/ServerCalendarProvider";

vi.mock("../api", () => ({
  fetchServerCalendar: vi.fn(),
  updateItemTargetDate: vi.fn(),
}));

const user: CurrentUser = { getToken: async () => null };
const auth: ApplicationAuth = {
  status: "signed-in",
  user,
  SignInButton: ({ children }) => children,
  UserButton: () => null,
};
const item: Item = {
  id: "00000000-0000-0000-0000-000000000001" as ItemId,
  userId: "00000000-0000-0000-0000-000000000002" as UserId,
  title: "Practical indexing",
  source: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  type: Type.Course,
  status: Status.InProgress,
  statusMode: StatusMode.Manual,
  targetDate: null,
  pastTarget: false,
  completedAt: null,
  labels: [],
  partPercentage: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(fetchServerCalendar).mockReset();
  vi.mocked(updateItemTargetDate).mockReset();
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width") && query.includes("pointer: fine"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.mocked(fetchServerCalendar).mockResolvedValue({
    today: "2026-08-16",
    validUntil: "2099-08-17T00:00:00.000Z",
  });
});

function renderTargetDate(onChanged = vi.fn(), targetItem = item) {
  render(
    <ApplicationAuthProvider auth={auth}>
      <ServerCalendarProvider>
        <ItemTargetDate item={targetItem} user={user} onChanged={onChanged} />
      </ServerCalendarProvider>
    </ApplicationAuthProvider>,
  );
  return onChanged;
}

describe("Item Target date editor", () => {
  it("keeps a failed soft date local and offers an explicit retry", async () => {
    const changed = { ...item, targetDate: "2026-09-01" };
    const onChanged = vi.fn();
    vi.mocked(updateItemTargetDate)
      .mockRejectedValueOnce(new Error("api responded 500"))
      .mockResolvedValueOnce(changed);
    renderTargetDate(onChanged);

    fireEvent.change(
      screen.getByLabelText("Target date for Practical indexing"),
      {
        target: { value: "09/01/2026" },
      },
    );
    fireEvent.keyDown(
      screen.getByLabelText("Target date for Practical indexing"),
      { key: "Enter" },
    );

    expect(
      await screen.findByText(
        "Couldn’t update Target date. Your previous date is unchanged.",
      ),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Target date for Practical indexing"),
    ).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Retry Target date" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(changed));
    expect(updateItemTargetDate).toHaveBeenCalledTimes(2);
    expect(updateItemTargetDate).toHaveBeenLastCalledWith(
      user,
      item.id,
      "2026-09-01",
    );
  });

  it("immediately saves a localized typed date and presents the attempt while pending", async () => {
    const changed = {
      ...item,
      targetDate: "2026-09-01",
      pastTarget: true,
    };
    let resolveSave!: (saved: Item) => void;
    vi.mocked(updateItemTargetDate).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const onChanged = renderTargetDate();
    const input = screen.getByLabelText("Target date for Practical indexing");

    fireEvent.change(input, { target: { value: "09/01/2026" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(updateItemTargetDate).toHaveBeenCalledWith(
        user,
        item.id,
        "2026-09-01",
      ),
    );
    expect(input).toHaveValue("09/01/2026");
    expect(input).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving Target date…");

    resolveSave(changed);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(changed));
  });

  it("immediately saves the authoritative Today", async () => {
    const changed = { ...item, targetDate: "2026-08-16" };
    vi.mocked(updateItemTargetDate).mockResolvedValue(changed);
    const onChanged = renderTargetDate();

    fireEvent.click(await screen.findByRole("button", { name: "Today" }));

    await waitFor(() =>
      expect(updateItemTargetDate).toHaveBeenCalledWith(
        user,
        item.id,
        "2026-08-16",
      ),
    );
    expect(onChanged).toHaveBeenCalledWith(changed);
  });

  it("keeps manual entry and Clear usable while Today is unavailable", async () => {
    vi.mocked(fetchServerCalendar).mockRejectedValueOnce(
      new Error("api responded 503"),
    );
    const cleared = { ...item, targetDate: null };
    vi.mocked(updateItemTargetDate).mockResolvedValue(cleared);
    const onChanged = renderTargetDate(vi.fn(), {
      ...item,
      targetDate: "2026-09-01",
    });

    const today = screen.getByRole("button", { name: "Today" });
    expect(
      await screen.findByText("Authoritative Today is unavailable."),
    ).toBeVisible();
    expect(today).toBeDisabled();
    expect(
      screen.getByLabelText("Target date for Practical indexing"),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() =>
      expect(updateItemTargetDate).toHaveBeenCalledWith(user, item.id, null),
    );
    expect(onChanged).toHaveBeenCalledWith(cleared);

    fireEvent.click(screen.getByRole("button", { name: "Retry Today" }));
    await waitFor(() => expect(today).toBeEnabled());
  });
});
