// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
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
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import {
  createDiscoverFollow,
  DiscoverPreviewError,
  fetchDiscoverPreview,
  fetchDiscoverWorkspace,
} from "../api";
import { DiscoverSurface } from "./DiscoverSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  createDiscoverFollow: vi.fn(),
  fetchDiscoverPreview: vi.fn(),
  fetchDiscoverWorkspace: vi.fn(),
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

beforeEach(() => {
  vi.mocked(fetchDiscoverWorkspace).mockResolvedValue(emptyWorkspace);
});

afterEach(() => {
  cleanup();
  vi.mocked(fetchDiscoverPreview).mockReset();
  vi.mocked(createDiscoverFollow).mockReset();
  vi.mocked(fetchDiscoverWorkspace).mockReset();
});

describe("Discover channel preview", () => {
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
    expect(
      screen.getByRole("button", { name: "Follow channel" }),
    ).toBeEnabled();
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
    ["not_found", "could not be found"],
    ["throttled", "limiting requests"],
    ["temporary", "could not provide this preview"],
  ] as const)("presents an actionable %s failure", async (kind, message) => {
    vi.mocked(fetchDiscoverPreview).mockRejectedValue(
      new DiscoverPreviewError(kind),
    );
    renderDiscover();
    fireEvent.change(screen.getByLabelText("YouTube channel URL"), {
      target: { value: "https://youtube.com/@quietlearning" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Preview channel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
