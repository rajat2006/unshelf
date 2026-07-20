import { expect, test, type Page } from "@playwright/test";
import { Type } from "@unshelf/shared";
import { testApi, testAppUrl } from "./test-helpers";

async function seedTrailStop(page: Page, user: string, name: string) {
  const trail = (await (
    await testApi(page, user, "/api/trails", "POST", { name: `${name} Trail` })
  ).json()) as { id: string };
  const stop = (await (
    await testApi(page, user, `/api/trails/${trail.id}/stops`, "POST", { name })
  ).json()) as { id: string; name: string };
  return { ...stop, trailId: trail.id };
}

async function seedLabelledItem(
  page: Page,
  user: string,
  title: string,
  type: Type,
  labelName: string,
) {
  const item = (await (
    await testApi(page, user, "/api/items", "POST", { title, type })
  ).json()) as { id: string };
  const label = (await (
    await testApi(page, user, "/api/labels", "POST", { name: labelName })
  ).json()) as { id: string };
  await testApi(
    page,
    user,
    `/api/items/${item.id}/labels/${label.id}`,
    "POST",
  );
  return { item, label };
}

test("the Library triages one shared Item across Status, Target date, and Stops", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-triage`;
  const foreignUser = `${user}-foreign`;
  const firstStop = await seedTrailStop(page, user, "Foundations");
  const secondStop = await seedTrailStop(page, user, "Practice");
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Shared TypeScript handbook",
      type: "book",
    })
  ).json()) as { id: string };
  await testApi(page, foreignUser, "/api/items", "POST", {
    title: "Someone else's private Item",
    type: "article",
  });

  await page.goto(testAppUrl("/library", user));

  await expect(
    page.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  await expect(page.getByText("Shared TypeScript handbook")).toBeVisible();
  await expect(page.getByText("Someone else's private Item")).toHaveCount(0);

  const status = page.getByRole("group", {
    name: "Status for Shared TypeScript handbook",
  });
  for (const choice of ["Not started", "In progress", "Done"]) {
    await expect(status.getByRole("button", { name: choice })).toBeVisible();
  }
  await status.getByRole("button", { name: "In progress" }).click();
  await expect(
    status.getByRole("button", { name: "In progress" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Target date for Shared TypeScript handbook").fill(
    "2000-01-01",
  );
  const pastTarget = page.getByText("Past target", { exact: true });
  await expect(pastTarget).toBeVisible();
  await expect(pastTarget).toHaveCSS("color", "rgb(118, 124, 136)");

  const placement = page.getByRole("group", {
    name: "Stop placement for Shared TypeScript handbook",
  });
  await expect(placement.getByText("Not in a Stop")).toBeVisible();

  const stopPicker = page.getByLabel("Add Shared TypeScript handbook to a Stop");
  await stopPicker.selectOption(firstStop.id);
  await expect(placement.getByText(firstStop.name, { exact: true })).toBeVisible();
  await stopPicker.selectOption(secondStop.id);
  await expect(placement.getByText(secondStop.name, { exact: true })).toBeVisible();

  await testApi(page, user, `/api/stops/${firstStop.id}/items`, "POST", {
    itemId: item.id,
  });
  await expect(
    placement.getByText(firstStop.name, { exact: true }),
  ).toHaveCount(1);

  await status.getByRole("button", { name: "Done" }).click();
  await expect(pastTarget).toHaveCount(0);
  await expect(
    page.getByLabel("Target date for Shared TypeScript handbook"),
  ).toHaveValue("2000-01-01");

  const stored = (await (await testApi(page, user, "/api/items")).json()) as Array<{
    id: string;
    status: string;
    targetDate: string | null;
    completedAt: string | null;
  }>;
  expect(stored).toEqual([
    expect.objectContaining({
      id: item.id,
      status: "done",
      targetDate: "2000-01-01",
      completedAt: expect.any(String),
    }),
  ]);

  for (const stop of [firstStop, secondStop]) {
    const detail = (await (
      await testApi(page, user, `/api/stops/${stop.id}`)
    ).json()) as { items: Array<{ id: string }> };
    expect(detail.items.map((member) => member.id)).toEqual([item.id]);
  }

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);

  await page.goto(
    testAppUrl(
      `/trails/${firstStop.trailId}/stops/${firstStop.id}`,
      user,
    ),
  );
  const stopSidebar = page.getByRole("complementary", {
    name: `${firstStop.name} details`,
  });
  await expect(
    stopSidebar
      .getByRole("group", { name: "Status for Shared TypeScript handbook" })
      .getByRole("button", { name: "Done" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    stopSidebar.getByLabel("Target date for Shared TypeScript handbook"),
  ).toHaveValue("2000-01-01");
});

test("a Library Item applies and removes provisioned private Labels by keyboard", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-labels`;
  const foreignUser = `${user}-foreign`;
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Labelled handbook",
      type: "book",
    })
  ).json()) as { id: string };
  const systems = (await (
    await testApi(page, user, "/api/labels", "POST", { name: "Systems" })
  ).json()) as { id: string };
  const reading = (await (
    await testApi(page, user, "/api/labels", "POST", { name: "Reading" })
  ).json()) as { id: string };
  await testApi(
    page,
    foreignUser,
    "/api/labels",
    "POST",
    { name: "Someone else's Label" },
  );
  await testApi(
    page,
    user,
    `/api/items/${item.id}/labels/${systems.id}`,
    "POST",
  );

  await page.goto(testAppUrl("/library", user));

  const labels = page.getByRole("group", {
    name: "Labels for Labelled handbook",
  });
  await expect(labels.getByRole("button", { name: "Remove Systems" })).toBeVisible();
  await expect(labels.getByText("Someone else's Label")).toHaveCount(0);

  await labels.getByLabel("Add a Label to Labelled handbook").selectOption(reading.id);
  await labels
    .getByRole("button", { name: "Apply Label", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(labels.getByRole("button", { name: "Remove Reading" })).toBeVisible();

  await expect(labels.getByLabel("New Label for Labelled handbook")).toHaveCount(0);
  await expect(
    labels.getByRole("button", { name: "Create and apply Label" }),
  ).toHaveCount(0);

  await labels.getByRole("button", { name: "Remove Systems" }).focus();
  await page.keyboard.press("Enter");
  await expect(labels.getByRole("button", { name: "Remove Systems" })).toHaveCount(0);

  const stored = (await (
    await testApi(page, user, `/api/items/${item.id}`)
  ).json()) as { labels: Array<{ name: string }> };
  expect(stored.labels.map((label) => label.name)).toEqual(["Reading"]);
});

