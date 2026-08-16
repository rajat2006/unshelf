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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  confirmFollow,
  fetchDiscoverWorkspace,
  prepareFollowPreview,
} from "../api";
import { DiscoverSurface } from "./DiscoverSurface";
import {
  Type,
  type CandidateId,
  type DiscoveryId,
  type DiscoverWorkspace,
  type FollowId,
  type FollowPreviewId,
} from "@unshelf/shared";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  prepareFollowPreview: vi.fn(),
  confirmFollow: vi.fn(),
  fetchDiscoverWorkspace: vi.fn(),
}));

const emptyWorkspace: DiscoverWorkspace = { follows: [], discoveries: [] };

const storedWorkspace: DiscoverWorkspace = {
  follows: [
    {
      id: "00000000-0000-0000-0000-000000000010" as FollowId,
      provider: "youtube",
      lifecycle: "active",
      name: "Quiet Learning",
      targetUrl: "https://youtube.com/@quietlearning",
      createdAt: "2026-08-16T12:00:00.000Z",
    },
  ],
  discoveries: [
    {
      id: "00000000-0000-0000-0000-000000000020" as DiscoveryId,
      candidateId: "00000000-0000-0000-0000-000000000030" as CandidateId,
      followId: "00000000-0000-0000-0000-000000000010" as FollowId,
      followName: "Quiet Learning",
      state: "new",
      title: "A deep module",
      source: "https://www.youtube.com/watch?v=video-1",
      publisher: "Quiet Learning",
      publishedAt: "2026-08-15T10:00:00.000Z",
      durationSeconds: 601,
      type: Type.Video,
      thumbnailUrl: null,
      discoveredAt: "2026-08-16T12:00:00.000Z",
    },
  ],
};

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

beforeEach(() => {
  vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(emptyWorkspace);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("Discover channel setup", () => {
  it("shows a first-load skeleton, then renders stored intake with a local thumbnail fallback across reload", async () => {
    let resolve!: (workspace: DiscoverWorkspace) => void;
    vi.mocked(fetchDiscoverWorkspace).mockReturnValueOnce(
      new Promise((next) => {
        resolve = next;
      }),
    );
    const firstRender = renderDiscover();
    expect(screen.getByRole("status")).toHaveTextContent("Loading Discover");

    await act(async () => resolve(storedWorkspace));
    expect(screen.getByRole("heading", { name: "Intake" })).toBeVisible();
    expect(screen.getByText("Video preview unavailable")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open on YouTube" }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=video-1");

    firstRender.unmount();
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValueOnce(storedWorkspace);
    renderDiscover();
    expect(await screen.findByText("A deep module")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders a confirmed Follow with empty intake without returning to setup", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue({
      follows: storedWorkspace.follows,
      discoveries: [],
    });
    renderDiscover();

    expect(await screen.findByText(/You’re caught up/)).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("confirms the exact preview and replaces setup with the durable queue", async () => {
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(emptyWorkspace)
      .mockResolvedValueOnce(storedWorkspace);
    vi.mocked(prepareFollowPreview).mockResolvedValue({
      ok: true,
      preview: {
        outcome: "preview",
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
        rejectedCount: 0,
        coverageStartedAt: "2026-07-17T12:00:00.000Z",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    vi.mocked(confirmFollow).mockResolvedValue({
      ok: true,
      follow: storedWorkspace.follows[0],
      discoveries: storedWorkspace.discoveries,
    });
    renderDiscover();
    const input = await screen.findByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("heading", { name: "Quiet Learning" });

    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));

    expect(
      await screen.findByRole("heading", { name: "Discover" }),
    ).toBeVisible();
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Quiet Learning is now in Discover",
    );
    const confirmationCall = vi.mocked(confirmFollow).mock.calls[0];
    expect(confirmationCall?.[0]).toBe(auth.user);
    expect(confirmationCall?.[1]).toMatchObject({
      previewId: "00000000-0000-0000-0000-000000000001",
    });
    expect(confirmationCall?.[1].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchDiscoverWorkspace).toHaveBeenCalledTimes(2);
  });

  it("reuses the confirmation key when recovery follows an unknown request outcome", async () => {
    vi.mocked(prepareFollowPreview).mockResolvedValue({
      ok: true,
      preview: {
        outcome: "empty",
        previewId: "00000000-0000-0000-0000-000000000002" as FollowPreviewId,
        provider: "youtube",
        target: {
          kind: "channel",
          channelId: "UC_retry",
          publisher: "Retry Learning",
        },
        videos: [],
        rejectedCount: 0,
        coverageStartedAt: "2026-07-17T12:00:00.000Z",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    vi.mocked(confirmFollow)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        ok: true,
        follow: storedWorkspace.follows[0],
        discoveries: [],
      });
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(emptyWorkspace)
      .mockResolvedValueOnce(storedWorkspace);
    renderDiscover();
    const input = await screen.findByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@retry" },
    });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("heading", { name: "Retry Learning" });
    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry confirmation" }),
    );
    await screen.findByRole("heading", { name: "Intake" });

    const firstKey = vi.mocked(confirmFollow).mock.calls[0]?.[1].idempotencyKey;
    const retryKey = vi.mocked(confirmFollow).mock.calls[1]?.[1].idempotencyKey;
    expect(retryKey).toBe(firstKey);
  });

  it("keeps a successful confirmation visible when its authoritative reread fails", async () => {
    vi.mocked(prepareFollowPreview).mockResolvedValue({
      ok: true,
      preview: {
        outcome: "empty",
        previewId: "00000000-0000-0000-0000-000000000003" as FollowPreviewId,
        provider: "youtube",
        target: {
          kind: "channel",
          channelId: "UC_confirmed_reload",
          publisher: "Confirmed Learning",
        },
        videos: [],
        rejectedCount: 0,
        coverageStartedAt: "2026-07-17T12:00:00.000Z",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    vi.mocked(confirmFollow).mockResolvedValue({
      ok: true,
      follow: storedWorkspace.follows[0],
      discoveries: storedWorkspace.discoveries,
    });
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(emptyWorkspace)
      .mockRejectedValueOnce(new Error("reread failed"));
    renderDiscover();
    const input = await screen.findByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@confirmed" },
    });
    fireEvent.submit(input.closest("form")!);
    await screen.findByRole("heading", { name: "Confirmed Learning" });
    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));

    expect(await screen.findByText("A deep module")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "confirmed, but the intake could not refresh",
    );
    expect(
      screen.queryByText(/exact preview can no longer/i),
    ).not.toBeInTheDocument();
  });

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
    const input = await screen.findByRole("textbox", {
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
    const input = await screen.findByRole("textbox", {
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
    const input = await screen.findByRole("textbox", {
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
