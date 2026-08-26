import { expect, test } from "@playwright/test";
import { testAppUrl } from "./test-helpers";

test("Discover preserves the accepted desktop intake and scroll contract", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout contract");

  const follows = Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-0000-0000-0000000001${String(index).padStart(2, "0")}`,
    targetId: `00000000-0000-0000-0000-0000000002${String(index).padStart(2, "0")}`,
    channel: {
      externalId: `UC_layout_${index}`,
      title: `Learning Channel ${index + 1}`,
      thumbnailUrl: null,
      canonicalUrl: `https://www.youtube.com/channel/UC_layout_${index}`,
    },
  }));
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-0000-0000-0000000003${String(index).padStart(2, "0")}`,
    state: "pending",
    libraryItem: null,
    video: {
      externalId: `layout-video-${index}`,
      title: `Candidate lesson ${index + 1}`,
      thumbnailUrl: null,
      publishedAt: new Date(Date.UTC(2026, 7, 23 - index, 9, 18)).toISOString(),
      durationSeconds: 600 + index,
      source: `https://www.youtube.com/watch?v=layout-video-${index}`,
      channelExternalId: follows[index].channel.externalId,
      channelTitle: follows[index].channel.title,
    },
  }));

  await page.route("**/api/discover", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ follows, candidates }),
    }),
  );
  await page.goto(testAppUrl("/discover", "desktop-discover-layout"));

  await expect(
    page.getByRole("heading", { name: "All Follows" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(
    page
      .getByRole("complementary", { name: "Follow management" })
      .getByRole("button", { name: /Unfollow/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage Follows" }),
  ).toBeVisible();

  const documentScroll = await page.locator("html").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  const feedScroll = await page
    .getByRole("region", { name: "Candidate feed" })
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
  const followScroll = await page
    .getByTestId("follow-filter-list")
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));

  expect(documentScroll.scrollHeight).toBe(documentScroll.clientHeight);
  expect(feedScroll.clientHeight).toBeGreaterThan(500);
  expect(feedScroll.scrollHeight).toBeGreaterThan(feedScroll.clientHeight);
  expect(feedScroll.overflowY).toBe("auto");
  expect(followScroll.scrollHeight).toBeGreaterThan(followScroll.clientHeight);
  expect(followScroll.overflowY).toBe("auto");
});

test("a User can scroll a long channel preview while Follow stays visible", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout contract");

  const videos = Array.from({ length: 12 }, (_, index) => ({
    externalId: `preview-video-${index}`,
    title: `Preview lesson ${index + 1}`,
    thumbnailUrl: null,
    publishedAt: new Date(Date.UTC(2026, 7, 23 - index, 9, 18)).toISOString(),
    durationSeconds: 600 + index,
    source: `https://www.youtube.com/watch?v=preview-video-${index}`,
    channelExternalId: "UC_preview_layout",
    channelTitle: "Preview Learning",
  }));
  await page.route("**/api/discover/preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        targetId: "00000000-0000-0000-0000-000000000400",
        channel: {
          externalId: "UC_preview_layout",
          title: "Preview Learning",
          thumbnailUrl: null,
          canonicalUrl: "https://www.youtube.com/channel/UC_preview_layout",
        },
        videos,
      }),
    }),
  );
  await page.route("**/api/discover", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ follows: [], candidates: [] }),
    }),
  );
  await page.goto(testAppUrl("/discover", "desktop-discover-preview-layout"));
  await page
    .getByLabel("YouTube channel URL")
    .fill("https://youtube.com/@previewlearning");
  await page.getByRole("button", { name: "Preview channel" }).click();

  const follow = page.getByRole("button", { name: "Follow channel" });
  const previewVideos = page.getByRole("region", {
    name: "Channel preview videos",
  });
  await expect(follow).toBeVisible();
  await expect(previewVideos).toBeVisible();
  const previewScroll = await previewVideos.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));

  expect(previewScroll.scrollHeight).toBeGreaterThan(
    previewScroll.clientHeight,
  );
  expect(previewScroll.overflowY).toBe("auto");
  await previewVideos.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(follow).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Preview lesson 12" }),
  ).toBeInViewport();
});
