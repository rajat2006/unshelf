import { describe, expect, it } from "vitest";
import { Type } from "@unshelf/shared";
import { classifySource } from "./classifier";

describe("Source classifier", () => {
  it.each([
    ["watch", "https://youtube.com/watch?v=M7lc1UVf-VE"],
    ["www watch", "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=30"],
    ["mobile shorts", "https://m.youtube.com/shorts/M7lc1UVf-VE"],
    ["video embed", "https://youtube.com/embed/M7lc1UVf-VE"],
    ["short host", "https://youtu.be/M7lc1UVf-VE?si=share-value"],
  ])("classifies an unambiguous %s Source as video", (_shape, source) => {
    expect(classifySource(source)).toEqual({
      classification: "youtube",
      type: Type.Video,
    });
  });

  it.each([
    [
      "page",
      "https://youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    ],
    [
      "embed",
      "https://www.youtube.com/embed?listType=playlist&list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    ],
  ])("classifies an unambiguous playlist %s", (_shape, source) => {
    expect(classifySource(source)).toEqual({
      classification: "youtube",
      type: Type.Playlist,
    });
  });

  it("classifies a direct Community Post without needing its title", () => {
    expect(
      classifySource(
        "https://www.youtube.com/post/UgkxQ_xDEe4m2V7vYB6i3e0qfZ8pT5uJ",
      ),
    ).toEqual({ classification: "youtube", type: Type.Other });
  });

  it.each([
    [
      "mixed watch and playlist",
      "https://youtube.com/watch?v=M7lc1UVf-VE&list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    ],
    ["missing video id", "https://youtube.com/watch"],
    ["malformed video id", "https://youtube.com/watch?v=too-short"],
    ["malformed playlist id", "https://youtube.com/playlist?list=bad/value"],
    ["channel", "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"],
    ["handle", "https://youtube.com/@GoogleDevelopers"],
    ["search", "https://youtube.com/results?search_query=queues"],
    ["Posts tab", "https://youtube.com/@GoogleDevelopers/posts"],
    ["home", "https://youtube.com/"],
    ["unsupported property", "https://music.youtube.com/watch?v=M7lc1UVf-VE"],
    ["credentials", "https://user:secret@youtube.com/watch?v=M7lc1UVf-VE"],
    ["non-default port", "https://youtube.com:444/watch?v=M7lc1UVf-VE"],
  ])("keeps %s on manual fallback", (_case, source) => {
    expect(classifySource(source)).toEqual({
      classification: "unsupported_youtube",
    });
  });

  it.each([
    "not a Source",
    "ftp://youtube.com/watch?v=M7lc1UVf-VE",
    "https://example.com/watch?v=M7lc1UVf-VE",
    "https://youtu.be.evil.example/M7lc1UVf-VE",
  ])("leaves a non-YouTube Source unclassified: %s", (source) => {
    expect(classifySource(source)).toEqual({ classification: "generic" });
  });
});
