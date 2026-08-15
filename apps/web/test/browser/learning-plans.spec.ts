import { expect, test, type Page } from "@playwright/test";
import type { Item, LearningPlan } from "@unshelf/shared";
import { testApi, testAppUrl } from "./test-helpers";

/**
 * The Learning Plans index at Home (#93, design spec §2/§6, ADR-0014). Home is Learning Plans-only:
 * the User's LearningPlans as progress cards with one quiet action to start another, an
 * empty-state prompt, and Learning Plans that open at their own opaque URL. These assert
 * external behaviour — visible cards, the create round-trip, persistence across a
 * reload, the opened URL, and per-User isolation — not markup or token plumbing.
 */

function appUrl(
  testInfo: { project: { name: string } },
  path: string,
  user = `${testInfo.project.name}-learning-plans-user`,
): string {
  return testAppUrl(path, user);
}

async function startLearningPlan(page: Page, name: string): Promise<void> {
  await page.getByLabel("Learning Plan name").fill(name);
  await page.getByRole("button", { name: "Start a Learning Plan" }).click();
}

test("the empty Learning Plans index offers a quiet way to start one", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/plans"));

  await expect(
    page.getByRole("heading", { level: 1, name: "Learning Plans" }),
  ).toBeVisible();
  await expect(page.getByText("No Learning Plans yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start a Learning Plan" }),
  ).toBeVisible();
});

test("a created LearningPlan appears with derived progress, persists, and opens at its URL", async ({
  page,
}, testInfo) => {
  const name = `${testInfo.project.name} onboarding journey`;
  await page.goto(appUrl(testInfo, "/plans"));

  await startLearningPlan(page, name);

  // The new LearningPlan shows as a card carrying its (empty) derived progress.
  const card = page.getByRole("link", { name: new RegExp(name) });
  await expect(card).toBeVisible();
  await expect(page.getByText("No items added yet")).toBeVisible();

  // It survives a reload — the LearningPlan is a persisted record, not view state.
  await page.reload();
  await expect(
    page.getByRole("link", { name: new RegExp(name) }),
  ).toBeVisible();
  await expect(page.getByText("No Learning Plans yet")).toHaveCount(0);

  // Opening the card navigates to the LearningPlan at its own opaque, stable URL.
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/test\/browser\/plans\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  const renamed = `${name} revised`;
  await page.getByLabel("Rename Learning Plan").fill(renamed);
  await page.getByRole("button", { name: "Rename Learning Plan" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: renamed }),
  ).toBeVisible();
  const learningPlanId = /plans\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(appUrl(testInfo, `/plans/${learningPlanId}`));
  await expect(
    page.getByRole("heading", { level: 1, name: renamed }),
  ).toBeVisible();
});

test("a User's Learning Plans are private to them", async ({
  page,
}, testInfo) => {
  const ownerName = `${testInfo.project.name} private journey`;
  await page.goto(appUrl(testInfo, "/plans", `${testInfo.project.name}-owner`));
  await startLearningPlan(page, ownerName);
  await expect(
    page.getByRole("link", { name: new RegExp(ownerName) }),
  ).toBeVisible();

  // A different User lands on their own empty index — never the owner's LearningPlan.
  await page.goto(
    appUrl(testInfo, "/plans", `${testInfo.project.name}-stranger`),
  );
  await expect(page.getByText("No Learning Plans yet")).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(ownerName) }),
  ).toHaveCount(0);
});

test("a User archives a read-only Learning Plan, sees live progress, and restores it", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-learning-plan-lifecycle`;
  const plan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Lifecycle plan",
    })
  ).json()) as LearningPlan;
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Shared progress item",
      type: "book",
    })
  ).json()) as Item;
  await testApi(page, user, `/api/learning-plans/${plan.id}/items`, "POST", {
    itemId: item.id,
  });

  await page.goto(appUrl(testInfo, "/plans", user));
  await page.getByRole("button", { name: "Archive Lifecycle plan" }).click();
  const archivedPlans = page.getByRole("region", { name: "Archived Plans" });
  await expect(archivedPlans.getByText("Lifecycle plan")).toBeVisible();

  await archivedPlans.getByRole("link", { name: /Lifecycle plan/ }).click();
  await expect(page.getByText("Archived · read-only")).toBeVisible();
  await expect(page.getByLabel("Rename Learning Plan")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Library placement drawer" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(Link from|Disconnect) / }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("complementary", { name: "Today sidecar" })
      .getByRole("button", {
        name: "Add Shared progress item to Today",
      }),
  ).toBeEnabled();
  await page.goto(appUrl(testInfo, "/today", user));
  await page
    .getByRole("searchbox", { name: "Find an Item" })
    .fill("shared progress");
  await expect(
    page
      .getByRole("region", { name: "Item search results" })
      .getByRole("button", { name: "Add Shared progress item to Today" }),
  ).toBeEnabled();

  await page.goto(appUrl(testInfo, `/items/${item.id}`, user));
  await expect(page.getByText("Lifecycle plan · Archived")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove from Lifecycle plan" }),
  ).toHaveCount(0);

  await testApi(page, user, `/api/items/${item.id}/status`, "PATCH", {
    status: "done",
  });
  await page.goto(appUrl(testInfo, "/plans", user));
  await expect(
    page
      .getByRole("region", { name: "Archived Plans" })
      .getByText("1 of 1 done"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Restore Lifecycle plan" }).click();
  const activePlans = page.getByRole("region", { name: "Active Plans" });
  await expect(activePlans.getByText("Lifecycle plan")).toBeVisible();
  await activePlans.getByRole("link", { name: /Lifecycle plan/ }).click();
  await expect(page.getByLabel("Rename Learning Plan")).toBeVisible();
  if (testInfo.project.name !== "phone") {
    await expect(
      page.getByRole("complementary", { name: "Library placement drawer" }),
    ).toBeVisible();
  }
});
