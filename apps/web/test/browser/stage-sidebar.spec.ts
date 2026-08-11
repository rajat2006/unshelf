import { expect, test, type Page } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

async function openLearningPlanWithStage(
  page: Page,
  user: string,
): Promise<{ learningPlanId: string; stageName: string }> {
  const stageName = `${user} Stage`;
  await page.goto(testAppUrl("/plans", user));
  await page.getByLabel("Learning Plan name").fill(`${user} Learning Plan`);
  await page.getByRole("button", { name: "Start a Learning Plan" }).click();
  await page
    .getByRole("link", { name: new RegExp(`${user} Learning Plan`) })
    .click();
  const learningPlanId = /plans\/([0-9a-f-]{36})/.exec(page.url())![1];

  await page.getByRole("button", { name: /Start your Learning Plan/ }).click();
  await page.getByPlaceholder("Name your first stage").fill(stageName);
  await page.getByPlaceholder("Name your first stage").press("Enter");
  return { learningPlanId, stageName };
}

async function seedStageWithItem(page: Page, user: string) {
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
    })
  ).json()) as { id: string; title: string };
  await testApi(page, user, `/api/items/${item.id}/status`, "PATCH", {
    status: "in_progress",
  });
  await testApi(page, user, `/api/items/${item.id}/target-date`, "PATCH", {
    targetDate: "2099-06-15",
  });
  await testApi(page, user, `/api/stages/${stage.id}/items`, "POST", {
    itemId: item.id,
  });
  return { learningPlan, stage, item };
}

test("a Stage route opens beside its interactive LearningPlan and follows browser history", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop sidebar behavior");
  const user = `${testInfo.project.name}-stage-sidebar-history`;
  const { learningPlanId, stageName } = await openLearningPlanWithStage(
    page,
    user,
  );

  await expect(page).toHaveURL(
    new RegExp(`/plans/${learningPlanId}/stages/[0-9a-f-]{36}$`),
  );
  await expect(
    page.getByRole("complementary", { name: `${stageName} details` }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: `${user} Learning Plan` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sequence this Stage" }),
  ).toBeEnabled();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/plans/${learningPlanId}$`));
  await expect(
    page.getByRole("complementary", { name: `${stageName} details` }),
  ).toHaveCount(0);

  await page.goForward();
  await expect(
    page.getByRole("complementary", { name: `${stageName} details` }),
  ).toBeVisible();

  await page.getByLabel("Rename Stage").fill(`${stageName} revised`);
  await page.getByRole("button", { name: "Rename Stage" }).click();
  await expect(
    page.getByRole("complementary", { name: `${stageName} revised details` }),
  ).toBeVisible();
  const stageId = /stages\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.goto(
    testAppUrl(`/plans/${learningPlanId}/stages/${stageId}`, user),
  );
  await expect(
    page.getByRole("complementary", { name: `${stageName} revised details` }),
  ).toBeVisible();
});

test("a cold Stage deep link restores its LearningPlan and shared Item facts at any viewport", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-stage-sidebar-cold`;
  const { learningPlan, stage, item } = await seedStageWithItem(page, user);

  await page.goto(
    testAppUrl(`/plans/${learningPlan.id}/stages/${stage.id}`, user),
  );
  const sidebar = page.getByRole("complementary", {
    name: `${stage.name} details`,
  });
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("heading", { level: 2, name: stage.name }),
  ).toBeVisible();
  if (testInfo.project.name !== "phone") {
    await expect(
      page.getByRole("button", { name: stage.name, exact: true }),
    ).toBeVisible();
  }
  await expect(sidebar.getByText(item.title, { exact: true })).toBeVisible();
  const status = sidebar.getByRole("group", {
    name: `Status for ${item.title}`,
  });
  await expect(
    status.getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sidebar.getByLabel(`Target date for ${item.title}`)).toHaveValue(
    "2099-06-15",
  );

  await status.getByRole("button", { name: "Done" }).click();
  await expect(status.getByRole("button", { name: "Done" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(
    page.getByRole("complementary", { name: `${stage.name} details` }),
  ).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
});

test("removing an Item from the sidebar preserves the Item and its other Stage", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "one representative membership path",
  );
  const user = `${testInfo.project.name}-stage-sidebar-remove`;
  const { learningPlan, stage, item } = await seedStageWithItem(page, user);
  const otherLearningPlan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Other Learning Plan",
    })
  ).json()) as { id: string };
  const otherStage = (await (
    await testApi(
      page,
      user,
      `/api/learning-plans/${otherLearningPlan.id}/stages`,
      "POST",
      {
        name: "Other Stage",
      },
    )
  ).json()) as { id: string };
  await testApi(page, user, `/api/stages/${otherStage.id}/items`, "POST", {
    itemId: item.id,
  });

  await page.goto(
    testAppUrl(`/plans/${learningPlan.id}/stages/${stage.id}`, user),
  );
  const sidebar = page.getByRole("complementary", {
    name: `${stage.name} details`,
  });
  await expect(sidebar.getByText(item.title, { exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "Remove from stage" }).click();

  await expect(sidebar.getByText(item.title, { exact: true })).toHaveCount(0);
  const library = (await (
    await testApi(page, user, "/api/items")
  ).json()) as Array<{
    id: string;
  }>;
  expect(library.map((listed) => listed.id)).toContain(item.id);
  const otherDetail = (await (
    await testApi(
      page,
      user,
      `/api/learning-plans/${otherLearningPlan.id}/stages/${otherStage.id}`,
    )
  ).json()) as { items: Array<{ id: string }> };
  expect(otherDetail.items.map((listed) => listed.id)).toContain(item.id);
});

