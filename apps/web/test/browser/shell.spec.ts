import { expect, test, type Page } from "@playwright/test";
import { testAppUrl } from "./test-helpers";

/**
 * The routed Quiet Focus shell (#91): route table, auth gate, intended-route
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

test("the top bar carries the Trails and Library doors on every signed-in surface", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/"));

  const trailsDoor = page.getByRole("link", { name: "Trails", exact: true });
  const libraryDoor = page.getByRole("link", { name: "Library", exact: true });
  await expect(trailsDoor).toBeVisible();
  await expect(libraryDoor).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Trails" }),
  ).toBeVisible();

  await libraryDoor.click();
  await expect(page).toHaveURL(/\/test\/browser\/library(\?|$)/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  // The active destination is apparent, not conveyed by colour alone.
  await expect(libraryDoor).toHaveAttribute("aria-current", "page");
  // The doors persist across the surface change.
  await expect(trailsDoor).toBeVisible();

  await page.getByRole("link", { name: "Unshelf — go to Trails" }).click();
  await expect(page).toHaveURL(/\/test\/browser\/?$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Trails" }),
  ).toBeVisible();
});

test("the route table recognizes the Trail, Stop, and canonical Item routes", async ({
  page,
}, testInfo) => {
  // An unknown Trail id resolves the Trail route and surface (its landmark), then
  // reports the miss inline without leaving the surface — the id is opaque, so a
  // stale link is contained here, not a crash.
  await page.goto(appUrl(testInfo, "/trails/trail-xyz"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Trail" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.goto(appUrl(testInfo, "/trails/trail-xyz/stops/stop-abc"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Trail" }),
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

test("an unknown route recovers to Home", async ({ page }, testInfo) => {
  await page.goto(appUrl(testInfo, "/nowhere-real"));
  await expect(
    page.getByRole("heading", { name: "This page doesn't exist" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Go to Trails", exact: true }).click();
  await expect(page).toHaveURL(/\/test\/browser\/?$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Trails" }),
  ).toBeVisible();
});

test("auth resolution shows only the wordmark placeholder, never signed-out content", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/", { authState: "loading" }));
  await expect(page.getByRole("status", { name: "Loading Unshelf" })).toBeVisible();
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
  await page.goto(appUrl(testInfo, "/library", { authState: "signed-out" }));
  await expect(page).toHaveURL(/\/test\/browser\/sign-in$/);

  await page.getByRole("button", { name: "Sign in with Google" }).click();

  await expect(page).toHaveURL(/\/test\/browser\/library$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
});

test("the system colour scheme resolves to the locked Quiet Focus page colour", async ({
  page,
}, testInfo) => {
  const pageBackground = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(appUrl(testInfo, "/"));
  expect(await pageBackground()).toBe("rgb(250, 250, 251)"); // #FAFAFB

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(appUrl(testInfo, "/"));
  expect(await pageBackground()).toBe("rgb(14, 15, 19)"); // #0E0F13
});

test("keyboard focus reaches the top bar with a visible focus ring", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/"));
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
  await page.goto(appUrl(testInfo, "/"));
  expect(await pageHasNoHorizontalOverflow(page)).toBe(true);

  await page.goto(appUrl(testInfo, "/library"));
  expect(await pageHasNoHorizontalOverflow(page)).toBe(true);
});
