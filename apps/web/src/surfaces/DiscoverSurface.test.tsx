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
import { prepareFollowPreview } from "../api";
import { DiscoverSurface } from "./DiscoverSurface";
import { Type, type FollowPreviewId } from "@unshelf/shared";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  prepareFollowPreview: vi.fn(),
}));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => "token" },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

function renderDiscover() {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <DiscoverSurface />
    </ApplicationAuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("Discover channel setup", () => {
  it("announces loading then presents an exact partial preview that can be cancelled", async () => {
    let resolve!: (
      value: Awaited<ReturnType<typeof prepareFollowPreview>>,
    ) => void;
    vi.mocked(prepareFollowPreview).mockReturnValue(
      new Promise((next) => {
        resolve = next;
      }),
    );
    renderDiscover();
    const input = screen.getByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));
    expect(screen.getByRole("status")).toHaveTextContent("Resolving channel");

    await act(async () => {
      resolve({
        ok: true,
        preview: {
          outcome: "partial",
          previewId: "00000000-0000-0000-0000-000000000001" as FollowPreviewId,
          provider: "youtube",
          target: {
            kind: "channel",
            channelId: "UC_immutable",
            publisher: "Quiet Learning",
          },
          videos: [
            {
              provider: "youtube",
              providerIdentity: "video-1",
              title: "A deep module",
              source: "https://www.youtube.com/watch?v=video-1",
              publisher: "Quiet Learning",
              publishedAt: "2026-08-15T10:00:00.000Z",
              durationSeconds: 601,
              type: Type.Video,
              thumbnailUrl: null,
            },
          ],
          rejectedCount: 2,
          coverageStartedAt: "2026-07-17T12:00:00.000Z",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
    });

    expect(
      screen.getByRole("heading", { name: "Quiet Learning" }),
    ).toBeVisible();
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Partial preview");
    fireEvent.click(screen.getByRole("button", { name: "Cancel preview" }));
    expect(screen.queryByText("A deep module")).not.toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("focuses tagged target and Provider failures and offers retry", async () => {
    vi.mocked(prepareFollowPreview)
      .mockResolvedValueOnce({ ok: false, error: "unsupported_target" })
      .mockResolvedValueOnce({ ok: false, error: "provider_unavailable" });
    renderDiscover();
    const input = screen.getByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/playlist?list=x" },
    });
    fireEvent.submit(input.closest("form")!);

    const unsupported = await screen.findByRole("alert");
    expect(unsupported).toHaveTextContent(
      "Only public YouTube channel URLs are supported",
    );
    await waitFor(() => expect(unsupported).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    const unavailable = await screen.findByRole("alert");
    expect(unavailable).toHaveTextContent("YouTube is unavailable");
  });

  it("distinguishes empty and expired previews and returns focus for retry", async () => {
    vi.mocked(prepareFollowPreview).mockResolvedValue({
      ok: true,
      preview: {
        outcome: "empty",
        previewId: "00000000-0000-0000-0000-000000000001" as FollowPreviewId,
        provider: "youtube",
        target: {
          kind: "channel",
          channelId: "UC_empty",
          publisher: "Empty Channel",
        },
        videos: [],
        rejectedCount: 0,
        coverageStartedAt: "2026-07-17T12:00:00.000Z",
        expiresAt: new Date(Date.now() - 1).toISOString(),
      },
    });
    renderDiscover();
    const input = screen.getByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@empty" },
    });
    fireEvent.submit(input.closest("form")!);

    expect(
      await screen.findByText("No eligible videos in the last 30 days."),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Preview expired");
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(input).toHaveFocus());
  });
});
