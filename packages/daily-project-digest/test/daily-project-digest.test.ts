import { describe, expect, it } from "vitest";

import {
  runDailyProjectDigest,
  type DiscordPayload,
  type PreviewAdapters,
} from "../src/index.js";

describe("Daily Project Digest preview", () => {
  it("previews production releases alongside completed and active work", async () => {
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
        listPullRequests: ({ windowStart, windowEnd }) => {
          trace.push(
            `github:${windowStart.toISOString()}:${windowEnd.toISOString()}`,
          );
          return Promise.resolve([
            {
              state: "MERGED",
              mergedAt: "2026-08-17T12:00:00.000Z",
              number: 116,
              title: "Finish completed delivery reporting",
              baseRefName: "dev",
              headRefName: "agent/completed-delivery",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "MERGED",
              mergedAt: "2026-08-16T17:30:00.000Z",
              number: 117,
              title: "Include the window start",
              baseRefName: "dev",
              headRefName: "agent/window-start",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "MERGED",
              mergedAt: "2026-08-17T17:30:00.000Z",
              number: 118,
              title: "Exclude the window end",
              baseRefName: "dev",
              headRefName: "agent/window-end",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "MERGED",
              mergedAt: "2026-08-16T17:29:59.999Z",
              number: 119,
              title: "Exclude an earlier merge",
              baseRefName: "dev",
              headRefName: "agent/before-window",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "CLOSED",
              mergedAt: null,
              number: 120,
              title: "Ignore closed unmerged work",
              baseRefName: "dev",
              headRefName: "agent/closed-unmerged",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "MERGED",
              mergedAt: "2026-08-17T13:00:00.000Z",
              number: 121,
              title: "Ignore a direct hotfix merge",
              baseRefName: "main",
              headRefName: "hotfix/direct-main",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: true,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "OPEN",
              mergedAt: null,
              number: 116,
              title: "Finish completed delivery reporting",
              baseRefName: "dev",
              headRefName: "agent/completed-delivery",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN",
              mergedAt: null,
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
              state: "OPEN" as const,
              mergedAt: null,
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
        listDeployments: ({ windowStart, windowEnd }) => {
          trace.push(
            `deployments:${windowStart.toISOString()}:${windowEnd.toISOString()}`,
          );
          return Promise.resolve([
            {
              environment: "production",
              status: "success",
              statusAt: "2026-08-17T15:00:00.000Z",
              sha: "production-release",
              reachableFromMain: true,
              newlyContainedPullRequests: [
                {
                  state: "MERGED",
                  mergedAt: "2026-08-17T12:00:00.000Z",
                  number: 116,
                  title: "Finish completed delivery reporting",
                  baseRefName: "dev",
                  headRefName: "agent/completed-delivery",
                  headRepository: "rajat2006/unshelf",
                  labels: [],
                  isDraft: false,
                  headContainsMain: false,
                  blockedBy: [],
                  closingIssues: [],
                },
                {
                  state: "MERGED",
                  mergedAt: "2026-08-17T13:00:00.000Z",
                  number: 121,
                  title: "Repair production sign-in",
                  baseRefName: "main",
                  headRefName: "hotfix/production-sign-in",
                  headRepository: "rajat2006/unshelf",
                  labels: [],
                  isDraft: false,
                  headContainsMain: false,
                  blockedBy: [],
                  closingIssues: [],
                },
                {
                  state: "MERGED",
                  mergedAt: "2026-08-17T14:00:00.000Z",
                  number: 122,
                  title: "Release dev to main",
                  baseRefName: "main",
                  headRefName: "dev",
                  headRepository: "rajat2006/unshelf",
                  labels: ["release:minor"],
                  isDraft: false,
                  headContainsMain: false,
                  blockedBy: [],
                  closingIssues: [],
                },
                {
                  state: "MERGED",
                  mergedAt: "2026-08-16T16:00:00.000Z",
                  number: 123,
                  title: "Ship the digest foundation",
                  baseRefName: "dev",
                  headRefName: "agent/digest-foundation",
                  headRepository: "rajat2006/unshelf",
                  labels: [],
                  isDraft: false,
                  headContainsMain: false,
                  blockedBy: [],
                  closingIssues: [],
                },
              ],
            },
            {
              environment: "production",
              status: "failure",
              statusAt: "2026-08-17T16:00:00.000Z",
              sha: "failed-production-release",
              reachableFromMain: true,
              newlyContainedPullRequests: [
                {
                  state: "MERGED",
                  mergedAt: "2026-08-17T15:30:00.000Z",
                  number: 124,
                  title: "Do not report failed deployments",
                  baseRefName: "dev",
                  headRefName: "agent/failed-deployment",
                  headRepository: "rajat2006/unshelf",
                  labels: [],
                  isDraft: false,
                  headContainsMain: false,
                  blockedBy: [],
                  closingIssues: [],
                },
              ],
            },
            {
              environment: "staging",
              status: "success",
              statusAt: "2026-08-17T16:15:00.000Z",
              sha: "staging-release",
              reachableFromMain: true,
              newlyContainedPullRequests: [],
            },
            {
              environment: "production",
              status: "success",
              statusAt: "2026-08-17T16:30:00.000Z",
              sha: "detached-release",
              reachableFromMain: false,
              newlyContainedPullRequests: [],
            },
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
      "github:2026-08-16T17:30:00.000Z:2026-08-17T17:30:00.000Z",
      "deployments:2026-08-16T17:30:00.000Z:2026-08-17T17:30:00.000Z",
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
            description:
              "3 changes reached production; 1 meaningful change landed; 2 items need attention; 11 efforts are still moving.",
            color: 5793266,
            fields: [
              {
                name: "Released — Live in production",
                value:
                  "[Finish completed delivery reporting is released.](https://github.com/rajat2006/unshelf/pull/116)\n[Repair production sign-in is released.](https://github.com/rajat2006/unshelf/pull/121)\n[Ship the digest foundation is released.](https://github.com/rajat2006/unshelf/pull/123)",
              },
              {
                name: "Completed — Merged and ready for a release",
                value:
                  "[Include the window start is completed.](https://github.com/rajat2006/unshelf/pull/117)",
              },
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
