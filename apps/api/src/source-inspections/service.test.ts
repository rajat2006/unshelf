import { describe, expect, it, vi } from "vitest";
import { Type, type UserId } from "@unshelf/shared";
import { createSourceInspectionService } from "./service";

const userId = "a156d86a-09d3-4935-9bf0-1820fa357f90" as UserId;

describe("Source inspection service", () => {
  it.each([
    ["https://youtu.be/M7lc1UVf-VE", Type.Video],
    [
      "https://youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
      Type.Playlist,
    ],
    ["https://youtube.com/post/UgkxQ_xDEe4m2V7vYB6i3e0qfZ8pT5uJ", Type.Other],
  ])("suggests a locally classified YouTube Type", async (source, type) => {
    const service = createSourceInspectionService();

    await expect(
      service.inspect({ source, userId, signal: new AbortController().signal }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type,
        typeEvidence: "youtube_route",
      },
    });
  });

  it.each([
    "https://youtube.com/watch?v=M7lc1UVf-VE&list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    "https://example.com/article",
    "not a URL",
  ])("returns manual fallback for an unresolved Source", async (source) => {
    const service = createSourceInspectionService();

    await expect(
      service.inspect({ source, userId, signal: new AbortController().signal }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
  });

  it("keeps the production-default kill switch off", async () => {
    const classify = vi.fn(() => ({
      classification: "youtube" as const,
      type: Type.Video,
    }));
    const service = createSourceInspectionService({ classify });

    await expect(
      service.inspect({
        source: "https://youtu.be/M7lc1UVf-VE",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: "suggested",
        type: Type.Video,
        typeEvidence: "youtube_route",
      },
    });
    expect(classify).toHaveBeenCalledOnce();
  });

  it("returns manual fallback when the global kill switch is on", async () => {
    const classify = vi.fn(() => ({
      classification: "youtube" as const,
      type: Type.Video,
    }));
    const service = createSourceInspectionService({
      disabled: true,
      classify,
    });

    await expect(
      service.inspect({
        source: "https://youtu.be/M7lc1UVf-VE",
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it("refuses an over-limit working Source before classification", async () => {
    const classify = vi.fn();
    const service = createSourceInspectionService({
      classify,
    });

    await expect(
      service.inspect({
        source: `https://example.com/${"a".repeat(8 * 1024)}`,
        userId,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      ok: true,
      response: { status: "unavailable" },
    });
    expect(classify).not.toHaveBeenCalled();
  });
});
