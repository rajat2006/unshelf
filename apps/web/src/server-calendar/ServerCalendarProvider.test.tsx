// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { fetchServerCalendar } from "../api";
import {
  ServerCalendarProvider,
  useServerCalendar,
} from "./ServerCalendarProvider";

vi.mock("../api", () => ({ fetchServerCalendar: vi.fn() }));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => null,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(fetchServerCalendar).mockReset();
});

function CalendarReader() {
  const calendar = useServerCalendar();
  return (
    <>
      <output aria-label="Calendar state">{calendar.status}</output>
      <output aria-label="Authoritative Today">
        {calendar.today ?? "none"}
      </output>
      <button type="button" onClick={calendar.retry}>
        Retry calendar
      </button>
    </>
  );
}

function renderProvider() {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <ServerCalendarProvider>
        <CalendarReader />
      </ServerCalendarProvider>
    </ApplicationAuthProvider>,
  );
}

describe("signed-in server calendar", () => {
  it("withholds Today while unavailable and coalesces concurrent retries", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-08-16T12:00:00.000Z"),
    );
    let resolveRetry:
      ((calendar: { today: string; validUntil: string }) => void) | undefined;
    vi.mocked(fetchServerCalendar)
      .mockRejectedValueOnce(new Error("api responded 503"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRetry = resolve;
          }),
      );

    renderProvider();

    expect(await screen.findByText("unavailable")).toBeVisible();
    expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
      "none",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry calendar" }));
    expect(fetchServerCalendar).toHaveBeenCalledTimes(2);

    resolveRetry?.({
      today: "2026-08-16",
      validUntil: "2026-08-17T00:00:00.000Z",
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
        "2026-08-16",
      ),
    );
  });

  it("withholds an expired date while refreshing once at validUntil", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
    vi.mocked(fetchServerCalendar)
      .mockResolvedValueOnce({
        today: "2026-08-16",
        validUntil: "2026-08-16T12:00:01.000Z",
      })
      .mockResolvedValueOnce({
        today: "2026-08-17",
        validUntil: "2026-08-18T00:00:00.000Z",
      });

    renderProvider();
    await act(async () => Promise.resolve());
    expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
      "2026-08-16",
    );

    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(fetchServerCalendar).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
      "2026-08-17",
    );
  });

  it("refreshes an expired document when the app becomes visible", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-08-16T12:00:00.000Z"),
    );
    vi.mocked(fetchServerCalendar)
      .mockResolvedValueOnce({
        today: "2000-01-01",
        validUntil: "2000-01-02T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        today: "2026-08-16",
        validUntil: "2026-08-17T00:00:00.000Z",
      });
    renderProvider();
    expect(await screen.findByText("unavailable")).toBeVisible();

    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => expect(fetchServerCalendar).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
      "2026-08-16",
    );
  });

  it("refreshes an unknown document when the app becomes visible", async () => {
    vi.mocked(fetchServerCalendar)
      .mockRejectedValueOnce(new Error("api responded 503"))
      .mockResolvedValueOnce({
        today: "2026-08-16",
        validUntil: "2099-08-17T00:00:00.000Z",
      });
    renderProvider();
    expect(await screen.findByText("unavailable")).toBeVisible();

    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => expect(fetchServerCalendar).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
      "2026-08-16",
    );
  });

  it("keeps an older User's response out after the signed-in User changes", async () => {
    const firstUser = { getToken: async () => "first-token" };
    const secondUser = { getToken: async () => "second-token" };
    let resolveFirst:
      ((calendar: { today: string; validUntil: string }) => void) | undefined;
    vi.mocked(fetchServerCalendar)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        today: "2026-08-17",
        validUntil: "2099-08-18T00:00:00.000Z",
      });
    const firstAuth = { ...auth, user: firstUser };
    const secondAuth = { ...auth, user: secondUser };
    const view = render(
      <ApplicationAuthProvider auth={firstAuth}>
        <ServerCalendarProvider>
          <CalendarReader />
        </ServerCalendarProvider>
      </ApplicationAuthProvider>,
    );

    view.rerender(
      <ApplicationAuthProvider auth={secondAuth}>
        <ServerCalendarProvider>
          <CalendarReader />
        </ServerCalendarProvider>
      </ApplicationAuthProvider>,
    );
    await waitFor(() => expect(fetchServerCalendar).toHaveBeenCalledTimes(2));

    resolveFirst?.({
      today: "2026-08-16",
      validUntil: "2099-08-17T00:00:00.000Z",
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Authoritative Today")).toHaveTextContent(
        "2026-08-17",
      ),
    );
    expect(fetchServerCalendar).toHaveBeenLastCalledWith(secondUser);
  });
});
