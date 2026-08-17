import { describe, expect, it } from "vitest";

import {
  runDailyProjectDigest,
  type DiscordPayload,
  type PreviewAdapters,
} from "../src/index.js";

describe("Daily Project Digest preview", () => {
  it("previews the exact active delivery-work payload without delivering", async () => {
    const trace: string[] = [];
    let summarizedPayload: DiscordPayload | undefined;
    const adapters: PreviewAdapters = {
      clock: {
        now: () => {
          trace.push("clock");
          return new Date("2026-08-17T17:30:00.000Z");
        },
      },
      github: {
        listOpenPullRequests: ({ windowEnd }) => {
          trace.push(`github:${windowEnd.toISOString()}`);
          return Promise.resolve([
            {
              number: 101,
              title: "Keep draft delivery work visible",
              baseRefName: "dev",
              headRefName: "agent/draft-preview",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: true,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              number: 102,
              title: "Provision digest access",
              baseRefName: "dev",
              headRefName: "agent/digest-access",
              headRepository: "rajat2006/unshelf",
              labels: ["agent:queued"],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              number: 103,
              title: "Shape the preview wording",
              baseRefName: "dev",
              headRefName: "agent/preview-wording",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [
                {
                  state: "OPEN",
                  labels: ["needs-info"],
                  blockedBy: [],
                },
              ],
            },
            {
              number: 104,
              title: "Ignore an arbitrary blocked issue mention",
              baseRefName: "dev",
              headRefName: "agent/unrelated-mention",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              number: 105,
              title: "Repair production sign-in",
              baseRefName: "main",
              headRefName: "hotfix/production-sign-in",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: true,
              blockedBy: [],
              closingIssues: [],
            },
            {
              number: 106,
              title: "Release dev",
              baseRefName: "main",
              headRefName: "dev",
              headRepository: "rajat2006/unshelf",
              labels: ["release:minor"],
              isDraft: false,
              headContainsMain: true,
              blockedBy: [],
              closingIssues: [],
            },
            {
              number: 107,
              title: "Stale direct hotfix",
              baseRefName: "main",
              headRefName: "hotfix/stale",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            ...["A", "B", "C", "D", "E", "F", "G", "H"].map((title, index) => ({
              number: 108 + index,
              title,
              baseRefName: "dev",
              headRefName: `agent/active-${title.toLowerCase()}`,
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            })),
          ]);
        },
      },
      summary: {
        writePreview: (payload) => {
          trace.push("summary");
          summarizedPayload = payload;
          return Promise.resolve();
        },
      },
      openai: { availability: "unavailable" },
      discord: { availability: "unavailable" },
    };

    const result = await runDailyProjectDigest({ mode: "preview" }, adapters);

    expect(trace).toEqual([
      "clock",
      "github:2026-08-17T17:30:00.000Z",
      "summary",
    ]);
    expect(result).toEqual({
      mode: "preview",
      windowEnd: "2026-08-17T17:30:00.000Z",
      payload: {
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "Daily Project Digest",
            description: "2 items need attention; 11 efforts are still moving.",
            color: 5793266,
            fields: [
              {
                name: "Blocked — Needs attention before work can continue",
                value:
                  "[Provision digest access is blocked.](https://github.com/rajat2006/unshelf/pull/102)\n[Shape the preview wording is blocked.](https://github.com/rajat2006/unshelf/pull/103)",
              },
              {
                name: "In progress — Actively moving forward",
                value:
                  "[Keep draft delivery work visible is in progress.](https://github.com/rajat2006/unshelf/pull/101)\n[Ignore an arbitrary blocked issue mention is in progress.](https://github.com/rajat2006/unshelf/pull/104)\n[Repair production sign-in is in progress.](https://github.com/rajat2006/unshelf/pull/105)\n[A is in progress.](https://github.com/rajat2006/unshelf/pull/108)\n[B is in progress.](https://github.com/rajat2006/unshelf/pull/109)\n[C is in progress.](https://github.com/rajat2006/unshelf/pull/110)\n[D is in progress.](https://github.com/rajat2006/unshelf/pull/111)\n[E is in progress.](https://github.com/rajat2006/unshelf/pull/112)\n[F is in progress.](https://github.com/rajat2006/unshelf/pull/113)\n[G is in progress.](https://github.com/rajat2006/unshelf/pull/114)\n[+ 1 more on GitHub](https://github.com/rajat2006/unshelf/pulls?q=is%3Apr+is%3Aopen+-label%3Aagent%3Ablocked+-label%3Aagent%3Aqueued+-label%3Aneeds-info)",
              },
            ],
            footer: {
              text: "Updates are based on authoritative GitHub activity.",
            },
            timestamp: "2026-08-17T17:30:00.000Z",
          },
        ],
      },
    });
    expect(summarizedPayload).toBe(result.payload);
  });
});