test("a desktop User orders and reshapes an optional Stage across refresh", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "Stage authoring is desktop-only",
  );
  const user = `${testInfo.project.name}-stage-order-and-shape`;
  const {
    learningPlan,
    stage,
    item: first,
  } = await seedStageWithItem(page, user);
  const second = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Second staged Item",
      type: "article",
    })
  ).json()) as { id: string; title: string };
  const direct = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Direct Item",
      type: "book",
    })
  ).json()) as { id: string; title: string };
  await testApi(page, user, `/api/stages/${stage.id}/items`, "POST", {
    itemId: second.id,
  });
  await testApi(
    page,
    user,
    `/api/learning-plans/${learningPlan.id}/items`,
    "POST",
    { itemId: direct.id },
  );

  const stageUrl = testAppUrl(
    `/plans/${learningPlan.id}/stages/${stage.id}`,
    user,
  );
  await page.goto(stageUrl);
  let sidebar = page.getByRole("complementary", {
    name: `${stage.name} details`,
  });
  await sidebar
    .getByRole("button", { name: `Move ${second.title} up` })
    .click();
  await expect(
    sidebar.getByRole("list").first().getByRole("listitem").first(),
  ).toContainText(second.title);

  await page.reload();
  sidebar = page.getByRole("complementary", { name: `${stage.name} details` });
  await expect(
    sidebar.getByRole("list").first().getByRole("listitem").first(),
  ).toContainText(second.title);

  await sidebar.getByLabel("Search by title").fill(direct.title);
  await sidebar.getByRole("button", { name: "Move to this Stage" }).click();
  await expect(sidebar.getByText(direct.title, { exact: true })).toBeVisible();

  const firstRow = sidebar
    .getByRole("listitem")
    .filter({ hasText: first.title })
    .first();
  await firstRow.getByRole("button", { name: "Move directly in plan" }).click();
  await expect(firstRow).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Remove Stage" }).click();
  await expect(
    sidebar.getByText("Choose what happens to the Items in this Stage."),
  ).toBeVisible();
  await sidebar
    .getByRole("button", { name: "Keep Items directly in plan" })
    .click();
  await expect(
    page.getByRole("complementary", { name: `${stage.name} details` }),
  ).toHaveCount(0);
  await page.goto(testAppUrl(`/plans/${learningPlan.id}`, user));
  await expect(
    page.getByRole("link", { name: `Open ${direct.title}` }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("link", { name: `Open ${second.title}` }),
  ).toBeVisible();
});

test("a Stage detail failure retries inside the sidebar without replacing the LearningPlan", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one representative retry path");
  const user = `${testInfo.project.name}-stage-sidebar-retry`;
  const learningPlan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Retry LearningPlan",
    })
  ).json()) as { id: string };
  const stage = (await (
    await testApi(
      page,
      user,
      `/api/learning-plans/${learningPlan.id}/stages`,
      "POST",
      {
        name: "Retry Stage",
      },
    )
  ).json()) as { id: string; name: string };
  let failing = true;
  await page.route(
    `**/api/learning-plans/${learningPlan.id}/stages/${stage.id}`,
    async (route) => {
      if (failing) {
        await route.fulfill({
          status: 503,
          json: { error: "temporarily down" },
        });
      } else {
        await route.continue();
      }
    },
  );

  await page.goto(
    testAppUrl(`/plans/${learningPlan.id}/stages/${stage.id}`, user),
  );
  const loadingSidebar = page.getByRole("complementary", {
    name: "Stage details",
  });
  await expect(loadingSidebar.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: stage.name, exact: true }),
  ).toBeVisible();

  failing = false;
  await loadingSidebar.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("complementary", { name: `${stage.name} details` }),
  ).toBeVisible();
});

test("Stage detail loading stays shaped inside the sidebar", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one loading path");
  const user = `${testInfo.project.name}-stage-sidebar-loading`;
  const { learningPlan, stage } = await seedStageWithItem(page, user);
  let releaseStage!: () => void;
  await page.route(
    `**/api/learning-plans/${learningPlan.id}/stages/${stage.id}`,
    async (route) => {
      await new Promise<void>((resolve) => {
        releaseStage = resolve;
      });
      await route.continue();
    },
  );

  await page.goto(
    testAppUrl(`/plans/${learningPlan.id}/stages/${stage.id}`, user),
    {
      waitUntil: "domcontentloaded",
    },
  );
  const sidebar = page.getByRole("complementary", { name: "Stage details" });
  await expect(
    sidebar.getByRole("status", { name: "Loading Stage details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `${user} LearningPlan`,
    }),
  ).toBeVisible();

  releaseStage();
  await expect(
    page.getByRole("complementary", { name: `${stage.name} details` }),
  ).toBeVisible();
});
