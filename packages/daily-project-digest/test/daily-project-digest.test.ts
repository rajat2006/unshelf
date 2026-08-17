import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDiscordWebhookAdapter,
  createGitHubActionsPreviewAdapters,
  createOpenAIResponsesAdapter,
  runDailyProjectDigest,
  type DeliveryAdapters,
  type DiscordPayload,
} from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function deliveryAdaptersWithOpenAI(
  openai: DeliveryAdapters["openai"],
): DeliveryAdapters {
  return {
    clock: { now: () => new Date("2026-08-17T17:30:00.000Z") },
    github: {
      listPullRequests: () =>
        Promise.resolve([
          {
            state: "OPEN" as const,
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
    summary: { availability: "unavailable" },
    openai,
    discord: { deliver: () => Promise.resolve() },
  };
}

const validPresentationItem = {
  subjectId: "pull-request:202",
  sentence: "Improves the learning plan overview for readers.",
  audienceGroup: "standard",
  citations: ["title"],
} as const;

describe("Daily Project Digest", () => {
  it("delivers production releases alongside completed and active work", async () => {
    vi.useFakeTimers();
    const retryClockStart = Date.now();
    const trace: string[] = [];
    let deliveredPayload: DiscordPayload | undefined;
    let aiInput: unknown;
    const webhookRequests: Array<{ url: string; body: unknown }> = [];
    let webhookAttempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (typeof init?.body !== "string") {
          throw new Error("Expected a serialized Discord payload.");
        }
        webhookAttempt += 1;
        webhookRequests.push({
          url:
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          body: JSON.parse(init.body) as unknown,
        });
        if (webhookAttempt === 1) {
          const interruptedRateLimit = new Response(
            JSON.stringify({ retry_after: 0.25 }),
            {
              status: 429,
              headers: { "Content-Type": "application/json" },
            },
          );
          vi.spyOn(interruptedRateLimit, "text").mockRejectedValue(
            new TypeError("response stream interrupted"),
          );
          return Promise.resolve(interruptedRateLimit);
        }
        if (webhookAttempt === 2) {
          return Promise.resolve(
            new Response(JSON.stringify({ retry_after: 0.25 }), {
              status: 429,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          Response.json({
            id: "123456789012345678",
            channel_id: "234567890123456789",
            webhook_id: "345678901234567890",
            author: { id: "345678901234567890" },
            content: "",
            timestamp: "2026-08-17T17:30:01.000Z",
            type: 0,
          }),
        );
      }),
    );
    const webhook = createDiscordWebhookAdapter({
      webhookUrl:
        "https://discord.com/api/webhooks/345678901234567890/secret-token",
    });
    const adapters: DeliveryAdapters = {
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
            {
              state: "OPEN",
              mergedAt: null,
              number: 131,
              title: "Document a child decision for the deployment map",
              baseRefName: "dev",
              headRefName: "docs/legacy-wayfinder-child-decision",
              headRepository: "rajat2006/unshelf",
              labels: ["wayfinder:artifact"],
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
      summary: { availability: "unavailable" },
      discord: {
        deliver: async (payload) => {
          trace.push("discord");
          deliveredPayload = payload;
          await webhook.deliver(payload);
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
                  "Maps the key decisions for reliable project updates.",
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
                sentence: "Makes delivery outcomes visible in each digest.",
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
    };

    const run = runDailyProjectDigest({ mode: "deliver" }, adapters);
    await vi.runAllTimersAsync();
    const result = await run;

    expect(result.aiPresentation).toBe("applied");
    expect(trace).toEqual([
      "clock",
      "github:2026-08-16T17:30:00.000Z:2026-08-17T17:30:00.000Z",
      "deployments:2026-08-16T17:30:00.000Z:2026-08-17T17:30:00.000Z",
      "openai",
      "discord",
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
      mode: "deliver",
      windowEnd: "2026-08-17T17:30:00.000Z",
      aiPresentation: "applied",
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
                  "[Makes delivery outcomes visible in each digest.](https://github.com/rajat2006/unshelf/pull/116)\n[Restores sign-in for Unshelf users.](https://github.com/rajat2006/unshelf/pull/121)",
              },
              {
                name: "Completed — Merged and ready for a release",
                value:
                  "[Sets the direction for dependable daily project updates.](https://github.com/rajat2006/unshelf/issues/98)\n[Includes changes arriving exactly at the window start.](https://github.com/rajat2006/unshelf/pull/117)",
              },
              {
                name: "Blocked — Needs attention before work can continue",
                value:
                  "[Maps the key decisions for reliable project updates.](https://github.com/rajat2006/unshelf/issues/99)\n[Makes the preview wording clearer for Discord readers.](https://github.com/rajat2006/unshelf/pull/103)",
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
              text: "Updates are based on authoritative GitHub activity. · Digest 20260817T173000000Z",
            },
            timestamp: "2026-08-17T17:30:00.000Z",
          },
        ],
      },
    });
    expect(deliveredPayload).toBe(result.payload);
    expect(webhookRequests).toHaveLength(3);
    expect(Date.now() - retryClockStart).toBe(1_250);
    expect(webhookRequests.map((request) => request.url)).toEqual([
      "https://discord.com/api/webhooks/345678901234567890/secret-token?wait=true",
      "https://discord.com/api/webhooks/345678901234567890/secret-token?wait=true",
      "https://discord.com/api/webhooks/345678901234567890/secret-token?wait=true",
    ]);
    expect(webhookRequests.map((request) => request.body)).toEqual([
      result.payload,
      result.payload,
      result.payload,
    ]);
  });

  it("falls back for the whole digest when any AI item is invalid", async () => {
    const openai = vi.fn(() =>
      Promise.resolve({
        schemaVersion: "1",
        items: [
          {
            subjectId: "pull-request:201",
            sentence: "Improves workspace upkeep for the project.",
            audienceGroup: "internal_maintenance",
            citations: ["title"],
          },
          {
            subjectId: "pull-request:202",
            sentence:
              "Updates what ships, lands, deploys, releases, completes, blocks, and merges.",
            audienceGroup: "standard",
            citations: ["title"],
          },
        ],
      }),
    );
    let deliveredPayload: DiscordPayload | undefined;
    const adapters: DeliveryAdapters = {
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
      summary: { availability: "unavailable" },
      openai: { generatePresentation: openai },
      discord: {
        deliver: (payload) => {
          deliveredPayload = payload;
          return Promise.resolve();
        },
      },
    };

    const result = await runDailyProjectDigest({ mode: "deliver" }, adapters);

    expect(openai).toHaveBeenCalledOnce();
    expect(result.aiPresentation).toBe("failed");
    if (result.aiPresentation !== "failed") {
      throw new Error("Expected the AI presentation to fail validation.");
    }
    expect(result.aiFailureReason).toBe("contract-sentence-lifecycle");
    expect(result.aiFailureSubjectId).toBe("pull-request:202");
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
    expect(deliveredPayload).toBe(result.payload);
  });

  it("accepts natural AI wording without a prescribed opening verb", async () => {
    const result = await runDailyProjectDigest(
      { mode: "deliver" },
      deliveryAdaptersWithOpenAI({
        generatePresentation: () =>
          Promise.resolve({
            schemaVersion: "1",
            items: [
              {
                ...validPresentationItem,
                sentence:
                  "Gives learners a clearer view of their learning plans.",
              },
            ],
          }),
      }),
    );

    expect(result.aiPresentation).toBe("applied");
    expect(result.payload.embeds?.[0]?.fields).toEqual([
      {
        name: "In progress — Actively moving forward",
        value:
          "[Gives learners a clearer view of their learning plans.](https://github.com/rajat2006/unshelf/pull/202)",
      },
    ]);
  });

  it.each([
    ["contract-envelope", null, undefined],
    [
      "contract-envelope",
      { schemaVersion: "1", items: [], extra: true },
      undefined,
    ],
    ["contract-schema-version", { schemaVersion: "2", items: [] }, undefined],
    ["contract-items", { schemaVersion: "1", items: null }, undefined],
    [
      "contract-item-shape",
      { schemaVersion: "1", items: [{ subjectId: "pull-request:202" }] },
      "pull-request:202",
    ],
    [
      "contract-sentence-whitespace",
      {
        schemaVersion: "1",
        items: [{ ...validPresentationItem, sentence: " Improves plans." }],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-length",
      {
        schemaVersion: "1",
        items: [{ ...validPresentationItem, sentence: "Improves." }],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-control",
      {
        schemaVersion: "1",
        items: [
          { ...validPresentationItem, sentence: "Improves user\u0007 plans." },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-list",
      {
        schemaVersion: "1",
        items: [
          { ...validPresentationItem, sentence: "- Improves user plans." },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-punctuation",
      {
        schemaVersion: "1",
        items: [{ ...validPresentationItem, sentence: "Improves user plans" }],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-url",
      {
        schemaVersion: "1",
        items: [
          {
            ...validPresentationItem,
            sentence: "Improves plans at https://example.com.",
          },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-markdown",
      {
        schemaVersion: "1",
        items: [
          { ...validPresentationItem, sentence: "Improves *user* plans." },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-mention",
      {
        schemaVersion: "1",
        items: [
          {
            ...validPresentationItem,
            sentence: "Improves plans for @readers.",
          },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-lifecycle",
      {
        schemaVersion: "1",
        items: [
          { ...validPresentationItem, sentence: "Improves completed plans." },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-sentence-prompt-control",
      {
        schemaVersion: "1",
        items: [
          { ...validPresentationItem, sentence: "Improves prompt handling." },
        ],
      },
      "pull-request:202",
    ],
    [
      "contract-duplicate-subject",
      {
        schemaVersion: "1",
        items: [validPresentationItem, validPresentationItem],
      },
      "pull-request:202",
    ],
    [
      "contract-unknown-subject",
      {
        schemaVersion: "1",
        items: [{ ...validPresentationItem, subjectId: "pull-request:999" }],
      },
      undefined,
    ],
    [
      "contract-citation",
      {
        schemaVersion: "1",
        items: [{ ...validPresentationItem, citations: [] }],
      },
      "pull-request:202",
    ],
    [
      "contract-subject-set",
      { schemaVersion: "1", items: [] },
      "pull-request:202",
    ],
  ])(
    "reports %s without exposing AI content",
    async (expectedReason, response, expectedSubjectId) => {
      const result = await runDailyProjectDigest(
        { mode: "deliver" },
        deliveryAdaptersWithOpenAI({
          generatePresentation: () => Promise.resolve(response),
        }),
      );

      expect(result.aiPresentation).toBe("failed");
      if (result.aiPresentation !== "failed") {
        throw new Error("Expected the AI presentation to fail.");
      }
      expect(result.aiFailureReason).toBe(expectedReason);
      expect(result.aiFailureSubjectId).toBe(expectedSubjectId);
      expect(JSON.stringify(result)).not.toContain("Enhances user plans");
    },
  );

  it.each([
    ["request-network", () => Promise.reject(new TypeError("offline"))],
    [
      "response-http-authentication",
      () => Promise.resolve(new Response(null, { status: 401 })),
    ],
    [
      "response-http-rate-limit",
      () => Promise.resolve(new Response(null, { status: 429 })),
    ],
    [
      "response-http-client",
      () => Promise.resolve(new Response(null, { status: 400 })),
    ],
    [
      "response-http-provider",
      () => Promise.resolve(new Response(null, { status: 500 })),
    ],
    ["response-body-json", () => Promise.resolve(new Response("not json"))],
    [
      "response-incomplete",
      () =>
        Promise.resolve(Response.json({ status: "in_progress", output: [] })),
    ],
    [
      "response-envelope",
      () => Promise.resolve(Response.json({ status: "completed" })),
    ],
    [
      "response-refusal",
      () =>
        Promise.resolve(
          Response.json({
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "refusal", refusal: "no" }],
              },
            ],
          }),
        ),
    ],
    [
      "response-output-text",
      () =>
        Promise.resolve(
          Response.json({
            status: "completed",
            output: [{ type: "message", content: [] }],
          }),
        ),
    ],
    [
      "response-output-json",
      () =>
        Promise.resolve(
          Response.json({
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "{" }],
              },
            ],
          }),
        ),
    ],
  ])(
    "reports sanitized provider failure %s",
    async (expectedReason, fetchResult) => {
      vi.stubGlobal("fetch", vi.fn(fetchResult));
      const result = await runDailyProjectDigest(
        { mode: "deliver" },
        deliveryAdaptersWithOpenAI(
          createOpenAIResponsesAdapter({ apiKey: "openai-key" }),
        ),
      );

      expect(result.aiPresentation).toBe("failed");
      if (result.aiPresentation !== "failed") {
        throw new Error("Expected the AI presentation to fail.");
      }
      expect(result.aiFailureReason).toBe(expectedReason);
      expect(result.aiFailureSubjectId).toBeUndefined();
    },
  );

  it.each([
    [
      "request-unexpected",
      { generatePresentation: () => Promise.reject(new Error("secret")) },
    ],
    [
      "contract-unexpected",
      {
        generatePresentation: () =>
          Promise.resolve(
            new Proxy(
              {},
              {
                ownKeys: () => {
                  throw new Error("secret");
                },
              },
            ),
          ),
      },
    ],
  ])(
    "reports sanitized unexpected failure %s",
    async (expectedReason, openai) => {
      const result = await runDailyProjectDigest(
        { mode: "deliver" },
        deliveryAdaptersWithOpenAI(openai),
      );

      expect(result.aiPresentation).toBe("failed");
      if (result.aiPresentation !== "failed") {
        throw new Error("Expected the AI presentation to fail.");
      }
      expect(result.aiFailureReason).toBe(expectedReason);
      expect(JSON.stringify(result)).not.toContain("secret");
    },
  );

  it("previews the exact payload without invoking Discord", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T17:30:00.000Z"));
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "daily-project-digest-preview-"),
    );
    const summaryPath = join(temporaryDirectory, "summary.md");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.endsWith("/graphql")) {
          if (typeof init?.body !== "string") {
            throw new Error("Expected a serialized GitHub GraphQL request.");
          }
          const request = JSON.parse(init.body) as {
            query?: unknown;
          };
          const query = String(request.query);
          const pageSize = Number(
            query.match(/pullRequests\(states: OPEN, first: (\d+)/)?.[1],
          );
          const possibleNodesPerPullRequest = 10_201;
          if (pageSize * possibleNodesPerPullRequest > 500_000) {
            return Promise.resolve(
              Response.json({
                errors: [
                  {
                    type: "MAX_NODE_LIMIT_EXCEEDED",
                    message: "Query exceeds GitHub's maximum node limit.",
                  },
                ],
              }),
            );
          }
          return Promise.resolve(
            Response.json({
              data: {
                repository: {
                  ref: { target: { oid: "a".repeat(40) } },
                  pullRequests: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes: [
                      {
                        number: 202,
                        title: "Improve the learning plan overview",
                        baseRefName: "dev",
                        headRefName: "agent/learning-plan-overview",
                        headRefOid: "b".repeat(40),
                        headRepository: { nameWithOwner: "rajat2006/unshelf" },
                        isDraft: false,
                        labels: {
                          pageInfo: { hasNextPage: false },
                          nodes: [],
                        },
                        closingIssuesReferences: {
                          pageInfo: { hasNextPage: false },
                          nodes: [],
                        },
                      },
                    ],
                  },
                },
              },
            }),
          );
        }
        if (url.includes("/pulls?state=closed")) {
          return Promise.resolve(Response.json([]));
        }
        if (url.endsWith("/git/ref/heads/main")) {
          return Promise.resolve(
            Response.json({ object: { sha: "a".repeat(40) } }),
          );
        }
        if (url.includes("/deployments?environment=production")) {
          return Promise.resolve(Response.json([]));
        }
        if (url.includes("/issues?labels=wayfinder%3Amap")) {
          return Promise.resolve(Response.json([]));
        }
        if (url.includes("/issues/202/dependencies/blocked_by")) {
          return Promise.resolve(Response.json([]));
        }
        if (url === "https://api.openai.com/v1/responses") {
          return Promise.reject(
            new DOMException("The operation timed out.", "TimeoutError"),
          );
        }
        throw new Error(`Unexpected GitHub request: ${url}`);
      }),
    );
    const adapters = createGitHubActionsPreviewAdapters({
      token: "github-token",
      repository: "rajat2006/unshelf",
      summaryPath,
      openaiApiKey: "openai-key",
    });

    try {
      const result = await runDailyProjectDigest({ mode: "preview" }, adapters);

      expect(result.payload).toEqual({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: "Daily Project Digest",
            description: "1 effort is moving forward.",
            color: 5793266,
            fields: [
              {
                name: "In progress — Actively moving forward",
                value:
                  "[In progress: Improve the learning plan overview.](https://github.com/rajat2006/unshelf/pull/202)",
              },
            ],
            footer: {
              text: "Updates are based on authoritative GitHub activity. · Digest 20260817T173000000Z",
            },
            timestamp: "2026-08-17T17:30:00.000Z",
          },
        ],
      });
      expect(await readFile(summaryPath, "utf8")).toContain(
        JSON.stringify(result.payload, null, 2),
      );
      expect(result.aiPresentation).toBe("failed");
      if (result.aiPresentation !== "failed") {
        throw new Error("Expected the AI presentation to time out.");
      }
      expect(result.aiFailureReason).toBe("request-timeout");
      expect(adapters.discord).toEqual({ availability: "unavailable" });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
