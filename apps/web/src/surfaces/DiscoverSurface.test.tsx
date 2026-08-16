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
  decideDiscoveries,
  fetchDiscoverHistory,
  fetchDiscoverWorkspace,
  prepareFollowPreview,
  refreshFollow,
  refreshWorkspace,
  setFollowLifecycle,
} from "../api";
import { DiscoverSurface } from "./DiscoverSurface";
import {
  Type,
  type CandidateId,
  type DiscoverHistoryCursor,
  type DiscoveryId,
  type DiscoverWorkspace,
  type FollowId,
  type FollowPreviewId,
} from "@unshelf/shared";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  prepareFollowPreview: vi.fn(),
  confirmFollow: vi.fn(),
  decideDiscoveries: vi.fn(),
  fetchDiscoverHistory: vi.fn(),
  fetchDiscoverWorkspace: vi.fn(),
  refreshFollow: vi.fn(),
  refreshWorkspace: vi.fn(),
  setFollowLifecycle: vi.fn(),
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
      health: {
        latestAttemptAt: null,
        latestAttemptOutcome: null,
        latestCompleteAt: null,
        verifiedCoverageStartedAt: null,
        nextEligibleAt: null,
      },
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
      priorDecisions: { kept: 0, dismissed: 0 },
    },
  ],
};

