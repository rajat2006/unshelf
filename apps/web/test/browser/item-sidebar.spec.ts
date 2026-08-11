import { expect, test, type Page } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

async function seedPlacedItem(page: Page, user: string) {
  const learningPlan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: `${user} LearningPlan`,
    })
  ).json()) as { id: string };
  const stage = (await (
    await testApi(
      page,
      user,
      `/api/learning-plans/${learningPlan.id}/stages`,
      "POST",
      {
        name: `${user} Stage`,
      },
    )
  ).json()) as { id: string; name: string };
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: `${user} Item`,
      type: "course",
      source: "https://example.com/course",
    })
  ).json()) as { id: string; title: string };
  await testApi(page, user, `/api/stages/${stage.id}/items`, "POST", {
    itemId: item.id,
  });
  return { learningPlan, stage, item };
}

test("every occurrence of an Item links to its one canonical URL", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-item-canonical-link`;
  const { learningPlan, stage, item } = await seedPlacedItem(page, user);
  const canonicalPath = `/test/browser/items/${item.id}`;

  await page.goto(testAppUrl("/library", user));
  await expect(page.getByRole("link", { name: item.title })).toHaveAttribute(
    "href",
    canonicalPath,
  );

  await page.goto(
    testAppUrl(`/plans/${learningPlan.id}/stages/${stage.id}`, user),
  );
  const sidebar = page.getByRole("complementary", {
    name: `${stage.name} details`,
  });
  await expect(sidebar.getByRole("link", { name: item.title })).toHaveAttribute(
    "href",
    canonicalPath,
  );
});

test("a bookmarked or refreshed Item opens beside its canonical Library at any viewport", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-item-cold-link`;
  const { item } = await seedPlacedItem(page, user);
  await testApi(page, user, `/api/items/${item.id}/status`, "PATCH", {
    status: "in_progress",
  });
  await testApi(page, user, `/api/items/${item.id}/target-date`, "PATCH", {
    targetDate: "2099-06-15",
  });

  await page.goto(testAppUrl(`/items/${item.id}`, user));

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Library", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const sidebar = page.getByRole("complementary", {
    name: `${item.title} details`,
  });
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("heading", { level: 2, name: item.title }),
  ).toBeVisible();
  await expect(
    sidebar
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sidebar.getByLabel(`Target date for ${item.title}`)).toHaveValue(
    "2099-06-15",
  );
  await expect(
    sidebar.getByRole("link", { name: "https://example.com/course" }),
  ).toHaveAttribute("href", "https://example.com/course");

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
});

