import { expect, test, type Page } from "@playwright/test";

/** Capture an Item through the global overlay (#92): open, fill, submit, close. */
async function capture(
  page: Page,
  fields: { title: string; type: string },
): Promise<void> {
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Capture" });
  await dialog.getByLabel("Title").fill(fields.title);
  await dialog.getByLabel("Type").selectOption(fields.type);
  await dialog.getByRole("button", { name: "Add to Library" }).click();
  await expect(dialog).toBeHidden();
}

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

  await page.goto(
    `/test/browser/library?testUser=${encodeURIComponent(firstUser)}`,
  );
  await capture(page, { title: firstTitle, type: "article" });
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto(
    `/test/browser/library?testUser=${encodeURIComponent(secondUser)}`,
  );
  await expect(secondPage.getByText(firstTitle, { exact: true })).toHaveCount(
    0,
  );
  await capture(secondPage, { title: secondTitle, type: "book" });
  await expect(
    secondPage.getByText(secondTitle, { exact: true }),
  ).toBeVisible();
  await secondPage.close();

  await page.reload();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(secondTitle, { exact: true })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("a Power Learner moves a mixed corpus through the manual planning workspace", async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop authors plan topology");
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
  const user = `${testInfo.project.name}-power-learner-corpus`;

  await page.goto(`/test/browser/?testUser=${encodeURIComponent(user)}`);
  await expect(page).toHaveURL(/\/today$/);
  await capture(page, {
    title: "Read a storage-engine article",
    type: "article",
  });
  await capture(page, { title: "Study the database book", type: "book" });
  await capture(page, { title: "Watch a query-planning video", type: "video" });
  await expect(
    page
      .getByRole("region", { name: "Suggestions" })
      .getByText("Watch a query-planning video", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page
    .getByRole("link", { name: "Study the database book", exact: true })
    .click();
  const itemDetails = page.getByRole("complementary", {
    name: "Study the database book details",
  });
  await itemDetails
    .getByLabel("New Part titles")
    .fill("Storage layout\nIndexes");
  await itemDetails.getByRole("button", { name: "Add Parts" }).click();
  await expect(itemDetails.getByText("0% complete")).toBeVisible();
  await itemDetails.getByRole("button", { name: "Close details" }).click();

  await page.getByRole("link", { name: "Plans", exact: true }).click();
  await page.getByLabel("Learning Plan name").fill("Database foundations");
  await page.getByRole("button", { name: "Start a Learning Plan" }).click();
  await page.getByRole("link", { name: /Database foundations/ }).click();
  const drawer = page.getByRole("complementary", {
    name: "Library placement drawer",
  });
  await capture(page, {
    title: "Captured while planning",
    type: "article",
  });
  await expect(
    drawer.getByText("Captured while planning", { exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole("listitem")
    .filter({ hasText: "Read a storage-engine article" })
    .getByRole("button", { name: "Place directly" })
    .click();

  const todaySidecar = page.getByRole("complementary", {
    name: "Today sidecar",
  });
  await todaySidecar
    .getByRole("button", { name: "Add Read a storage-engine article to Today" })
    .click();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Find an Item" })
    .fill("Study the database book");
  await page
    .getByRole("region", { name: "Item search results" })
    .getByRole("button", { name: "Add Study the database book to Today" })
    .click();

  await expect(page.getByText("0 of 2 done")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Suggestions" })
      .getByText("Watch a query-planning video", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Today's Daily Focus" })
    .getByRole("listitem")
    .filter({ hasText: "Read a storage-engine article" })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(page.getByText("1 of 2 done")).toBeVisible();

  await page.getByRole("link", { name: "Plans", exact: true }).click();
  await page
    .getByRole("button", { name: "Archive Database foundations" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Archived Plans" })
      .getByText("1 of 1 done"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore Database foundations" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Active Plans" })
      .getByText("Database foundations"),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
});
