import { expect, test, type Page } from "@playwright/test";
import { testAppUrl } from "./test-helpers";

/**
 * The Trails index at Home (#93, design spec §2/§6, ADR-0014). Home is Trails-only:
 * the User's Trails as progress cards with one quiet action to start another, an
 * empty-state prompt, and Trails that open at their own opaque URL. These assert
 * external behaviour — visible cards, the create round-trip, persistence across a
 * reload, the opened URL, and per-User isolation — not markup or token plumbing.
 */

function appUrl(
  testInfo: { project: { name: string } },
  path: string,
  user = `${testInfo.project.name}-trails-user`,
): string {
  return testAppUrl(path, user);
}

async function startTrail(page: Page, name: string): Promise<void> {
  await page.getByLabel("Trail name").fill(name);
  await page.getByRole("button", { name: "Start a Trail" }).click();
}

test("the empty Trails index offers a quiet way to start one", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/"));

  await expect(
    page.getByRole("heading", { level: 1, name: "Trails" }),
  ).toBeVisible();
  await expect(page.getByText("No Trails yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start a Trail" }),
  ).toBeVisible();
});

test("a created Trail appears with derived progress, persists, and opens at its URL", async ({
  page,
}, testInfo) => {
  const name = `${testInfo.project.name} onboarding journey`;
  await page.goto(appUrl(testInfo, "/"));

  await startTrail(page, name);

  // The new Trail shows as a card carrying its (empty) derived progress.
  const card = page.getByRole("link", { name: new RegExp(name) });
  await expect(card).toBeVisible();
  await expect(page.getByText("No items added yet")).toBeVisible();

  // It survives a reload — the Trail is a persisted record, not view state.
  await page.reload();
  await expect(
    page.getByRole("link", { name: new RegExp(name) }),
  ).toBeVisible();
  await expect(page.getByText("No Trails yet")).toHaveCount(0);

  // Opening the card navigates to the Trail at its own opaque, stable URL.
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/test\/browser\/trails\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Trail" }),
  ).toBeVisible();
});

test("a User's Trails are private to them", async ({ page }, testInfo) => {
  const ownerName = `${testInfo.project.name} private journey`;
  await page.goto(appUrl(testInfo, "/", `${testInfo.project.name}-owner`));
  await startTrail(page, ownerName);
  await expect(
    page.getByRole("link", { name: new RegExp(ownerName) }),
  ).toBeVisible();

  // A different User lands on their own empty index — never the owner's Trail.
  await page.goto(appUrl(testInfo, "/", `${testInfo.project.name}-stranger`));
  await expect(page.getByText("No Trails yet")).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(ownerName) }),
  ).toHaveCount(0);
});
