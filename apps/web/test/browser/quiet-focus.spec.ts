import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { testAppUrl } from "./test-helpers";

async function startTrail(page: Page, user: string): Promise<void> {
  await page.goto(testAppUrl("/", user));
  await page.getByLabel("Trail name").fill("Quiet Focus journey");
  await page.getByRole("button", { name: "Start a Trail" }).click();
  await page.getByRole("link", { name: /Quiet Focus journey/ }).click();
}

async function addStop(page: Page, name: string, first = false): Promise<void> {
  if (first) {
    await page.getByRole("button", { name: /Start your trail/ }).click();
  } else {
    await page.getByRole("button", { name: "Add next Stop" }).last().click();
  }
  await page
    .getByPlaceholder(first ? "Name your first stop" : "Name the new stop")
    .fill(name);
  await page
    .getByPlaceholder(first ? "Name your first stop" : "Name the new stop")
    .press("Enter");
  await expect(page.getByRole("button", { name: `Open ${name}` })).toBeVisible();
}

test("the Trail uses Quiet Focus in both color schemes and exposes non-color state cues", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop creates the topology");
  const user = `${testInfo.project.name}-quiet-focus-theme`;

  await page.emulateMedia({ colorScheme: "light" });
  await startTrail(page, user);
  await addStop(page, "Begin here", true);

  const canvas = page.getByRole("region", { name: "Trail canvas" });
  await expect(canvas).toHaveCSS("background-color", "rgb(244, 245, 247)");
  await expect(page.getByText("You are here", { exact: true })).toBeVisible();
  await expect(page.getByText("Dotted path: ahead", { exact: true })).toBeVisible();
  await expect(page.getByText("Solid path: walked", { exact: true })).toBeVisible();

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(canvas).toHaveCSS("background-color", "rgb(18, 19, 25)");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the shipped surfaces pass automated accessibility checks", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-quiet-focus-a11y`;
  await page.goto(testAppUrl("/", user));

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("reduced motion removes Trail progress transitions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "covered once at desktop width");
  const user = `${testInfo.project.name}-quiet-focus-motion`;

  await page.emulateMedia({ reducedMotion: "reduce" });
  await startTrail(page, user);
  await addStop(page, "Motionless stop", true);

  expect(
    await page.locator(".progress-ring__value").evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).transitionDuration),
    ),
  ).toBeLessThanOrEqual(0.00001);
});

test("a phone pans only inside its view-only Trail canvas", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone reflow behavior");
  const user = `${testInfo.project.name}-quiet-focus-pan`;

  await page.setViewportSize({ width: 1024, height: 800 });
  await startTrail(page, user);
  await addStop(page, "One", true);
  await addStop(page, "Two");
  await addStop(page, "Three");
  await addStop(page, "Four");

  await page.setViewportSize({ width: 390, height: 844 });
  const trailPath = new URL(page.url()).pathname.replace("/test/browser", "");
  await page.goto(testAppUrl(trailPath, user));

  const canvas = page.getByRole("region", { name: "Trail canvas" });
  await expect(canvas).toHaveCSS("overflow-x", "auto");
  expect(
    await canvas.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Add next Stop" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove this link" })).toHaveCount(0);
});
