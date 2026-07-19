import { expect, test } from "@playwright/test";

test("an authenticated User can capture an Item that remains private and persisted", async ({
  context,
  page,
}, testInfo) => {
  const externalRequests: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") {
      await route.continue();
      return;
    }
    externalRequests.push(url.href);
    await route.abort("blockedbyclient");
  });

  const firstUser = `${testInfo.project.name}-first-user`;
  const secondUser = `${testInfo.project.name}-second-user`;
  const firstTitle = `${testInfo.project.name} persisted Item`;
  const secondTitle = `${testInfo.project.name} private Item`;

  await page.goto(`/test/browser/?testUser=${encodeURIComponent(firstUser)}`);
  await page.getByLabel("Title").fill(firstTitle);
  await page.getByLabel("Type").selectOption("article");
  await page.getByRole("button", { name: "Add to All" }).click();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto(`/test/browser/?testUser=${encodeURIComponent(secondUser)}`);
  await expect(secondPage.getByText(firstTitle, { exact: true })).toHaveCount(0);
  await secondPage.getByLabel("Title").fill(secondTitle);
  await secondPage.getByLabel("Type").selectOption("book");
  await secondPage.getByRole("button", { name: "Add to All" }).click();
  await expect(secondPage.getByText(secondTitle, { exact: true })).toBeVisible();
  await secondPage.close();

  await page.reload();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(secondTitle, { exact: true })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});