test("selecting and clearing a Label filter updates the URL and visible Library Items", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-label-filter`;
  const { item: labelled, label: systems } = await seedLabelledItem(
    page,
    user,
    "Distributed systems notes",
    Type.Article,
    "Systems",
  );
  await testApi(page, user, "/api/items", "POST", {
    title: "Unlabelled reading",
    type: "book",
  });

  await page.goto(testAppUrl("/library", user));
  await page.getByRole("button", { name: "Filter by Systems" }).click();

  await expect(page).toHaveURL(new RegExp(`[?&]label=${systems.id}(?:&|$)`));
  await expect(page.getByText("Distributed systems notes", { exact: true })).toBeVisible();
  await expect(page.getByText("Unlabelled reading", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Show all Items" }).click();

  await expect(page).not.toHaveURL(/[?&]label=/);
  await expect(page.getByText("Distributed systems notes", { exact: true })).toBeVisible();
  await expect(page.getByText("Unlabelled reading", { exact: true })).toBeVisible();
  const stored = (await (
    await testApi(page, user, `/api/items/${labelled.id}`)
  ).json()) as { labels: Array<{ id: string }> };
  expect(stored.labels.map((label) => label.id)).toEqual([systems.id]);

  await page.getByRole("link", { name: "Trails", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Filter by Label" }),
  ).toHaveCount(0);
});

test("a bookmarked Label filter survives refresh and follows browser history", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-label-history`;
  const { label: systems } = await seedLabelledItem(
    page,
    user,
    "Systems Item",
    Type.Article,
    "Systems",
  );
  await seedLabelledItem(
    page,
    user,
    "Design Item",
    Type.Video,
    "Design",
  );

  await page.goto(testAppUrl("/library", user, { label: systems.id }));
  await expect(page.getByText("Systems Item", { exact: true })).toBeVisible();
  await expect(page.getByText("Design Item", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filter by Systems" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.reload();
  await expect(page.getByText("Systems Item", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Filter by Design" }).click();
  await expect(page.getByText("Design Item", { exact: true })).toBeVisible();
  await expect(page.getByText("Systems Item", { exact: true })).toHaveCount(0);

  await page.goBack();
  await expect(page.getByText("Systems Item", { exact: true })).toBeVisible();
  await expect(page.getByText("Design Item", { exact: true })).toHaveCount(0);

  await page.goForward();
  await expect(page.getByText("Design Item", { exact: true })).toBeVisible();
  await expect(page.getByText("Systems Item", { exact: true })).toHaveCount(0);
});

test("an empty Label result names the filter and clears back to the complete Library", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-label-empty`;
  await testApi(page, user, "/api/items", "POST", {
    title: "An unlabelled Item",
    type: "other",
  });
  const systems = (await (
    await testApi(page, user, "/api/labels", "POST", { name: "Systems" })
  ).json()) as { id: string };

  await page.goto(testAppUrl("/library", user, { label: systems.id }));

  await expect(page.getByText('No Items match "Systems"', { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture your first Item" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear Label filter" }).click();

  await expect(page).not.toHaveURL(/[?&]label=/);
  await expect(page.getByText("An unlabelled Item", { exact: true })).toBeVisible();
});

test("foreign and invalid Label filters share one private recoverable state", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-label-private`;
  const foreignUser = `${user}-foreign`;
  await testApi(page, user, "/api/items", "POST", {
    title: "Owner's visible Item",
    type: "course",
  });
  const foreignLabel = (await (
    await testApi(page, foreignUser, "/api/labels", "POST", {
      name: "Secret foreign Label",
    })
  ).json()) as { id: string };

  for (const labelId of [foreignLabel.id, "not-a-label-id"]) {
    await page.goto(testAppUrl("/library", user, { label: labelId }));

    await expect(page.getByText("Label unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText("Secret foreign Label", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Owner's visible Item", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear Label filter" }).click();

    await expect(page).not.toHaveURL(/[?&]label=/);
    await expect(page.getByText("Owner's visible Item", { exact: true })).toBeVisible();
  }
});

test("Label query parameters do not create filters outside the Library route", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-label-route-boundary`;
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Canonical Item",
      type: "article",
    })
  ).json()) as { id: string };
  const label = (await (
    await testApi(page, user, "/api/labels", "POST", { name: "Systems" })
  ).json()) as { id: string };

  await page.goto(testAppUrl(`/items/${item.id}`, user, { label: label.id }));

  await expect(
    page.getByRole("complementary", { name: "Canonical Item details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Filter by Label" }),
  ).toHaveCount(0);
});

test("a truly empty Library still offers Capture with an invalid Label filter", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-empty-invalid-label`;

  await page.goto(testAppUrl("/library", user, { label: "not-a-label-id" }));

  await expect(page.getByText("Nothing captured yet", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Capture your first Item" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all Items" }).click();
  await expect(page).not.toHaveURL(/[?&]label=/);
});

test("the Library keeps its shell while row-shaped loading resolves", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-loading`;
  await testApi(page, user, "/api/items", "POST", {
    title: "Appears after loading",
    type: "article",
  });

  let releaseItems!: () => void;
  await page.route("**/api/items", async (route) => {
    await new Promise<void>((resolve) => {
      releaseItems = resolve;
    });
    await route.continue();
  });

  await page.goto(testAppUrl("/library", user), { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("status", { name: "Loading Library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Trails", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Library", exact: true }),
  ).toBeVisible();

  releaseItems();
  await expect(page.getByText("Appears after loading")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading Library" }),
  ).toHaveCount(0);
});

test("a Library failure retries in place without replacing the shell", async ({
  page,
  context,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-retry`;
  await testApi(page, user, "/api/items", "POST", {
    title: "Recovered Item",
    type: "video",
  });
  let failing = true;
  await context.route("**/api/items", async (route) => {
    if (route.request().method() === "GET" && failing) {
      await route.fulfill({ status: 503, json: { error: "temporarily down" } });
      return;
    }
    await route.continue();
  });

  await page.goto(testAppUrl("/library", user));
  await expect(page.getByRole("alert")).toContainText("Couldn't load this");
  await expect(
    page.getByRole("link", { name: "Library", exact: true }),
  ).toBeVisible();

  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Recovered Item", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a truly empty Library opens global Capture", async ({ page }, testInfo) => {
  const user = `${testInfo.project.name}-library-empty`;
  await page.goto(testAppUrl("/library", user));

  await expect(page.getByText("Nothing captured yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Capture your first Item" }).click();
  await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
  await expect(page).toHaveURL(/\/test\/browser\/library(\?|$)/);
});

test("an older Library refresh cannot hide an Item captured by a newer refresh", async ({
  page,
  context,
}, testInfo) => {
  const user = `${testInfo.project.name}-library-refresh-order`;
  await page.goto(testAppUrl("/library", user));
  await expect(page.getByText("Nothing captured yet", { exact: true })).toBeVisible();

  let delayNextList = true;
  let releaseOlder!: () => void;
  const olderReleased = new Promise<void>((resolve) => {
    releaseOlder = resolve;
  });
  let olderRequestSeen!: () => void;
  const olderSeen = new Promise<void>((resolve) => {
    olderRequestSeen = resolve;
  });
  let olderResponseCommitted!: () => void;
  const olderCommitted = new Promise<void>((resolve) => {
    olderResponseCommitted = resolve;
  });
  await context.route("**/api/items", async (route) => {
    if (route.request().method() === "GET" && delayNextList) {
      delayNextList = false;
      const olderResponse = await route.fetch();
      olderRequestSeen();
      await olderReleased;
      await route.fulfill({ response: olderResponse });
      olderResponseCommitted();
      return;
    }
    await route.continue();
  });

  async function capture(title: string) {
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Capture" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Type").selectOption("article");
    await dialog.getByRole("button", { name: "Add to Library" }).click();
    await expect(dialog).toBeHidden();
  }

  await capture("Captured first");
  await olderSeen;
  await capture("Captured second");
  await expect(page.getByText("Captured second", { exact: true })).toBeVisible();

  releaseOlder();
  await olderCommitted;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByText("Captured first", { exact: true })).toBeVisible();
  await expect(page.getByText("Captured second", { exact: true })).toBeVisible();
});
