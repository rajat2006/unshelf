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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DiscoverFollow,
  DiscoverPreview,
  DiscoverProviderTargetId,
  DiscoverWorkspace,
} from "@unshelf/shared";
import { CandidateState, Type } from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  createDiscoverFollow,
  DiscoverCandidateDecisionError,
  DiscoverPreviewError,
  fetchDiscoverPreview,
  fetchDiscoverWorkspace,
  keepDiscoverCandidate,
  rejectDiscoverCandidate,
  unfollowDiscoverChannel,
} from "../api";
import { DiscoverSurface } from "./DiscoverSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  createDiscoverFollow: vi.fn(),
  fetchDiscoverPreview: vi.fn(),
  fetchDiscoverWorkspace: vi.fn(),
  unfollowDiscoverChannel: vi.fn(),
  keepDiscoverCandidate: vi.fn(),
  rejectDiscoverCandidate: vi.fn(),
}));

const auth: ApplicationAuth = {
  status: "signed-in",
  user: { getToken: async () => null },
  SignInButton: ({ children }) => children,
  UserButton: () => <button type="button">Account</button>,
};

const preview: DiscoverPreview = {
  targetId: "00000000-0000-0000-0000-000000000001" as DiscoverProviderTargetId,
  channel: {
    externalId: "UC_immutable",
    title: "Quiet Learning",
    thumbnailUrl: "https://img.youtube.com/channel.jpg",
    canonicalUrl: "https://www.youtube.com/channel/UC_immutable",
  },
  videos: [
    {
      externalId: "video-new",
      title: "Newest lesson",
      thumbnailUrl: "https://img.youtube.com/video-new.jpg",
      publishedAt: "2026-08-20T12:00:00.000Z",
      durationSeconds: 901,
      source: "https://www.youtube.com/watch?v=video-new",
      channelExternalId: "UC_immutable",
      channelTitle: "Quiet Learning",
    },
    {
      externalId: "video-old",
      title: "Quiet channel classic",
      thumbnailUrl: null,
      publishedAt: "2026-01-10T12:00:00.000Z",
      durationSeconds: 241,
      source: "https://www.youtube.com/watch?v=video-old",
      channelExternalId: "UC_immutable",
      channelTitle: "Quiet Learning",
    },
  ],
};

function renderDiscover() {
  return render(
    <ApplicationAuthProvider auth={auth}>
      <DiscoverSurface />
    </ApplicationAuthProvider>,
  );
}

const emptyWorkspace: DiscoverWorkspace = { follows: [], candidates: [] };

const secondPreview: DiscoverPreview = {
  targetId: "00000000-0000-0000-0000-000000000101" as DiscoverProviderTargetId,
  channel: {
    externalId: "UC_systems",
    title: "Systems School",
    thumbnailUrl: null,
    canonicalUrl: "https://www.youtube.com/channel/UC_systems",
  },
  videos: [
    {
      externalId: "systems-new",
      title: "Systems newest",
      thumbnailUrl: null,
      publishedAt: "2026-08-22T12:00:00.000Z",
      durationSeconds: 1_202,
      source: "https://www.youtube.com/watch?v=systems-new",
      channelExternalId: "UC_systems",
      channelTitle: "Systems School",
    },
  ],
};

const quietFollow = {
  id: "00000000-0000-0000-0000-000000000110",
  targetId: preview.targetId,
  channel: preview.channel,
} as DiscoverFollow;
const systemsFollow = {
  id: "00000000-0000-0000-0000-000000000111",
  targetId: secondPreview.targetId,
  channel: secondPreview.channel,
} as DiscoverFollow;
const severalFollowsWorkspace = {
  follows: [quietFollow, systemsFollow],
  candidates: [
    {
      id: "00000000-0000-0000-0000-000000000120",
      state: "pending",
      video: secondPreview.videos[0],
    },
    {
      id: "00000000-0000-0000-0000-000000000121",
      state: "pending",
      video: preview.videos[0],
    },
  ],
} as DiscoverWorkspace;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(emptyWorkspace);
});

afterEach(() => {
  cleanup();
  vi.mocked(fetchDiscoverPreview).mockReset();
  vi.mocked(createDiscoverFollow).mockReset();
  vi.mocked(fetchDiscoverWorkspace).mockReset();
  vi.mocked(unfollowDiscoverChannel).mockReset();
  vi.mocked(keepDiscoverCandidate).mockReset();
  vi.mocked(rejectDiscoverCandidate).mockReset();
});

