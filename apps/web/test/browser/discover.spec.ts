import { expect, test } from "@playwright/test";
import { Type, type DiscoverWorkspace } from "@unshelf/shared";
import { testAppUrl } from "./test-helpers";

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
      priorDecisions: { kept: 0, dismissed: 0 },
    },
  ],
} as DiscoverWorkspace;

test("the production entry in normal Vite development exposes the Discover route and starts app-open acquisition once after stored state renders", async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  let workspaceReadsAtAcquisition = 0;
  await page.addInitScript(() => {
    const fetchFromWindow = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        requestUrl.endsWith("/api/discover/acquisitions") &&
        init?.body === '{"trigger":"app_open"}'
      ) {
        window.sessionStorage.setItem(
          "stored-visible-at-app-open",
          String(document.body.innerText.includes("A deep module")),
        );
      }
      return fetchFromWindow(input, init);
    };
  });
  await page.route("**/api/discover", async (route) => {
    requests.push("workspace");
    await route.fulfill({ json: workspace });
  });
  await page.route("**/api/discover/acquisitions", async (route) => {
    workspaceReadsAtAcquisition = requests.filter(
      (value) => value === "workspace",
    ).length;
    requests.push(`acquisition:${route.request().postData()}`);
    await route.fulfill({ json: { ok: true, acquisitions: [] } });
  });

  await page.goto(
    testAppUrl("/discover", `${testInfo.project.name}-app-open-discover`),
  );
  await expect(page.getByText("A deep module")).toBeVisible();
  await expect
    .poll(
      () => requests.filter((value) => value.startsWith("acquisition:")).length,
    )
    .toBe(1);
  expect(requests[0]).toBe("workspace");
  expect(requests.find((value) => value.startsWith("acquisition:"))).toBe(
    'acquisition:{"trigger":"app_open"}',
  );
  expect(
    await page.evaluate(
      () => sessionStorage.getItem("stored-visible-at-app-open") === "true",
    ),
  ).toBe(true);
  await expect
    .poll(() => requests.filter((value) => value === "workspace").length)
    .toBeGreaterThan(workspaceReadsAtAcquisition);

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(50);

  expect(
    requests.filter((value) => value.startsWith("acquisition:")),
  ).toHaveLength(1);
});

