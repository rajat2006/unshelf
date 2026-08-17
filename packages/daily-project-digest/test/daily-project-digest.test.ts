import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGitHubActionsPreviewAdapters,
  runDailyProjectDigest,
  type DiscordPayload,
  type PreviewAdapters,
} from "../src/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Daily Project Digest preview", () => {
  it("previews production releases alongside completed and active work", async () => {
    const trace: string[] = [];
    let summarizedPayload: DiscordPayload | undefined;
    let aiInput: unknown;
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
            {
              state: "OPEN",
              mergedAt: null,
              number: 126,
              title: "Maintain the digest decision documents",
              baseRefName: "dev",
              headRefName: "wayfinder/map-100-decision-documents",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: true,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
            {
              state: "MERGED",
              mergedAt: "2026-08-17T14:30:00.000Z",
              number: 127,
              title: "Preserve the digest planning prototype",
              baseRefName: "dev",
              headRefName: "wayfinder/map-98-research-and-prototypes",
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
              number: 130,
              title: "Keep a fork with a copied artifact branch visible",
              baseRefName: "dev",
              headRefName: "wayfinder/map-100-decision-documents",
              headRepository: "contributor/unshelf",
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
        listWayfinderMaps: () => {
          return Promise.resolve([
            {
              state: "CLOSED",
              stateReason: "COMPLETED",
              closedAt: "2026-08-17T11:00:00.000Z",
              number: 98,
              title: "Choose the Daily Project Digest direction",
              labels: ["wayfinder:map"],
              children: [{ state: "CLOSED", labels: [], blockedBy: [] }],
            },
            {
              state: "OPEN",
              stateReason: null,
              closedAt: null,
              number: 99,
              title: "Plan reliable project updates",
              labels: ["wayfinder:map"],
              children: [
                {
                  state: "OPEN",
                  labels: [],
                  blockedBy: [{ state: "OPEN" }],
                },
                {
                  state: "OPEN",
                  labels: ["needs-info"],
                  blockedBy: [],
                },
                { state: "CLOSED", labels: [], blockedBy: [] },
              ],
            },
            {
              state: "OPEN",
              stateReason: null,
              closedAt: null,
              number: 100,
              title: "Shape the next Unshelf experience",
              labels: ["wayfinder:map"],
              children: [
                {
                  state: "OPEN",
                  labels: ["agent:blocked"],
                  blockedBy: [],
                },
                { state: "OPEN", labels: [], blockedBy: [] },
              ],
            },
            {
              state: "CLOSED",
              stateReason: "COMPLETED",
              closedAt: "2026-08-17T17:30:00.000Z",
              number: 128,
              title: "Exclude a map closed at the window end",
              labels: ["wayfinder:map"],
              children: [],
            },
            {
              state: "CLOSED",
              stateReason: "NOT_PLANNED",
              closedAt: "2026-08-17T10:00:00.000Z",
              number: 129,
              title: "Exclude an abandoned map",
              labels: ["wayfinder:map"],
              children: [],
            },
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
                {
                  state: "MERGED",
                  mergedAt: "2026-08-17T14:30:00.000Z",
                  number: 127,
                  title: "Preserve the digest planning prototype",
                  baseRefName: "dev",
                  headRefName: "wayfinder/map-98-research-and-prototypes",
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
      openai: {
        generatePresentation: (input) => {
          trace.push("openai");
          aiInput = input;
          return Promise.resolve({
            schemaVersion: "1",
            items: [
              {
                subjectId: "wayfinder-map:98",
                sentence:
                  "Sets the direction for dependable daily project updates.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "wayfinder-map:99",
                sentence:
                  "Maps the remaining decisions for reliable project updates.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "wayfinder-map:100",
                sentence:
                  "Shapes the next Unshelf experience around learner needs.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:101",
                sentence:
                  "Keeps draft delivery work visible in the project update.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:102",
                sentence:
                  "Provisions the access needed by the digest automation.",
                audienceGroup: "internal_maintenance",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:103",
                sentence:
                  "Makes the preview wording clearer for Discord readers.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:104",
                sentence:
                  "Prevents unrelated issue mentions from stopping delivery work.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:105",
                sentence: "Restores sign-in for Unshelf users.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              ...["A", "B", "C", "D", "E", "F", "G", "H"].map(
                (title, index) => ({
                  subjectId: `pull-request:${108 + index}`,
                  sentence: `Moves delivery effort ${title} toward its intended outcome.`,
                  audienceGroup: "standard" as const,
                  citations: ["title"],
                }),
              ),
              {
                subjectId: "pull-request:116",
                sentence:
                  "Makes finished delivery work visible in each digest.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:117",
                sentence:
                  "Includes changes arriving exactly at the window start.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:121",
                sentence: "Restores sign-in for Unshelf users.",
                audienceGroup: "standard",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:123",
                sentence:
                  "Establishes the dependable foundation for digest automation.",
                audienceGroup: "internal_maintenance",
                citations: ["title"],
              },
              {
                subjectId: "pull-request:130",
                sentence:
                  "Keeps contributor planning work visible as delivery work.",
                audienceGroup: "standard",
                citations: ["title"],
              },
            ],
          });
        },
      },
      discord: { availability: "unavailable" },
    };

    const result = await runDailyProjectDigest({ mode: "preview" }, adapters);

    expect(trace).toEqual([
      "clock",
      "github:2026-08-16T17:30:00.000Z:2026-08-17T17:30:00.000Z",
      "deployments:2026-08-16T17:30:00.000Z:2026-08-17T17:30:00.000Z",
      "openai",
      "summary",
    ]);
    expect(aiInput).toEqual({
      schemaVersion: "1",
      subjects: [
        {
          subjectId: "wayfinder-map:98",
          kind: "wayfinder-map",
          facts: [
            {
              id: "title",
              value: "Choose the Daily Project Digest direction",
              source: "github_untrusted",
            },
          ],
        },
        {
          subjectId: "wayfinder-map:99",
          kind: "wayfinder-map",
          facts: [
            {
              id: "title",
              value: "Plan reliable project updates",
              source: "github_untrusted",
            },
          ],
        },
        {
          subjectId: "wayfinder-map:100",
          kind: "wayfinder-map",
          facts: [
            {
              id: "title",
              value: "Shape the next Unshelf experience",
              source: "github_untrusted",
            },
          ],
        },
        ...[
          [101, "Keep draft delivery work visible"],
          [102, "Provision digest access"],
          [103, "Shape the preview wording"],
          [104, "Ignore an arbitrary blocked issue mention"],
          [105, "Repair production sign-in"],
          [108, "A"],
          [109, "B"],
          [110, "C"],
          [111, "D"],
          [112, "E"],
          [113, "F"],
          [114, "G"],
          [115, "H"],
          [116, "Finish completed delivery reporting"],
          [117, "Include the window start"],
          [121, "Repair production sign-in"],
          [123, "Ship the digest foundation"],
          [130, "Keep a fork with a copied artifact branch visible"],
        ].map(([number, title]) => ({
          subjectId: `pull-request:${number}`,
          kind: "pull-request",
          facts: [{ id: "title", value: title, source: "github_untrusted" }],
        })),
      ],
    });
    expect(result).toEqual({
      mode: "preview",
      windowEnd: "2026-08-17T17:30:00.000Z",
      payload: {
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "Daily Project Digest",
            description:
              "3 changes reached production; 2 meaningful changes landed; 3 items need attention; 13 efforts are still moving.",
            color: 5793266,
            fields: [
              {
                name: "Released — Live in production",
                value:
                  "[Makes finished delivery work visible in each digest.](https://github.com/rajat2006/unshelf/pull/116)\n[Restores sign-in for Unshelf users.](https://github.com/rajat2006/unshelf/pull/121)",
              },
              {
                name: "Completed — Merged and ready for a release",
                value:
                  "[Sets the direction for dependable daily project updates.](https://github.com/rajat2006/unshelf/issues/98)\n[Includes changes arriving exactly at the window start.](https://github.com/rajat2006/unshelf/pull/117)",
              },
              {
                name: "Blocked — Needs attention before work can continue",
                value:
                  "[Maps the remaining decisions for reliable project updates.](https://github.com/rajat2006/unshelf/issues/99)\n[Makes the preview wording clearer for Discord readers.](https://github.com/rajat2006/unshelf/pull/103)",
              },
              {
                name: "In progress — Actively moving forward",
                value:
                  "[Shapes the next Unshelf experience around learner needs.](https://github.com/rajat2006/unshelf/issues/100)\n[Keeps draft delivery work visible in the project update.](https://github.com/rajat2006/unshelf/pull/101)\n[Prevents unrelated issue mentions from stopping delivery work.](https://github.com/rajat2006/unshelf/pull/104)\n[Restores sign-in for Unshelf users.](https://github.com/rajat2006/unshelf/pull/105)\n[Moves delivery effort A toward its intended outcome.](https://github.com/rajat2006/unshelf/pull/108)\n[Moves delivery effort B toward its intended outcome.](https://github.com/rajat2006/unshelf/pull/109)\n[Moves delivery effort C toward its intended outcome.](https://github.com/rajat2006/unshelf/pull/110)\n[Moves delivery effort D toward its intended outcome.](https://github.com/rajat2006/unshelf/pull/111)\n[+ 5 more on GitHub](https://github.com/rajat2006/unshelf/pulls?q=is%3Apr+is%3Aopen+-label%3Aagent%3Ablocked+-label%3Aagent%3Aqueued+-label%3Aneeds-info)",
              },
              {
                name: "Internal maintenance — Keeps the project healthy",
                value:
                  "[Provisions the access needed by the digest automation.](https://github.com/rajat2006/unshelf/pull/102) — Blocked\n[Establishes the dependable foundation for digest automation.](https://github.com/rajat2006/unshelf/pull/123) — Released",
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

  it("falls back for the whole digest when any AI item is invalid", async () => {
    const openai = vi.fn(() =>
      Promise.resolve({
        schemaVersion: "1",
        items: [
          {
            subjectId: "pull-request:201",
            sentence: "Improves dependency upkeep for the project.",
            audienceGroup: "internal_maintenance",
            citations: ["title"],
          },
          {
            subjectId: "pull-request:202",
            sentence: "The learning plan overview is live for everyone.",
            audienceGroup: "standard",
            citations: ["title"],
          },
        ],
      }),
    );
    const adapters: PreviewAdapters = {
      clock: { now: () => new Date("2026-08-17T17:30:00.000Z") },
      github: {
        listPullRequests: () =>
          Promise.resolve([
            {
              state: "MERGED",
              mergedAt: "2026-08-17T12:00:00.000Z",
              number: 201,
              title: "Refresh workspace dependencies",
              baseRefName: "dev",
              headRefName: "agent/dependency-refresh",
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
              number: 202,
              title: "Improve the learning plan overview",
              baseRefName: "dev",
              headRefName: "agent/learning-plan-overview",
              headRepository: "rajat2006/unshelf",
              labels: [],
              isDraft: false,
              headContainsMain: false,
              blockedBy: [],
              closingIssues: [],
            },
          ]),
        listDeployments: () => Promise.resolve([]),
        listWayfinderMaps: () => Promise.resolve([]),
      },
      summary: { writePreview: () => Promise.resolve() },
      openai: { generatePresentation: openai },
      discord: { availability: "unavailable" },
    };

    const result = await runDailyProjectDigest({ mode: "preview" }, adapters);

    expect(openai).toHaveBeenCalledOnce();
    expect(result.payload.embeds?.[0]?.fields).toEqual([
      {
        name: "Completed — Merged and ready for a release",
        value:
          "[Completed: Refresh workspace dependencies.](https://github.com/rajat2006/unshelf/pull/201)",
      },
      {
        name: "In progress — Actively moving forward",
        value:
          "[In progress: Improve the learning plan overview.](https://github.com/rajat2006/unshelf/pull/202)",
      },
    ]);
  });

  it("gathers complete Wayfinder map routes and their explicit blockers", async () => {
    const closedRoutes = Array.from({ length: 100 }, (_, index) => ({
      number: 500 + index,
      state: "closed",
      labels: [],
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        let value: unknown;
        if (url.pathname.endsWith("/issues")) {
          value = [
            {
              number: 424,
              title: "Wayfinder: publish a Daily Project Digest to Discord",
              state: "open",
              state_reason: "reopened",
              closed_at: null,
              labels: [{ name: "wayfinder:map" }],
            },
          ];
        } else if (url.pathname.endsWith("/issues/424/sub_issues")) {
          value =
            url.searchParams.get("page") === "1"
              ? closedRoutes
              : [
                  {
                    number: 700,
                    state: "open",
                    labels: [{ name: "needs-info" }],
                  },
                ];
        } else if (
          url.pathname.endsWith("/issues/700/dependencies/blocked_by")
        ) {
          value = [{ state: "open" }];
        } else {
          throw new Error(`Unexpected GitHub request: ${url.pathname}`);
        }
        return Promise.resolve(
          new Response(JSON.stringify(value), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
    const adapters = createGitHubActionsPreviewAdapters({
      token: "github-token",
      repository: "rajat2006/unshelf",
      summaryPath: "/tmp/daily-project-digest-test-summary",
    });

    const maps = await adapters.github.listWayfinderMaps({
      windowStart: new Date("2026-08-16T17:30:00.000Z"),
      windowEnd: new Date("2026-08-17T17:30:00.000Z"),
    });

    expect(maps).toEqual([
      {
        state: "OPEN",
        stateReason: "REOPENED",
        closedAt: null,
        number: 424,
        title: "Wayfinder: publish a Daily Project Digest to Discord",
        labels: ["wayfinder:map"],
        children: [
          ...closedRoutes.map(() => ({
            state: "CLOSED" as const,
            labels: [],
            blockedBy: [],
          })),
          {
            state: "OPEN",
            labels: ["needs-info"],
            blockedBy: [{ state: "OPEN" }],
          },
        ],
      },
    ]);
  });
});
