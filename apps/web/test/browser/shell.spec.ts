import { expect, test, type Page } from "@playwright/test";
import { testAppUrl } from "./test-helpers";

/**
 * The routed four-room shell: route table, auth gate, intended-route
 * restoration, not-found recovery, and the theme + responsive foundation. These
 * assert external behaviour — visible surfaces and controls, URLs, restored deep
 * links — not component structure or token plumbing.
 */

function appUrl(
  testInfo: { project: { name: string } },
  path: string,
  params: Record<string, string> = {},
): string {
  return testAppUrl(path, `${testInfo.project.name}-shell-user`, params);
}

async function pageHasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth;
  });
}

test("the top bar carries the four production workspace rooms with Today as home", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/"));

  await expect(page).toHaveURL(/\/test\/browser\/today$/);

  const todayDoor = page.getByRole("link", { name: "Today", exact: true });
  const discoverDoor = page.getByRole("link", {
    name: "Discover",
    exact: true,
  });

  const plansDoor = page.getByRole("link", { name: "Plans", exact: true });
  const libraryDoor = page.getByRole("link", { name: "Library", exact: true });
  await expect(todayDoor).toHaveAttribute("aria-current", "page");
  await expect(discoverDoor).toBeVisible();
  await expect(libraryDoor).toBeVisible();
  await expect(plansDoor).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();

  await libraryDoor.click();
  await expect(page).toHaveURL(/\/test\/browser\/library(\?|$)/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  // The active destination is apparent, not conveyed by colour alone.
  await expect(libraryDoor).toHaveAttribute("aria-current", "page");
  // The doors persist across the surface change.
  await expect(todayDoor).toBeVisible();

  await discoverDoor.click();
  await expect(page).toHaveURL(/\/test\/browser\/discover(\?|$)/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Discover" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Unshelf — go to Today" }).click();
  await expect(page).toHaveURL(/\/test\/browser\/today$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
});

test("the route table recognizes the Learning Plan, Stage, and canonical Item routes", async ({
  page,
}, testInfo) => {
  // An unknown LearningPlan id resolves the LearningPlan route and surface (its landmark), then
  // reports the miss inline without leaving the surface — the id is opaque, so a
  // stale link is contained here, not a crash.
  await page.goto(appUrl(testInfo, "/plans/learning-plan-xyz"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Learning Plan" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.goto(
    appUrl(testInfo, "/plans/learning-plan-xyz/stages/stage-abc"),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Learning Plan" }),
  ).toBeVisible();

  await page.goto(appUrl(testInfo, "/items/item-123"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Item details" })
      .getByRole("alert"),
  ).toBeVisible();
});

test("an unknown route recovers to Today", async ({ page }, testInfo) => {
  await page.goto(appUrl(testInfo, "/nowhere-real"));
  await expect(
    page.getByRole("heading", { name: "This page doesn't exist" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Go to Today", exact: true }).click();
  await expect(page).toHaveURL(/\/test\/browser\/today$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
});

test("auth resolution shows only the wordmark placeholder, never signed-out content", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/", { authState: "loading" }));
  await expect(
    page.getByRole("status", { name: "Loading Unshelf" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Library" })).toHaveCount(0);
});

test("a signed-out visitor sees the chrome-less sign-in screen and no navigation", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/", { authState: "signed-out" }));
  await expect(page).toHaveURL(/\/test\/browser\/sign-in$/);
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toBeVisible();
  // No signed-in chrome on the sign-in screen.
  await expect(page.getByRole("link", { name: "Library" })).toHaveCount(0);
});

test("a valid intended private route survives sign-in", async ({
  page,
}, testInfo) => {
  const labelId = "00000000-0000-0000-0000-000000000123";
  await page.goto(
    appUrl(testInfo, "/library", { authState: "signed-out", label: labelId }),
  );
  await expect(page).toHaveURL(/\/test\/browser\/sign-in$/);

  await page.getByRole("button", { name: "Sign in with Google" }).click();

  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe("/test/browser/library");
  expect(new URL(page.url()).searchParams.get("label")).toBe(labelId);
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
});

test("the workspace defaults to light and changes theme only when selected", async ({
  page,
}, testInfo) => {
  const pageBackground = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(appUrl(testInfo, "/plans"));
  const lightBackground = await pageBackground();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const theme = page.getByLabel("Theme");
  await theme.click();
  await page.getByRole("option", { name: "Dark" }).click();
  const darkBackground = await pageBackground();
  expect(darkBackground).not.toBe(lightBackground);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(theme).toContainText("Dark");
  expect(await pageBackground()).toBe(darkBackground);

  await theme.click();
  await page.getByRole("option", { name: "System" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(theme).toContainText("System");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await pageBackground()).toBe(lightBackground);
});

test("keyboard focus reaches the top bar with a visible focus ring", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/plans"));
  await page.keyboard.press("Tab");

  const focused = page.locator(":focus-visible");
  await expect(focused).toBeVisible();
  const outlineWidth = await focused.evaluate(
    (element) => getComputedStyle(element).outlineWidth,
  );
  expect(outlineWidth).toBe("2px");
});

test("the shell reflows with no page-level horizontal scroll", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/plans"));
  expect(await pageHasNoHorizontalOverflow(page)).toBe(true);

  await page.goto(appUrl(testInfo, "/today"));
  expect(await pageHasNoHorizontalOverflow(page)).toBe(true);

  await page.goto(appUrl(testInfo, "/library"));
  expect(await pageHasNoHorizontalOverflow(page)).toBe(true);
});
