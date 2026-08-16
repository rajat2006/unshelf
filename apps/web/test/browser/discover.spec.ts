import { expect, test } from "@playwright/test";
import { Type, type DiscoverWorkspace } from "@unshelf/shared";

const workspace = {
  follows: [
    {
      id: "00000000-0000-0000-0000-000000000010",
      provider: "youtube",
      lifecycle: "active",
      name: "Quiet Learning",
      targetUrl: "https://youtube.com/@quietlearning",
      createdAt: "2026-08-16T12:00:00.000Z",
      health: {
        latestAttemptAt: "2026-08-16T12:05:00.000Z",
        latestAttemptOutcome: "complete",
        latestCompleteAt: "2026-08-16T12:05:00.000Z",
        verifiedCoverageStartedAt: "2026-07-17T12:00:00.000Z",
        nextEligibleAt: null,
      },
    },
    {
      id: "00000000-0000-0000-0000-000000000011",
      provider: "youtube",
      lifecycle: "active",
      name: "Systems Studio",
      targetUrl: "https://youtube.com/@systemsstudio",
      createdAt: "2026-08-16T12:01:00.000Z",
      health: {
        latestAttemptAt: null,
        latestAttemptOutcome: null,
        latestCompleteAt: null,
        verifiedCoverageStartedAt: null,
        nextEligibleAt: null,
      },
    },
  ],
  discoveries: [
    {
      id: "00000000-0000-0000-0000-000000000020",
      candidateId: "00000000-0000-0000-0000-000000000030",
      followId: "00000000-0000-0000-0000-000000000010",
      followName: "Quiet Learning",
      state: "new",
      title: "A deep module",
      source: "https://www.youtube.com/watch?v=video-1",
      publisher: "Quiet Learning",
      publishedAt: "2026-08-15T10:00:00.000Z",
      durationSeconds: 601,
      type: Type.Video,
      thumbnailUrl: null,
      discoveredAt: "2026-08-16T12:00:00.000Z",
    },
  ],
} as DiscoverWorkspace;

test("Discover reflows Follow controls without phone-width overflow", async ({
  page,
}, testInfo) => {
  await page.route("**/api/discover", (route) =>
    route.fulfill({ json: workspace }),
  );
  await page.goto(
    `/test/browser/?testUser=${testInfo.project.name}-discover&surface=discover`,
  );

  const follows = page.getByRole("complementary", { name: "Follows" });
  const intake = page.getByRole("heading", { name: "Intake" });
  await expect(follows).toBeVisible();
  await expect(intake).toBeVisible();
  const followBox = await follows.boundingBox();
  const intakeBox = await intake.boundingBox();
  expect(followBox).not.toBeNull();
  expect(intakeBox).not.toBeNull();

  if (testInfo.project.name === "phone") {
    expect(followBox!.y).toBeLessThan(intakeBox!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } else {
    expect(followBox!.x).toBeLessThan(intakeBox!.x);
  }
});