test("an Item can be structured and maintain its ordered Part checklist", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-item-parts`;
  const { item } = await seedPlacedItem(page, user);
  await page.goto(testAppUrl(`/items/${item.id}`, user));
  const sidebar = page.getByRole("complementary", {
    name: `${item.title} details`,
  });

  await sidebar.getByLabel("New Part titles").fill(" Introduction \n\nProject");
  await sidebar.getByRole("button", { name: "Add Parts" }).click();
  await expect(sidebar.getByText("0% complete")).toBeVisible();
  await expect(
    sidebar.getByRole("checkbox", { name: "Project" }),
  ).not.toBeChecked();

  await sidebar.getByRole("checkbox", { name: "Project" }).click();
  await expect(
    sidebar.getByRole("checkbox", { name: "Project" }),
  ).toBeChecked();
  await expect(sidebar.getByText("50% complete")).toBeVisible();
  await expect(
    sidebar
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");

  await sidebar.getByLabel("Title for Introduction").fill("Foundations");
  await sidebar.getByRole("button", { name: "Save Foundations" }).click();
  await sidebar.getByRole("button", { name: "Move Project up" }).click();
  await expect(
    sidebar.getByRole("list", { name: "Parts" }).getByRole("listitem"),
  ).toHaveText([/Project/, /Foundations/]);

  await page.reload();
  const refreshed = page.getByRole("complementary", {
    name: `${item.title} details`,
  });
  await expect(
    refreshed.getByRole("checkbox", { name: "Project" }),
  ).toBeChecked();
  await expect(refreshed.getByText("50% complete")).toBeVisible();

  await refreshed.getByRole("button", { name: "Remove Foundations" }).click();
  await expect(refreshed.getByText("100% complete")).toBeVisible();
  await refreshed.getByRole("button", { name: "Remove Project" }).click();
  await expect(refreshed.getByText("No Parts yet")).toBeVisible();
  await expect(
    refreshed
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "Done" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("opening an Item preserves its filtered Library beneath the sidebar", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-item-filter-context`;
  const { item } = await seedPlacedItem(page, user);
  const label = (await (
    await testApi(page, user, "/api/labels", "POST", { name: "Selected" })
  ).json()) as { id: string };
  await testApi(page, user, `/api/items/${item.id}/labels/${label.id}`, "POST");
  await testApi(page, user, "/api/items", "POST", {
    title: "Outside the filter",
    type: "book",
  });

  await page.goto(testAppUrl("/library", user, { label: label.id }));
  await page.getByRole("link", { name: item.title }).click();

  await expect(
    page.getByRole("button", { name: "Filter by Selected" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Outside the filter", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();
});

test("opening an Item from a Stage preserves its LearningPlan and follows browser history", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop context behavior");
  const user = `${testInfo.project.name}-item-learning-plan-context`;
  const { learningPlan, stage, item } = await seedPlacedItem(page, user);
  const stagePath = `/plans/${learningPlan.id}/stages/${stage.id}`;

  await page.goto(testAppUrl(stagePath, user));
  const stageSidebar = page.getByRole("complementary", {
    name: `${stage.name} details`,
  });
  await stageSidebar.getByRole("link", { name: item.title }).click();

  await expect(page).toHaveURL(new RegExp(`/test/browser/items/${item.id}$`));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `${user} LearningPlan`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: stage.name, exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();
  await expect(stageSidebar).toHaveCount(0);

  await page
    .getByRole("complementary", { name: `${item.title} details` })
    .getByRole("group", { name: `Status for ${item.title}` })
    .getByRole("button", { name: "Done" })
    .click();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${stagePath}(\\?|$)`));
  await expect(
    page.getByRole("complementary", { name: `${stage.name} details` }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: `${stage.name} details` })
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "Done" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.goForward();
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();

  // The test harness selects its auth User from this query parameter on boot.
  // Preserve it across the reload without disturbing React Router's history
  // state, which carries the live LearningPlan origin in production.
  await page.evaluate((selectedUser) => {
    const url = new URL(window.location.href);
    url.searchParams.set("testUser", selectedUser);
    window.history.replaceState(window.history.state, "", url);
  }, user);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `${user} LearningPlan`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();
});

test("Item detail edits synchronize with the same Item in the underlying Library", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one synchronization path");
  const user = `${testInfo.project.name}-item-sync`;
  const { item } = await seedPlacedItem(page, user);

  await page.goto(testAppUrl(`/items/${item.id}`, user));
  const library = page.getByRole("region", { name: "Library" });
  const sidebar = page.getByRole("complementary", {
    name: `${item.title} details`,
  });

  await sidebar
    .getByRole("group", { name: `Status for ${item.title}` })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(
    library
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "Done" }),
  ).toHaveAttribute("aria-pressed", "true");

  await sidebar.getByLabel(`Target date for ${item.title}`).fill("2099-08-20");
  await expect(library.getByLabel(`Target date for ${item.title}`)).toHaveValue(
    "2099-08-20",
  );

  await library
    .getByRole("group", { name: `Status for ${item.title}` })
    .getByRole("button", { name: "In progress" })
    .click();
  await expect(
    sidebar
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");

  await sidebar.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL(/\/test\/browser\/library$/);
  await expect(
    library
      .getByRole("group", { name: `Status for ${item.title}` })
      .getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("navigating between Item sidebars keeps every shared Item synchronized", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one multi-Item history path");
  const user = `${testInfo.project.name}-item-multi-sync`;
  const { item: first } = await seedPlacedItem(page, user);
  const second = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: `${user} Second Item`,
      type: "article",
    })
  ).json()) as { id: string; title: string };

  await page.goto(testAppUrl(`/items/${first.id}`, user));
  const library = page.getByRole("region", { name: "Library" });
  await page
    .getByRole("complementary", { name: `${first.title} details` })
    .getByRole("group", { name: `Status for ${first.title}` })
    .getByRole("button", { name: "Done" })
    .click();

  await library.getByRole("link", { name: second.title }).click();
  const secondSidebar = page.getByRole("complementary", {
    name: `${second.title} details`,
  });
  await secondSidebar
    .getByRole("group", { name: `Status for ${second.title}` })
    .getByRole("button", { name: "In progress" })
    .click();

  await expect(
    library
      .getByRole("group", { name: `Status for ${first.title}` })
      .getByRole("button", { name: "Done" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    library
      .getByRole("group", { name: `Status for ${second.title}` })
      .getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a foreign Item is missing without removing the underlying Library", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one tenancy presentation path");
  const owner = `${testInfo.project.name}-item-private-owner`;
  const intruder = `${testInfo.project.name}-item-private-intruder`;
  const { item } = await seedPlacedItem(page, owner);

  await page.goto(testAppUrl(`/items/${item.id}`, intruder));

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Item details" });
  await expect(sidebar.getByRole("alert")).toContainText(
    "Could not load this Item",
  );
  await expect(page.getByText(item.title, { exact: true })).toHaveCount(0);
});

test("Item detail loading stays shaped inside the sidebar", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one loading path");
  const user = `${testInfo.project.name}-item-loading`;
  const { item } = await seedPlacedItem(page, user);
  let releaseItem!: () => void;
  await page.route(`**/api/items/${item.id}`, async (route) => {
    await new Promise<void>((resolve) => {
      releaseItem = resolve;
    });
    await route.continue();
  });

  await page.goto(testAppUrl(`/items/${item.id}`, user), {
    waitUntil: "domcontentloaded",
  });
  const sidebar = page.getByRole("complementary", { name: "Item details" });
  await expect(
    sidebar.getByRole("status", { name: "Loading Item details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();

  releaseItem();
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();
});

test("an Item detail failure retries inside the sidebar without replacing the Library", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one retry path");
  const user = `${testInfo.project.name}-item-retry`;
  const { item } = await seedPlacedItem(page, user);
  let failing = true;
  await context.route(`**/api/items/${item.id}`, async (route) => {
    if (route.request().method() === "GET" && failing) {
      await route.fulfill({ status: 503, json: { error: "temporarily down" } });
      return;
    }
    await route.continue();
  });

  await page.goto(testAppUrl(`/items/${item.id}`, user));
  const sidebar = page.getByRole("complementary", { name: "Item details" });
  await expect(sidebar.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: item.title })).toBeVisible();

  failing = false;
  await sidebar.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("complementary", { name: `${item.title} details` }),
  ).toBeVisible();
});