test("a User can manage several Follows and decide the combined Discover intake", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-discover-journey`;
  let appOpenCount = 0;
  await page.clock.setFixedTime(new Date("2026-08-16T12:00:00.000Z"));
  await page.addInitScript(() => {
    const fetchFromWindow = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        requestUrl.endsWith("/api/discover/acquisitions") &&
        init?.body === '{"trigger":"app_open"}'
      ) {
        window.sessionStorage.setItem(
          "empty-state-visible-at-app-open",
          String(
            document.body.innerText.includes("Public YouTube channel URL"),
          ),
        );
      }
      return fetchFromWindow(input, init);
    };
  });
  await page.route("**/api/discover/acquisitions", async (route) => {
    if (route.request().postData() === '{"trigger":"app_open"}') {
      appOpenCount += 1;
    }
    await route.continue();
  });
  await page.goto(testAppUrl("/discover", user));

  const channelUrl = page.getByRole("textbox", {
    name: "Public YouTube channel URL",
  });
  await expect.poll(() => appOpenCount).toBe(1);
  expect(
    await page.evaluate(
      () =>
        sessionStorage.getItem("empty-state-visible-at-app-open") === "true",
    ),
  ).toBe(true);
  await channelUrl.fill("https://youtube.com/@quietlearning");
  await page.getByRole("button", { name: "Preview channel" }).click();
  const quietPreview = page.getByRole("dialog", { name: "Quiet Learning" });
  await expect(quietPreview.getByText("A deep module")).toBeVisible();
  expect(
    await quietPreview.evaluate((dialog) =>
      dialog.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(
    await quietPreview.evaluate((dialog) =>
      dialog.contains(document.activeElement),
    ),
  ).toBe(true);
  await quietPreview.getByRole("button", { name: "Follow channel" }).click();
  await expect(page.getByText("A deep module", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Follow another channel" }).click();
  await channelUrl.fill("https://youtube.com/@systemsstudio");
  await page.getByRole("button", { name: "Preview channel" }).click();
  const systemsPreview = page.getByRole("dialog", {
    name: "Systems Studio",
  });
  await expect(systemsPreview.getByText("Understand queues")).toBeVisible();
  await systemsPreview.getByRole("button", { name: "Follow channel" }).click();
  await expect(
    page.getByText("Understand queues", { exact: true }),
  ).toBeVisible();

  const candidateFeed = page.getByRole("region", { name: "Candidate feed" });
  const intakeHeading = page.getByRole("heading", { name: "Intake" });
  await expect
    .poll(() =>
      candidateFeed.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);
  const intakeTop = await intakeHeading.boundingBox();
  await candidateFeed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect((await intakeHeading.boundingBox())?.y).toBe(intakeTop?.y);

  await page.getByRole("button", { name: "Refresh all" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Systems Studio could not refresh completely",
  );
  const followRail = page.getByRole("complementary", { name: "Follows" });
  await expect(
    followRail.getByRole("button", {
      name: /^(Refresh|Retry|Pause|Resume|Remove) /,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Manage Follow health" }).click();
  let healthDialog = page.getByRole("dialog", {
    name: "Manage Follow health",
  });
  await healthDialog
    .getByRole("button", { name: "Retry Systems Studio" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Systems Studio could not refresh completely",
  );
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Systems Studio.*2/ }).click();
  const queuesCard = page
    .getByRole("listitem")
    .filter({ hasText: "Understand queues" });
  await queuesCard.getByRole("button", { name: "Later" }).click();
  await expect(queuesCard.getByText("seen", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss 2" }).click();
  await expect(page.getByText("Systems Studio is clear.")).toBeVisible();

  await page.getByRole("button", { name: "Manage Follow health" }).click();
  healthDialog = page.getByRole("dialog", { name: "Manage Follow health" });
  await healthDialog
    .getByRole("button", { name: "Pause Systems Studio" })
    .click();
  await expect(
    healthDialog.getByRole("button", { name: "Resume Systems Studio" }),
  ).toBeVisible();
  await healthDialog
    .getByRole("button", { name: "Resume Systems Studio" })
    .click();
  await expect(
    healthDialog.getByRole("button", { name: "Remove Systems Studio" }),
  ).toBeVisible();
  await healthDialog
    .getByRole("button", { name: "Remove Systems Studio" })
    .click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^All Follows/ }).click();
  const keepCard = page
    .getByRole("listitem")
    .filter({ hasText: "A deep module" });
  await keepCard.getByRole("button", { name: "Keep" }).click();
  const keepDialog = page.getByRole("dialog", { name: "Keep in Library" });
  await keepDialog
    .getByRole("textbox", { name: "Item title" })
    .fill("My approved deep module");
  await keepDialog.getByRole("button", { name: "Keep in Library" }).click();
  await expect(page).toHaveURL(/\/test\/browser\/items\//);
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL(/\/test\/browser\/discover/);

  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "Discovery history" });
  await expect(history.getByText("A deep module")).toBeVisible();
  await expect(history.getByText("Dismissed").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Discover keeps its chrome stationary while only the Candidate feed scrolls", async ({
  page,
}, testInfo) => {
  const longFollows = [
    ...workspace.follows,
    ...Array.from({ length: 20 }, (_, index) => ({
      ...workspace.follows[index % workspace.follows.length],
      id: `00000000-0000-0000-0001-${String(index + 1).padStart(12, "0")}`,
      name: `Learning channel ${index + 1}`,
    })),
  ];
  const discoveries = Array.from({ length: 12 }, (_, index) => ({
    ...workspace.discoveries[0],
    id: `00000000-0000-0000-0000-${String(index + 20).padStart(12, "0")}`,
    candidateId: `00000000-0000-0000-0000-${String(index + 40).padStart(12, "0")}`,
    title: `A deep module ${index + 1}`,
  }));
  await page.route("**/api/discover", (route) =>
    route.fulfill({
      json: { ...workspace, follows: longFollows, discoveries },
    }),
  );
  await page.route("**/api/discover/acquisitions", (route) =>
    route.fulfill({ json: { ok: true, acquisitions: [] } }),
  );
  await page.goto(
    testAppUrl("/discover", `${testInfo.project.name}-discover-layout`),
  );

  const follows = page.getByRole("complementary", { name: "Follows" });
  const intake = page.getByRole("heading", { name: "Intake" });
  const discoverHeading = page.getByRole("heading", {
    name: "Discover",
    level: 1,
  });
  const intakeControls = page.getByLabel("Filtered intake actions");
  const productTopBar = page
    .getByRole("banner")
    .filter({ has: page.getByRole("navigation", { name: "Primary rooms" }) });
  await expect(follows).toBeVisible();
  await expect(intake).toBeVisible();
  await expect(productTopBar).toBeVisible();
  const followBox = await follows.boundingBox();
  const intakeBox = await intake.boundingBox();
  expect(followBox).not.toBeNull();
  expect(intakeBox).not.toBeNull();

  const feed = page.getByRole("region", { name: "Candidate feed" });
  const feedBox = await feed.boundingBox();
  expect(feedBox).not.toBeNull();
  expect(feedBox!.height).toBeGreaterThan(0);
  expect(
    await feed.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);

  const stationaryBefore = await Promise.all(
    [productTopBar, discoverHeading, intakeControls, follows].map((locator) =>
      locator.boundingBox(),
    ),
  );
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const stationaryAfter = await Promise.all(
    [productTopBar, discoverHeading, intakeControls, follows].map((locator) =>
      locator.boundingBox(),
    ),
  );
  expect(stationaryAfter).toEqual(stationaryBefore);

  if (testInfo.project.name === "phone") {
    expect(followBox!.y).toBeLessThan(intakeBox!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } else {
    expect(followBox!.x).toBeLessThan(intakeBox!.x);
    expect(feedBox!.height).toBeGreaterThan(400);
    const visibleCandidates = await feed.evaluate((feedElement) => {
      const feedBounds = feedElement.getBoundingClientRect();
      return Array.from(feedElement.querySelectorAll("li")).filter((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.top < feedBounds.bottom && bounds.bottom > feedBounds.top;
      }).length;
    });
    expect(visibleCandidates).toBeGreaterThanOrEqual(6);
    expect(
      await page
        .getByTestId("follow-filter-list")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    const followList = page.getByTestId("follow-filter-list");
    const pageHeightBefore = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await followList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await followList.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    expect(await follows.boundingBox()).toEqual(followBox);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(pageHeightBefore);
  }
});