const severalFollowsWorkspace: DiscoverWorkspace = {
  follows: [
    storedWorkspace.follows[0],
    {
      ...storedWorkspace.follows[0],
      id: "00000000-0000-0000-0000-000000000011" as FollowId,
      name: "Systems Studio",
      targetUrl: "https://youtube.com/@systemsstudio",
      health: {
        latestAttemptAt: "2026-08-16T12:05:00.000Z",
        latestAttemptOutcome: "provider_unavailable",
        latestCompleteAt: "2026-08-16T11:00:00.000Z",
        verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
        nextEligibleAt: null,
      },
    },
  ],
  discoveries: [
    storedWorkspace.discoveries[0],
    {
      ...storedWorkspace.discoveries[0],
      id: "00000000-0000-0000-0000-000000000021" as DiscoveryId,
      candidateId: "00000000-0000-0000-0000-000000000031" as CandidateId,
      followId: "00000000-0000-0000-0000-000000000011" as FollowId,
      followName: "Systems Studio",
      state: "seen",
      title: "Understand queues",
      source: "https://www.youtube.com/watch?v=video-2",
      publisher: "Systems Studio",
    },
  ],
  aggregateNotice: {
    affectedFollowIds: ["00000000-0000-0000-0000-000000000011" as FollowId],
  },
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
  it("keeps a card visible while Later is pending and rereads authoritative intake", async () => {
    let finish!: (value: Awaited<ReturnType<typeof decideDiscoveries>>) => void;
    const seenWorkspace: DiscoverWorkspace = {
      ...storedWorkspace,
      discoveries: [
        { ...storedWorkspace.discoveries[0], state: "seen" as const },
      ],
    };
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(storedWorkspace)
      .mockResolvedValueOnce(seenWorkspace);
    vi.mocked(decideDiscoveries).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderDiscover();

    fireEvent.click(await screen.findByRole("button", { name: "Later" }));

    expect(screen.getByText("A deep module")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Saving Later…" }),
    ).toBeDisabled();
    const cardDecision = vi.mocked(decideDiscoveries).mock.calls[0];
    expect(cardDecision?.[0]).toBe(auth.user);
    expect(cardDecision?.[1]).toMatchObject({
      discoveryIds: [storedWorkspace.discoveries[0].id],
      decision: "seen",
    });
    expect(cardDecision?.[1].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await act(async () => {
      finish({
        ok: true,
        discoveries: [
          {
            id: storedWorkspace.discoveries[0].id,
            state: "seen",
            seenAt: "2026-08-16T12:05:00.000Z",
            decidedAt: null,
          },
        ],
      });
    });
    await waitFor(() =>
      expect(fetchDiscoverWorkspace).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText("seen")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 Discovery acknowledged",
    );
  });

  it("freezes the selected Follow's exact ids when a bulk action begins", async () => {
    let finish!: (value: Awaited<ReturnType<typeof decideDiscoveries>>) => void;
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(
      severalFollowsWorkspace,
    );
    vi.mocked(decideDiscoveries).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: /Systems Studio.*1/ }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge 1" }));
    fireEvent.click(screen.getByRole("button", { name: /All Follows.*2/ }));

    const bulkDecision = vi.mocked(decideDiscoveries).mock.calls[0];
    expect(bulkDecision?.[0]).toBe(auth.user);
    expect(bulkDecision?.[1]).toMatchObject({
      discoveryIds: [severalFollowsWorkspace.discoveries[1].id],
      decision: "seen",
    });
    expect(bulkDecision?.[1].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByText("Understand queues")).toBeVisible();
    await act(async () => {
      finish({
        ok: true,
        discoveries: [
          {
            id: severalFollowsWorkspace.discoveries[1].id,
            state: "seen",
            seenAt: "2026-08-16T12:05:00.000Z",
            decidedAt: null,
          },
        ],
      });
    });
  });

  it("pages secondary history and returns focus to its trigger", async () => {
    const cursor = "opaque-history-page" as DiscoverHistoryCursor;
    const dismissed = {
      ...storedWorkspace.discoveries[0],
      state: "dismissed" as const,
      seenAt: null,
      decidedAt: "2026-08-16T12:05:00.000Z",
    };
    const kept = {
      ...dismissed,
      id: "00000000-0000-0000-0000-000000000021" as DiscoveryId,
      state: "kept" as const,
      title: null,
      source: null,
      publisher: null,
      publishedAt: null,
      durationSeconds: null,
      type: null,
      thumbnailUrl: null,
      decidedAt: "2026-08-16T12:04:00.000Z",
    };
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(storedWorkspace);
    vi.mocked(fetchDiscoverHistory)
      .mockResolvedValueOnce({ discoveries: [dismissed], nextCursor: cursor })
      .mockResolvedValueOnce({ discoveries: [kept], nextCursor: null });
    renderDiscover();
    const historyButton = await screen.findByRole("button", {
      name: "History",
    });
    historyButton.focus();

    fireEvent.click(historyButton);

    expect(
      await screen.findByRole("heading", { name: "Discovery history" }),
    ).toBeVisible();
    expect(await screen.findByText("Dismissed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    expect(
      await screen.findByText("Provider details unavailable"),
    ).toBeVisible();
    expect(fetchDiscoverHistory).toHaveBeenLastCalledWith(auth.user, cursor);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(historyButton).toHaveFocus());
  });

  it("keeps intake actionable and reuses the mutation key after a decision failure", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(storedWorkspace);
    vi.mocked(decideDiscoveries)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        ok: true,
        discoveries: [
          {
            id: storedWorkspace.discoveries[0].id,
            state: "dismissed",
            seenAt: null,
            decidedAt: "2026-08-16T12:05:00.000Z",
          },
        ],
      });
    renderDiscover();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "current intake remains available",
    );
    expect(screen.getByText("A deep module")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry decision" }));
    await waitFor(() => expect(decideDiscoveries).toHaveBeenCalledTimes(2));
    expect(vi.mocked(decideDiscoveries).mock.calls[1]?.[1].idempotencyKey).toBe(
      vi.mocked(decideDiscoveries).mock.calls[0]?.[1].idempotencyKey,
    );
  });

  it("dismisses one card and rereads it out of unresolved intake", async () => {
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(storedWorkspace)
      .mockResolvedValueOnce({ ...storedWorkspace, discoveries: [] });
    vi.mocked(decideDiscoveries).mockResolvedValue({
      ok: true,
      discoveries: [
        {
          id: storedWorkspace.discoveries[0].id,
          state: "dismissed",
          seenAt: null,
          decidedAt: "2026-08-16T12:05:00.000Z",
        },
      ],
    });
    renderDiscover();

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(await screen.findByText(/You’re caught up/)).toBeVisible();
    expect(screen.queryByText("A deep module")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 Discovery dismissed",
    );
  });

  it("recovers a failed history page inside the open dialog", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(storedWorkspace);
    vi.mocked(fetchDiscoverHistory)
      .mockRejectedValueOnce(new Error("history unavailable"))
      .mockResolvedValueOnce({ discoveries: [], nextCursor: null });
    renderDiscover();
    fireEvent.click(await screen.findByRole("button", { name: "History" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History could not load",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));

    expect(
      await screen.findByText("No kept or dismissed Discoveries yet."),
    ).toBeVisible();
    expect(fetchDiscoverHistory).toHaveBeenCalledTimes(2);
  });

  it("combines and filters the same feed across phone reflow and desktop rail layouts", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(
      severalFollowsWorkspace,
    );
    renderDiscover();

    const all = await screen.findByRole("button", { name: /All Follows.*2/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByText("Understand queues")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Systems Studio could not refresh",
    );
    fireEvent.click(screen.getByRole("button", { name: /Systems Studio.*1/ }));
    expect(screen.queryByText("A deep module")).not.toBeInTheDocument();
    expect(screen.getByText("Understand queues")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Systems Studio.*1/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(all);
    expect(screen.getByText("A deep module")).toBeVisible();

    const responsiveWorkspace = screen.getByTestId("discover-workspace");
    expect(responsiveWorkspace).toHaveClass("grid", "min-w-0");
    expect(responsiveWorkspace).toHaveClass(
      "lg:grid-cols-[16rem_minmax(0,1fr)]",
    );
    const followControls = screen.getByLabelText("Follows");
    expect(followControls).toHaveClass("min-w-0", "lg:sticky");
    expect(
      followControls.compareDocumentPosition(
        screen.getByRole("heading", { name: "Intake" }).closest("section")!,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("distinguishes a clear Follow from an empty combined intake", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue({
      ...severalFollowsWorkspace,
      discoveries: [severalFollowsWorkspace.discoveries[0]],
    });
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: /Systems Studio.*0/ }),
    );

    expect(screen.getByText("Systems Studio is clear.")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Return to All Follows" }),
    );
    expect(screen.getByText("A deep module")).toBeVisible();
  });

  it("offers Resume when setup resolves to an existing paused Follow", async () => {
    const pausedFollow = {
      ...storedWorkspace.follows[0],
      lifecycle: "paused" as const,
    };
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue({
      follows: [pausedFollow],
      discoveries: storedWorkspace.discoveries,
    });
    vi.mocked(prepareFollowPreview).mockResolvedValue({
      ok: true,
      outcome: "resume_available",
      follow: pausedFollow,
    });
    vi.mocked(setFollowLifecycle).mockResolvedValue({
      ok: true,
      follow: { ...pausedFollow, lifecycle: "active" },
    });
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: "Follow another channel" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.submit(input.closest("form")!);
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume Follow" }),
    );

    await waitFor(() =>
      expect(setFollowLifecycle).toHaveBeenCalledWith(
        auth.user,
        expect.objectContaining({
          followId: pausedFollow.id,
          lifecycle: "active",
        }),
      ),
    );
  });

  it("labels an exact removed-Follow preview as Follow again", async () => {
    const removedFollow = {
      ...storedWorkspace.follows[0],
      lifecycle: "removed" as const,
    };
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue({
      follows: [removedFollow],
      discoveries: storedWorkspace.discoveries,
    });
    vi.mocked(prepareFollowPreview).mockResolvedValue({
      ok: true,
      preview: {
        outcome: "empty",
        previewId: "00000000-0000-0000-0000-000000000004" as FollowPreviewId,
        provider: "youtube",
        target: {
          kind: "channel",
          channelId: "UC_removed",
          publisher: "Quiet Learning",
        },
        videos: [],
        rejectedCount: 0,
        coverageStartedAt: "2026-07-17T12:00:00.000Z",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        restoresFollowId: removedFollow.id,
      },
    });
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: "Follow another channel" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Public YouTube channel URL",
    });
    fireEvent.change(input, {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.submit(input.closest("form")!);

    expect(
      await screen.findByRole("button", { name: "Follow again" }),
    ).toBeVisible();
  });

  it("refreshes the active workspace and reports only affected Follows", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(
      severalFollowsWorkspace,
    );
    vi.mocked(refreshWorkspace).mockResolvedValue({
      ok: true,
      acquisitions: [
        {
          followId: severalFollowsWorkspace.follows[0].id,
          outcome: "complete",
          acceptedCount: 1,
          rejectedCount: 0,
          ...severalFollowsWorkspace.follows[0].health,
        },
        {
          followId: severalFollowsWorkspace.follows[1].id,
          outcome: "provider_unavailable",
          acceptedCount: 0,
          rejectedCount: 0,
          ...severalFollowsWorkspace.follows[1].health,
        },
      ],
    });
    renderDiscover();
    fireEvent.click(await screen.findByRole("button", { name: "Refresh all" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Systems Studio could not refresh",
    );
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByText("Understand queues")).toBeVisible();
  });

  it("keeps intake visible while a Follow lifecycle action is pending", async () => {
    let finish!: (
      value: Awaited<ReturnType<typeof setFollowLifecycle>>,
    ) => void;
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(
      severalFollowsWorkspace,
    );
    vi.mocked(setFollowLifecycle).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: "Pause Quiet Learning" }),
    );

    expect(
      screen.getByRole("button", { name: "Pausing Quiet Learning" }),
    ).toBeDisabled();
    expect(screen.getByText("A deep module")).toBeVisible();
    await act(async () => {
      finish({
        ok: true,
        follow: { ...severalFollowsWorkspace.follows[0], lifecycle: "paused" },
      });
    });
    await waitFor(() => expect(setFollowLifecycle).toHaveBeenCalledTimes(1));
  });

  it("keeps stored intake visible while a local refresh accepts partial data", async () => {
    let finishRefresh!: (
      result: Awaited<ReturnType<typeof refreshFollow>>,
    ) => void;
    const refreshedWorkspace: DiscoverWorkspace = {
      ...storedWorkspace,
      discoveries: [
        ...storedWorkspace.discoveries,
        {
          ...storedWorkspace.discoveries[0],
          id: "00000000-0000-0000-0000-000000000021" as DiscoveryId,
          candidateId: "00000000-0000-0000-0000-000000000031" as CandidateId,
          title: "Accepted during refresh",
        },
      ],
    };
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(storedWorkspace)
      .mockResolvedValueOnce(refreshedWorkspace);
    vi.mocked(refreshFollow).mockReturnValue(
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
    );
    renderDiscover();
    await screen.findByText("A deep module");

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh Quiet Learning" }),
    );
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Refreshing Quiet Learning",
    );

    await act(async () => {
      finishRefresh({
        ok: true,
        acquisition: {
          followId: storedWorkspace.follows[0].id,
          outcome: "partial",
          acceptedCount: 1,
          rejectedCount: 2,
          latestAttemptAt: "2026-08-16T12:05:00.000Z",
          latestAttemptOutcome: "partial",
          latestCompleteAt: "2026-08-16T12:00:00.000Z",
          verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
          nextEligibleAt: null,
        },
      });
    });

    expect(await screen.findByText("Accepted during refresh")).toBeVisible();
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Partial refresh for Quiet Learning",
    );
    expect(
      screen.getByRole("button", { name: "Retry Quiet Learning" }),
    ).toBeVisible();
  });

  it("keeps stored intake usable when a local refresh fails and offers Retry", async () => {
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(storedWorkspace)
      .mockResolvedValueOnce(storedWorkspace);
    vi.mocked(refreshFollow)
      .mockResolvedValueOnce({
        ok: true,
        acquisition: {
          followId: storedWorkspace.follows[0].id,
          outcome: "provider_unavailable",
          acceptedCount: 0,
          rejectedCount: 0,
          latestAttemptAt: "2026-08-16T12:05:00.000Z",
          latestAttemptOutcome: "provider_unavailable",
          latestCompleteAt: null,
          verifiedCoverageStartedAt: null,
          nextEligibleAt: null,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        acquisition: {
          followId: storedWorkspace.follows[0].id,
          outcome: "complete",
          acceptedCount: 1,
          rejectedCount: 0,
          latestAttemptAt: "2026-08-16T12:06:00.000Z",
          latestAttemptOutcome: "complete",
          latestCompleteAt: "2026-08-16T12:06:00.000Z",
          verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
          nextEligibleAt: null,
        },
      });
    renderDiscover();
    await screen.findByText("A deep module");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh Quiet Learning" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "YouTube is unavailable for Quiet Learning",
    );
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open on YouTube" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry Quiet Learning" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry Quiet Learning" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Quiet Learning refreshed",
      ),
    );
    expect(refreshFollow).toHaveBeenCalledTimes(2);
    expect(screen.getByText("A deep module")).toBeVisible();
  });

  it("preserves a successful refresh outcome when its authoritative reread fails", async () => {
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(storedWorkspace)
      .mockRejectedValueOnce(new Error("reread failed"));
    vi.mocked(refreshFollow).mockResolvedValueOnce({
      ok: true,
      acquisition: {
        followId: storedWorkspace.follows[0].id,
        outcome: "complete",
        acceptedCount: 1,
        rejectedCount: 0,
        latestAttemptAt: "2026-08-16T12:05:00.000Z",
        latestAttemptOutcome: "complete",
        latestCompleteAt: "2026-08-16T12:05:00.000Z",
        verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
        nextEligibleAt: null,
      },
    });
    renderDiscover();
    await screen.findByText("A deep module");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh Quiet Learning" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Quiet Learning refreshed, but the intake could not reload",
    );
    expect(screen.getByText("A deep module")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry Quiet Learning" }),
    ).toBeVisible();
  });

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
