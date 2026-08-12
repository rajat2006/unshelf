import { expect, test } from "@playwright/test";
import { testAppUrl } from "./test-helpers";
import { LEGACY_LEARNING_PLAN_FIXTURE as legacy } from "./legacy-learning-plan-fixture";

test("migrated organisation opens at stable URLs and remains usable after refresh", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "one representative full-stack migration path",
  );

  await page.goto(
    testAppUrl(
      `/plans/${legacy.learningPlanId}/stages/${legacy.firstStageId}`,
      legacy.clerkUserId,
    ),
  );

  await expect(
    page.getByRole("heading", { level: 1, name: legacy.learningPlanName }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", {
    name: `${legacy.firstStageName} details`,
  });
  await expect(
    sidebar.getByText(legacy.itemTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Open ${legacy.secondStageName}`,
      exact: true,
    }),
  ).toBeVisible();

  await sidebar
    .getByRole("group", { name: `Status for ${legacy.itemTitle}` })
    .getByRole("button", { name: "In progress" })
    .click();
  await page.reload();

  await expect(
    page.getByRole("heading", { level: 1, name: legacy.learningPlanName }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", {
        name: `${legacy.firstStageName} details`,
      })
      .getByRole("group", { name: `Status for ${legacy.itemTitle}` })
      .getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
});
