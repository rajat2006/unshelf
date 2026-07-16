import { expect, test, type Page } from "playwright/test";

const ITEM_TITLE = "A deliberately long responsive-layout title that still fits";

async function expectUsableLayout(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const viewport = page.viewportSize()!;
  const controls = page.locator("button, input, select, a[href]");
  const controlCount = await controls.count();
  expect(controlCount).toBeGreaterThan(0);

  for (let index = 0; index < controlCount; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  }
}

for (const layout of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 375, height: 667 },
]) {
  test(`Stops list and detail reflow at ${layout.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: layout.width, height: layout.height });

    await page.goto("/test/fixtures/stops.html?view=list");
    await expect(page.getByRole("button", { name: "Learn CSS" })).toBeVisible();
    await expectUsableLayout(page);

    await page.goto("/test/fixtures/stops.html?view=detail");
    await expect(page.getByText(ITEM_TITLE)).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove from stop" })).toBeVisible();
    await expectUsableLayout(page);
  });
}
