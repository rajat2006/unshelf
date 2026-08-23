// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DiscoverPreview,
  DiscoverProviderTargetId,
} from "@unshelf/shared";
import { ApplicationAuthProvider } from "../application-auth/ApplicationAuthProvider";
import type { ApplicationAuth } from "../application-auth/types";
import { DiscoverPreviewError, fetchDiscoverPreview } from "../api";
import { DiscoverSurface } from "./DiscoverSurface";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchDiscoverPreview: vi.fn(),
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

afterEach(() => {
  cleanup();
  vi.mocked(fetchDiscoverPreview).mockReset();
});

describe("Discover channel preview", () => {
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