describe("Discover channel preview", () => {
  it("shows the Library identity badge and Item link", async () => {
    const workspace = {
      follows: [quietFollow],
      candidates: [
        {
          ...severalFollowsWorkspace.candidates[1],
          libraryItem: {
            id: "00000000-0000-0000-0000-000000000130",
            title: "Captured lesson",
          },
        },
      ],
    } as DiscoverWorkspace;
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(workspace);
    renderDiscover();

    expect(await screen.findByText(/Already in Library/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Captured lesson" }),
    ).toHaveAttribute("href", "/items/00000000-0000-0000-0000-000000000130");
  });

  it("opens Keep with defaults and focuses invalid Title", async () => {
    const workspace = {
      follows: [quietFollow],
      candidates: [
        {
          ...severalFollowsWorkspace.candidates[1],
          libraryItem: null,
        },
      ],
    } as DiscoverWorkspace;
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(workspace);
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep Newest lesson" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Keep Candidate",
    });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Newest lesson");
    expect(
      within(dialog).getByRole("combobox", { name: "Type" }),
    ).toHaveTextContent("Video");
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep in Library" }),
    );
    expect(await within(dialog).findByText("Enter a title.")).toBeVisible();
    expect(within(dialog).getByLabelText("Title")).toHaveFocus();
    expect(keepDiscoverCandidate).not.toHaveBeenCalled();
  });

  it("Keeps an edited title and Type then removes the resolved Candidate", async () => {
    const workspace = {
      follows: [quietFollow],
      candidates: [
        {
          ...severalFollowsWorkspace.candidates[1],
          libraryItem: null,
        },
      ],
    } as DiscoverWorkspace;
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(workspace);
    vi.mocked(keepDiscoverCandidate).mockResolvedValue({
      candidate: workspace.candidates[0],
      item: { title: "Confirmed lesson", type: Type.Course },
    } as Awaited<ReturnType<typeof keepDiscoverCandidate>>);
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep Newest lesson" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Keep Candidate",
    });

    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Confirmed lesson" },
    });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Course" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep in Library" }),
    );

    await waitFor(() =>
      expect(keepDiscoverCandidate).toHaveBeenCalledWith(auth.user, {
        candidateId: workspace.candidates[0].id,
        title: "Confirmed lesson",
        type: Type.Course,
      }),
    );
    expect(
      screen.queryByRole("article", { name: "Newest lesson" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a Candidate actionable through Reject errors and reports conflicts", async () => {
    const workspace = {
      follows: [quietFollow],
      candidates: [
        {
          ...severalFollowsWorkspace.candidates[1],
          libraryItem: null,
        },
      ],
    } as DiscoverWorkspace;
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(workspace);
    let failReject!: (reason: Error) => void;
    vi.mocked(rejectDiscoverCandidate)
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          failReject = reject;
        }),
      )
      .mockResolvedValueOnce({
        ...workspace.candidates[0],
        state: CandidateState.Rejected,
      });
    renderDiscover();
    const rejectButton = await screen.findByRole("button", {
      name: "Reject Newest lesson",
    });

    fireEvent.click(rejectButton);
    expect(
      screen.getByRole("button", { name: "Rejecting Newest lesson…" }),
    ).toBeDisabled();
    failReject(new Error("temporary"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be resolved",
    );
    expect(
      screen.getByRole("article", { name: "Newest lesson" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Reject Newest lesson" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("article", { name: "Newest lesson" }),
      ).not.toBeInTheDocument(),
    );

    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(workspace);
    vi.mocked(keepDiscoverCandidate).mockRejectedValue(
      new DiscoverCandidateDecisionError("conflict"),
    );
    renderDiscover();
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep Newest lesson" }),
    );
    fireEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Keep Candidate" }),
      ).getByRole("button", { name: "Keep in Library" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already resolved another way",
    );
  });
  it("loads an existing pending queue and explains when it is empty", async () => {
    const follow = {
      id: "00000000-0000-0000-0000-000000000030",
      targetId: preview.targetId,
      channel: preview.channel,
    } as DiscoverFollow;
    let resolveWorkspace!: (value: DiscoverWorkspace) => void;
    vi.mocked(fetchDiscoverWorkspace).mockReturnValue(
      new Promise((resolve) => {
        resolveWorkspace = resolve;
      }),
    );
    renderDiscover();

    expect(screen.getByText("Loading your Discover queue…")).toBeVisible();
    resolveWorkspace({ follows: [follow], candidates: [] });

    expect(
      await screen.findByRole("heading", { name: "Pending Candidates" }),
    ).toBeVisible();
    expect(
      screen.getByText("No pending Candidates", { exact: false }),
    ).toBeVisible();
  });

  it("shows a recoverable workspace error", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockRejectedValue(
      new Error("temporary failure"),
    );
    renderDiscover();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Discover queue could not be loaded",
    );
  });

  it("confirms a preview into the pending queue and can Follow another channel", async () => {
    const follow = {
      id: "00000000-0000-0000-0000-000000000010",
      targetId: preview.targetId,
      channel: preview.channel,
    } as DiscoverFollow;
    const workspace: DiscoverWorkspace = {
      follows: [follow],
      candidates: [
        {
          id: "00000000-0000-0000-0000-000000000020",
          state: "pending",
          video: preview.videos[0],
        },
      ],
    } as DiscoverWorkspace;
    vi.mocked(fetchDiscoverPreview).mockResolvedValue(preview);
    vi.mocked(createDiscoverFollow).mockResolvedValue(follow);
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(emptyWorkspace)
      .mockResolvedValueOnce(workspace);
    renderDiscover();
    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));
    await screen.findByRole("heading", { name: "Quiet Learning" });

    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));

    expect(
      await screen.findByRole("heading", { name: "Pending Candidates" }),
    ).toBeVisible();
    expect(
      screen.getByRole("article", { name: "Newest lesson" }),
    ).toHaveTextContent("15:01");
    expect(createDiscoverFollow).toHaveBeenCalledWith(auth.user, {
      targetId: preview.targetId,
    });
    expect(fetchDiscoverPreview).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Follow another" }));
    expect(screen.getByLabelText("YouTube channel URL")).toHaveValue("");
  });

  it("disables Follow while confirming and keeps the preview available on failure", async () => {
    let rejectFollow!: (reason: Error) => void;
    let resolveWorkspace!: (value: DiscoverWorkspace) => void;
    vi.mocked(fetchDiscoverWorkspace).mockReturnValue(
      new Promise((resolve) => {
        resolveWorkspace = resolve;
      }),
    );
    vi.mocked(fetchDiscoverPreview).mockResolvedValue(preview);
    vi.mocked(createDiscoverFollow).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFollow = reject;
      }),
    );
    renderDiscover();
    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));
    await screen.findByRole("heading", { name: "Quiet Learning" });

    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));

    expect(screen.getByRole("button", { name: "Following…" })).toBeDisabled();
    rejectFollow(new Error("follow failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "channel could not be followed",
    );
    resolveWorkspace(emptyWorkspace);
    expect(
      await screen.findByRole("button", { name: "Follow channel" }),
    ).toBeEnabled();
    expect(
      screen.queryByText("Loading your Discover queue…"),
    ).not.toBeInTheDocument();
  });

  it("does not call a successful Follow failed when refreshing its queue fails", async () => {
    vi.mocked(fetchDiscoverPreview).mockResolvedValue(preview);
    vi.mocked(createDiscoverFollow).mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000040",
      targetId: preview.targetId,
      channel: preview.channel,
    } as DiscoverFollow);
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(emptyWorkspace)
      .mockRejectedValueOnce(new Error("workspace failed"));
    renderDiscover();
    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));
    await screen.findByRole("heading", { name: "Quiet Learning" });

    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Discover queue could not be loaded",
    );
    expect(
      screen.queryByText("channel could not be followed", { exact: false }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Quiet Learning" }),
    ).not.toBeInTheDocument();
  });

  it("ignores an older workspace response after Follow loads the pending queue", async () => {
    const follow = {
      id: "00000000-0000-0000-0000-000000000050",
      targetId: preview.targetId,
      channel: preview.channel,
    } as DiscoverFollow;
    const workspace = {
      follows: [follow],
      candidates: [
        {
          id: "00000000-0000-0000-0000-000000000060",
          state: "pending",
          video: preview.videos[0],
        },
      ],
    } as DiscoverWorkspace;
    let resolveInitialWorkspace!: (value: DiscoverWorkspace) => void;
    vi.mocked(fetchDiscoverWorkspace)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInitialWorkspace = resolve;
        }),
      )
      .mockResolvedValueOnce(workspace);
    vi.mocked(fetchDiscoverPreview).mockResolvedValue(preview);
    vi.mocked(createDiscoverFollow).mockResolvedValue(follow);
    renderDiscover();
    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));
    await screen.findByRole("heading", { name: "Quiet Learning" });
    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));
    expect(
      await screen.findByRole("heading", { name: "Pending Candidates" }),
    ).toBeVisible();

    resolveInitialWorkspace(emptyWorkspace);

    expect(
      await screen.findByRole("heading", { name: "Pending Candidates" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("YouTube channel URL"),
    ).not.toBeInTheDocument();
  });

  it("filters one combined queue by Follow with an accessible keyboard selector", async () => {
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(severalFollowsWorkspace)
      .mockResolvedValueOnce({
        follows: severalFollowsWorkspace.follows,
        candidates: [severalFollowsWorkspace.candidates[0]],
      });
    renderDiscover();

    const selector = await screen.findByRole("combobox", {
      name: "Candidate channel",
    });
    expect(selector).toHaveTextContent("All followed channels");
    expect(
      screen.getByRole("article", { name: "Systems newest" }),
    ).toBeVisible();
    expect(
      screen.getByRole("article", { name: "Newest lesson" }),
    ).toBeVisible();

    selector.focus();
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    const systemsOption = await screen.findByRole("option", {
      name: "Systems School",
    });
    systemsOption.focus();
    fireEvent.keyDown(systemsOption, { key: "Enter" });

    await waitFor(() =>
      expect(fetchDiscoverWorkspace).toHaveBeenLastCalledWith(
        auth.user,
        systemsFollow.id,
      ),
    );
    expect(
      await screen.findByRole("article", { name: "Systems newest" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("article", { name: "Newest lesson" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unfollow Quiet Learning" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Unfollow Systems School" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Follow management" }),
    ).toHaveClass("lg:grid-cols-[minmax(14rem,20rem)_1fr]");
    expect(screen.getByRole("list", { name: "Followed channels" })).toHaveClass(
      "sm:grid-cols-2",
    );
  });

  it("preserves the combined queue when a channel filter fails and retries it", async () => {
    let rejectFilter!: (reason: Error) => void;
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(severalFollowsWorkspace)
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectFilter = reject;
        }),
      )
      .mockResolvedValueOnce({
        follows: severalFollowsWorkspace.follows,
        candidates: [severalFollowsWorkspace.candidates[1]],
      });
    renderDiscover();
    const selector = await screen.findByRole("combobox", {
      name: "Candidate channel",
    });
    fireEvent.click(selector);
    fireEvent.click(
      await screen.findByRole("option", { name: "Quiet Learning" }),
    );

    expect(selector).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Filtering pending Candidates",
    );
    expect(
      screen.getByRole("article", { name: "Systems newest" }),
    ).toBeVisible();
    expect(
      screen.getByRole("article", { name: "Newest lesson" }),
    ).toBeVisible();
    rejectFilter(new Error("temporary failure"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "channel filter could not be loaded",
    );
    expect(
      screen.getByRole("article", { name: "Systems newest" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry channel filter" }),
    );

    await waitFor(() =>
      expect(fetchDiscoverWorkspace).toHaveBeenLastCalledWith(
        auth.user,
        quietFollow.id,
      ),
    );
    expect(
      screen.queryByRole("article", { name: "Systems newest" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Newest lesson" }),
    ).toBeVisible();
  });

  it("soft-Unfollows a channel and can re-follow the same channel", async () => {
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce({
        follows: [quietFollow],
        candidates: [severalFollowsWorkspace.candidates[1]],
      })
      .mockResolvedValueOnce(emptyWorkspace)
      .mockResolvedValueOnce({
        follows: [quietFollow],
        candidates: [severalFollowsWorkspace.candidates[1]],
      });
    vi.mocked(unfollowDiscoverChannel).mockResolvedValue();
    vi.mocked(fetchDiscoverPreview).mockResolvedValue(preview);
    vi.mocked(createDiscoverFollow).mockResolvedValue(quietFollow);
    renderDiscover();

    fireEvent.click(
      await screen.findByRole("button", { name: "Unfollow Quiet Learning" }),
    );
    expect(
      screen.getByRole("button", { name: "Unfollowing Quiet Learning…" }),
    ).toBeDisabled();

    expect(await screen.findByLabelText("YouTube channel URL")).toBeVisible();
    expect(unfollowDiscoverChannel).toHaveBeenCalledWith(
      auth.user,
      quietFollow.id,
    );
    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));
    await screen.findByRole("heading", { name: "Quiet Learning" });
    fireEvent.click(screen.getByRole("button", { name: "Follow channel" }));

    await waitFor(() =>
      expect(fetchDiscoverWorkspace).toHaveBeenCalledTimes(3),
    );
    expect(
      await screen.findByRole("article", { name: "Newest lesson" }),
    ).toBeVisible();
    expect(createDiscoverFollow).toHaveBeenCalledWith(auth.user, {
      targetId: quietFollow.targetId,
    });
  });

  it("keeps Follow management available after a recoverable Unfollow error", async () => {
    vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(
      severalFollowsWorkspace,
    );
    vi.mocked(unfollowDiscoverChannel).mockRejectedValue(
      new Error("temporary failure"),
    );
    renderDiscover();

    fireEvent.click(
      await screen.findByRole("button", { name: "Unfollow Systems School" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Systems School could not be Unfollowed",
    );
    expect(
      screen.getByRole("button", { name: "Unfollow Systems School" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("article", { name: "Systems newest" }),
    ).toBeVisible();
  });

  it("keeps the remaining queue available when Unfollow reconciliation fails", async () => {
    const remainingWorkspace = {
      follows: [quietFollow],
      candidates: [severalFollowsWorkspace.candidates[1]],
    };
    vi.mocked(fetchDiscoverWorkspace)
      .mockResolvedValueOnce(severalFollowsWorkspace)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(remainingWorkspace);
    vi.mocked(unfollowDiscoverChannel).mockResolvedValue();
    renderDiscover();

    fireEvent.click(
      await screen.findByRole("button", { name: "Unfollow Systems School" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "remaining Discover queue could not be refreshed",
    );
    expect(
      screen.getByRole("button", { name: "Unfollow Quiet Learning" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Unfollow Systems School" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Newest lesson" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("article", { name: "Systems newest" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry Discover queue" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("remaining Discover queue could not be refreshed", {
          exact: false,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("button", { name: "Unfollow Quiet Learning" }),
    ).toBeEnabled();
  });

  it("announces resolution and presents the latest channel videos", async () => {
    let resolvePreview!: (value: DiscoverPreview) => void;
    vi.mocked(fetchDiscoverPreview).mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    renderDiscover();

    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning/videos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));

    expect(
      screen.getByRole("button", { name: "Resolving channel…" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Resolving channel");

    resolvePreview(preview);

    expect(
      await screen.findByRole("heading", { name: "Quiet Learning" }),
    ).toBeVisible();
    const newest = within(
      screen.getByRole("article", { name: "Newest lesson" }),
    );
    expect(newest.getByText("15:01")).toBeVisible();
    expect(newest.getByRole("img", { name: "Newest lesson" })).toHaveAttribute(
      "src",
      "https://img.youtube.com/video-new.jpg",
    );
    expect(newest.getByRole("link", { name: "Newest lesson" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=video-new",
    );
    expect(
      within(
        screen.getByRole("article", { name: "Quiet channel classic" }),
      ).getByText("No thumbnail"),
    ).toBeVisible();
  });

  it("explains an empty or unsupported channel URL without requesting a preview", () => {
    renderDiscover();

    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a supported YouTube /channel/ or /@handle URL.",
    );
    expect(fetchDiscoverPreview).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "not_found", message: "could not be found" },
    { kind: "throttled", message: "limiting requests" },
    { kind: "temporary", message: "could not provide this preview" },
  ] as const)(
    "presents an actionable $kind failure",
    async ({ kind, message }) => {
      vi.mocked(fetchDiscoverPreview).mockRejectedValue(
        new DiscoverPreviewError(kind),
      );
      renderDiscover();
      fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
        target: { value: "https://youtube.com/@quietlearning" },
      });

      fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    },
  );
});
