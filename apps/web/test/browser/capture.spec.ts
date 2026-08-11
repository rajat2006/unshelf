import { expect, test, type Page } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

/**
 * Capture as a global chrome action (#92, design spec §3, ADR-0014). Capture is a
 * non-navigating overlay opened from the top bar or by keyboard on every signed-in
 * surface; it stays pure intake (required title, chosen Type, optional Source),
 * files the Item into the Library, and leaves the User where they were. These
 * assert external behaviour — the visible composer, the URL staying put, the Item
 * appearing in the store, errors staying inside the overlay — not markup.
 */

function appUrl(
  testInfo: { project: { name: string } },
  path: string,
  user = `${testInfo.project.name}-capture-user`,
): string {
  return testAppUrl(path, user);
}

function captureButton(page: Page) {
  return page.getByRole("button", { name: "Capture", exact: true });
}

function composer(page: Page) {
  return page.getByRole("dialog", { name: "Capture" });
}

// Every signed-in surface carries the same global Capture action, and opening it
// never changes the route — it opens over wherever the User already was.
for (const surface of [
  { name: "Learning Plans index", path: "/plans" },
  { name: "Library", path: "/library" },
  { name: "a LearningPlan", path: "/plans/learning-plan-1" },
  { name: "an Item", path: "/items/item-1" },
]) {
  test(`Capture opens over ${surface.name} without changing the URL`, async ({
    page,
  }, testInfo) => {
    await page.goto(appUrl(testInfo, surface.path));
    const urlBefore = page.url();

    await captureButton(page).click();
    await expect(composer(page)).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    // The composer names its destination: intake lands in the Library, not a LearningPlan.
    await expect(
      composer(page).getByText(/land in your Library/),
    ).toBeVisible();

    // Dismissing it also leaves the route untouched.
    await page.keyboard.press("Escape");
    await expect(composer(page)).toBeHidden();
    expect(page.url()).toBe(urlBefore);
  });
}

test("Command/Ctrl+K opens Capture when focus is not in an editable control", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/plans"));
  await expect(composer(page)).toBeHidden();

  await page.keyboard.press("Control+k");
  await expect(composer(page)).toBeVisible();
});

test("the c shortcut opens Capture when focus is not in an editable control", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/plans"));
  await expect(composer(page)).toBeHidden();

  await page.keyboard.press("c");
  await expect(composer(page)).toBeVisible();
});

test("shortcuts are suppressed while focus is in an editable control", async ({
  page,
}, testInfo) => {
  // Home carries an editable field (the LearningPlan-name composer); focus it.
  await page.goto(appUrl(testInfo, "/plans"));
  const field = page.getByLabel("Learning Plan name");
  await field.click();
  await page.keyboard.press("c");
  await expect(composer(page)).toBeHidden();
  await expect(field).toHaveValue("c");

  await page.keyboard.press("Control+k");
  await expect(composer(page)).toBeHidden();
});

test("a successful capture lands the Item in the Library and leaves the User on the originating surface", async ({
  page,
}, testInfo) => {
  const title = `${testInfo.project.name} captured from Library`;
  await page.goto(appUrl(testInfo, "/library"));

  await captureButton(page).click();
  const dialog = composer(page);
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Type").selectOption("article");
  await dialog.getByLabel(/Source/).fill("https://example.com/read");
  await dialog.getByRole("button", { name: "Add to Library" }).click();

  // The overlay closes cleanly and the User stays on the surface they captured from.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/test\/browser\/library(\?|$)/);

  // It entered the store — the Library, where every capture lands — and shows there.
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("an offline Capture from a Learning Plan stays uncommitted and preserves Plan context", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-capture-from-plan`;
  const learningPlan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Systems path",
    })
  ).json()) as { id: string };
  const planUrl = appUrl(testInfo, `/plans/${learningPlan.id}`, user);
  await page.goto(planUrl);

  await captureButton(page).click();
  const dialog = composer(page);
  await dialog.getByLabel("Title").fill("Offline systems book");
  await dialog.getByLabel("Type").selectOption("book");
  await dialog.getByRole("button", { name: "Add to Library" }).click();

  await expect(dialog).toBeHidden();
  expect(`${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(
    planUrl,
  );
  const items = (await (
    await testApi(page, user, "/api/items")
  ).json()) as Array<{ id: string; source: string | null; labels: unknown[] }>;
  expect(items).toEqual([
    expect.objectContaining({ source: null, labels: [] }),
  ]);
  const placements = (await (
    await testApi(page, user, `/api/items/${items[0].id}/placements`)
  ).json()) as {
    learningPlans: Array<{ kind: string }>;
  };
  expect(placements.learningPlans).toEqual([
    expect.objectContaining({ kind: "available" }),
  ]);
});

test("Capture preserves Source verbatim and allows duplicate Sources", async ({
  page,
}, testInfo) => {
  const source = "https://example.com/same";
  const first = `${testInfo.project.name} dup one`;
  const second = `${testInfo.project.name} dup two`;
  await page.goto(appUrl(testInfo, "/library"));

  for (const title of [first, second]) {
    await captureButton(page).click();
    const dialog = composer(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Type").selectOption("article");
    await dialog.getByLabel(/Source/).fill(source);
    await dialog.getByRole("button", { name: "Add to Library" }).click();
    await expect(dialog).toBeHidden();
  }

  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
  // Both kept the identical Source verbatim — capture never dedupes.
  await expect(page.getByRole("link", { name: source })).toHaveCount(2);
});

test("validation keeps an incomplete capture inside the overlay", async ({
  page,
}, testInfo) => {
  await page.goto(appUrl(testInfo, "/plans"));
  await captureButton(page).click();
  const dialog = composer(page);

  const submit = dialog.getByRole("button", { name: "Add to Library" });
  await expect(submit).toBeDisabled();

  await dialog.getByLabel("Title").fill("Needs a type still");
  await expect(submit).toBeDisabled();

  await dialog.getByLabel("Type").selectOption("book");
  await expect(submit).toBeEnabled();
});

test("an API failure stays visible and recoverable inside the overlay", async ({
  page,
  context,
}, testInfo) => {
  const title = `${testInfo.project.name} retried Item`;
  await page.goto(appUrl(testInfo, "/library"));

  let failNext = true;
  await context.route("**/api/items", async (route) => {
    if (route.request().method() === "POST" && failNext) {
      failNext = false;
      await route.fulfill({ status: 500, body: "boom" });
      return;
    }
    await route.continue();
  });

  await captureButton(page).click();
  const dialog = composer(page);
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Type").selectOption("article");
  await dialog.getByRole("button", { name: "Add to Library" }).click();

  // The failure surfaces inside the still-open composer; surrounding context survives.
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toBeVisible();

  // Retrying from the same composer succeeds and closes it.
  await dialog.getByRole("button", { name: "Add to Library" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});
