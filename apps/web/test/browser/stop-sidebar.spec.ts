import { expect, test, type Page } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

async function openTrailWithStop(
  page: Page,
  user: string,
): Promise<{ trailId: string; stopName: string }> {
  const stopName = `${user} Stop`;
  await page.goto(testAppUrl("/", user));
  await page.getByLabel("Trail name").fill(`${user} Trail`);
  await page.getByRole("button", { name: "Start a Trail" }).click();
  await page.getByRole("link", { name: new RegExp(`${user} Trail`) }).click();
  const trailId = /trails\/([0-9a-f-]{36})/.exec(page.url())![1]!;

  await page.getByRole("button", { name: /Start your trail/ }).click();
  await page.getByPlaceholder("Name your first stop").fill(stopName);
  await page.getByPlaceholder("Name your first stop").press("Enter");
  return { trailId, stopName };
}

async function seedStopWithItem(page: Page, user: string) {
  const trail = (await (
    await testApi(page, user, "/api/trails", "POST", { name: `${user} Trail` })
  ).json()) as { id: string };
  const stop = (await (
    await testApi(page, user, `/api/trails/${trail.id}/stops`, "POST", {
      name: `${user} Stop`,
    })
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
  await testApi(page, user, `/api/stops/${stop.id}/items`, "POST", {
    itemId: item.id,
  });
  return { trail, stop, item };
}

test("a Stop route opens beside its interactive Trail and follows browser history", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop sidebar behavior");
  const user = `${testInfo.project.name}-stop-sidebar-history`;
  const { trailId, stopName } = await openTrailWithStop(page, user);

  await page.getByRole("button", { name: `Open ${stopName}` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/trails/${trailId}/stops/[0-9a-f-]{36}$`),
  );
  await expect(
    page.getByRole("complementary", { name: `${stopName} details` }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Trail" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add next Stop" })).toBeEnabled();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/trails/${trailId}$`));
  await expect(page.getByRole("complementary")).toHaveCount(0);

  await page.goForward();
  await expect(
    page.getByRole("complementary", { name: `${stopName} details` }),
  ).toBeVisible();
});

test("a cold Stop deep link restores its Trail and shared Item facts at any viewport", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-stop-sidebar-cold`;
  const { trail, stop, item } = await seedStopWithItem(page, user);

  await page.goto(testAppUrl(`/trails/${trail.id}/stops/${stop.id}`, user));
  const sidebar = page.getByRole("complementary", {
    name: `${stop.name} details`,
  });
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("heading", { level: 2, name: stop.name }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Open ${stop.name}` }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("group", {
      name: `${stop.name}: 1 of 1 items done`,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("complementary", { name: `${stop.name} details` }),
  ).toBeVisible();

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
});

test("removing an Item from the sidebar preserves the Item and its other Stop", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "one representative membership path",
  );
  const user = `${testInfo.project.name}-stop-sidebar-remove`;
  const { trail, stop, item } = await seedStopWithItem(page, user);
  const otherStop = (await (
    await testApi(page, user, `/api/trails/${trail.id}/stops`, "POST", {
      name: "Other Stop",
    })
  ).json()) as { id: string };
  await testApi(page, user, `/api/stops/${otherStop.id}/items`, "POST", {
    itemId: item.id,
  });

  await page.goto(testAppUrl(`/trails/${trail.id}/stops/${stop.id}`, user));
  const sidebar = page.getByRole("complementary", {
    name: `${stop.name} details`,
  });
  await expect(sidebar.getByText(item.title, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("group", {
      name: `${stop.name}: 0 of 1 items done`,
    }),
  ).toBeVisible();

  await sidebar.getByRole("button", { name: "Remove from stop" }).click();

  await expect(sidebar.getByText(item.title, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("group", {
      name: `${stop.name}: 0 of 0 items done`,
    }),
  ).toBeVisible();
  const library = (await (await testApi(page, user, "/api/items")).json()) as Array<{
    id: string;
  }>;
  expect(library.map((listed) => listed.id)).toContain(item.id);
  const otherDetail = (await (
    await testApi(page, user, `/api/trails/${trail.id}/stops/${otherStop.id}`)
  ).json()) as { items: Array<{ id: string }> };
  expect(otherDetail.items.map((listed) => listed.id)).toContain(item.id);
});

test("a Stop detail failure retries inside the sidebar without replacing the Trail", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one representative retry path");
  const user = `${testInfo.project.name}-stop-sidebar-retry`;
  const trail = (await (
    await testApi(page, user, "/api/trails", "POST", { name: "Retry Trail" })
  ).json()) as { id: string };
  const stop = (await (
    await testApi(page, user, `/api/trails/${trail.id}/stops`, "POST", {
      name: "Retry Stop",
    })
  ).json()) as { id: string; name: string };
  let failing = true;
  await page.route(
    `**/api/trails/${trail.id}/stops/${stop.id}`,
    async (route) => {
      if (failing) {
        await route.fulfill({ status: 503, json: { error: "temporarily down" } });
      } else {
        await route.continue();
      }
    },
  );

  await page.goto(testAppUrl(`/trails/${trail.id}/stops/${stop.id}`, user));
  const loadingSidebar = page.getByRole("complementary", {
    name: "Stop details",
  });
  await expect(loadingSidebar.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Open ${stop.name}` }),
  ).toBeVisible();

  failing = false;
  await loadingSidebar.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("complementary", { name: `${stop.name} details` }),
  ).toBeVisible();
});
