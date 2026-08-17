import { describe, expect, it } from "vitest";
import { Type } from "@unshelf/shared";
import { classifySource } from "./classifier";

describe("Source classifier", () => {
  it.each([
    { shape: "watch", source: "https://youtube.com/watch?v=M7lc1UVf-VE" },
    {
      shape: "www watch",
      source: "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=30",
    },
    {
      shape: "mobile shorts",
      source: "https://m.youtube.com/shorts/M7lc1UVf-VE",
    },
    {
      shape: "video embed",
      source: "https://youtube.com/embed/M7lc1UVf-VE",
    },
    {
      shape: "short host",
      source: "https://youtu.be/M7lc1UVf-VE?si=share-value",
    },
  ])("classifies an unambiguous $shape Source as video", ({ source }) => {
    expect(classifySource(source)).toEqual({
      classification: "youtube",
      type: Type.Video,
    });
  });

  it.each([
    {
      shape: "page",
      source:
        "https://youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    },
    {
      shape: "embed",
      source:
        "https://www.youtube.com/embed?listType=playlist&list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    },
  ])("classifies an unambiguous playlist $shape", ({ source }) => {
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
    {
      caseName: "mixed watch and playlist",
      source:
        "https://youtube.com/watch?v=M7lc1UVf-VE&list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    },
    { caseName: "missing video id", source: "https://youtube.com/watch" },
    {
      caseName: "malformed video id",
      source: "https://youtube.com/watch?v=too-short",
    },
    {
      caseName: "malformed playlist id",
      source: "https://youtube.com/playlist?list=bad/value",
    },
    {
      caseName: "channel",
      source: "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    },
    { caseName: "handle", source: "https://youtube.com/@GoogleDevelopers" },
    {
      caseName: "search",
      source: "https://youtube.com/results?search_query=queues",
    },
    {
      caseName: "Posts tab",
      source: "https://youtube.com/@GoogleDevelopers/posts",
    },
    { caseName: "home", source: "https://youtube.com/" },
    {
      caseName: "unsupported property",
      source: "https://music.youtube.com/watch?v=M7lc1UVf-VE",
    },
    {
      caseName: "credentials",
      source: "https://user:secret@youtube.com/watch?v=M7lc1UVf-VE",
    },
    {
      caseName: "non-default port",
      source: "https://youtube.com:444/watch?v=M7lc1UVf-VE",
    },
  ])("keeps $caseName on manual fallback", ({ source }) => {
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
