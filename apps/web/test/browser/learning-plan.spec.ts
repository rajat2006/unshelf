import { expect, test, type Page } from "@playwright/test";
import type { Item, LearningPlan } from "@unshelf/shared";
import { testApi, testAppUrl } from "./test-helpers";

/**
 * Authoring one LearningPlan through the application seam (#94, ADR-0010/0014). A LearningPlan
 * renders only its own Stages and edges, and on desktop it is authored by
 * arranging: add the first Stage, extend the sequence, and remove a link — each
 * creating or erasing records scoped to that one LearningPlan, surviving a reload. These
 * assert external behaviour — visible waypoints, the opened URL, persistence, and
 * per-User isolation of the topology — not the canvas markup or palette (its skin
 * is a later slice, #100).
 */

interface TestInfoLike {
  project: { name: string };
}

function defaultUser(testInfo: TestInfoLike): string {
  return `${testInfo.project.name}-learning-plan-user`;
}

/**
 * Create a LearningPlan from Home and open it. A card `Link` drops the harness's
 * `testUser` query, so this hands back a deep link that keeps it — the way to
 * reload or share the LearningPlan's URL in a test.
 */
async function startAndOpenLearningPlan({
  page,
  name,
  user,
}: {
  page: Page;
  name: string;
  user: string;
}): Promise<{ learningPlanId: string; deepLink: string }> {
  await page.getByLabel("Learning Plan name").fill(name);
  await page.getByRole("button", { name: "Start a Learning Plan" }).click();
  const card = page.getByRole("link", { name: new RegExp(name) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  const learningPlanId = /plans\/([0-9a-f-]{36})/.exec(page.url())![1];
  return {
    learningPlanId,
    deepLink: testAppUrl(`/plans/${learningPlanId}`, user),
  };
}

/** Add the first Stage to an empty LearningPlan via the desktop "start" affordance. */
async function addFirstStage(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Start your Learning Plan/ }).click();
  const field = page.getByPlaceholder("Name your first stage");
  await field.fill(name);
  await field.press("Enter");
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

async function addAndSequenceStage({
  page,
  name,
  predecessorName,
}: {
  page: Page;
  name: string;
  predecessorName: string;
}): Promise<void> {
  await page.getByRole("button", { name: "＋ Add another Stage" }).click();
  const field = page.getByPlaceholder("Name another stage");
  await field.fill(name);
  await field.press("Enter");

  const looseStage = page
    .getByRole("complementary", { name: /Unsequenced/ })
    .getByRole("listitem")
    .filter({ hasText: name });
  await looseStage.getByRole("button", { name: `Sequence ${name}` }).click();
  await looseStage
    .getByLabel("Follows")
    .selectOption({ label: predecessorName });
  await looseStage
    .getByRole("button", { name: "Sequence", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Open ${name}`, exact: true }),
  ).toBeVisible();
}

test("a desktop User adds the first Stage, extends the sequence, and it persists", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "authoring is a desktop gesture (US 40)",
  );
  const user = defaultUser(testInfo);

  await page.goto(testAppUrl("/plans", user));
  const { deepLink } = await startAndOpenLearningPlan({
    page,
    name: `${testInfo.project.name} authoring journey`,
    user,
  });

  // The empty LearningPlan invites the first Stage; adding it draws a waypoint.
  await addFirstStage(page, "Learn the basics");

  // Add another loose Stage, then explicitly place it after the first.
  await addAndSequenceStage({
    page,
    name: "Build something",
    predecessorName: "Learn the basics",
  });
  await expect(
    page.getByRole("button", { name: "Open Build something", exact: true }),
  ).toBeVisible();

  // Both waypoints are the LearningPlan's own topology — they survive a fresh load.
  await page.goto(deepLink);
  await expect(
    page.getByText("Learn the basics", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Build something", { exact: true }),
  ).toBeVisible();

  // Removing the link between them leaves both Stages in place, and the removal
  // itself persists.
  await page.getByRole("button", { name: "Remove this link" }).click();
  await expect(
    page.getByText("Learn the basics", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Build something", { exact: true }),
  ).toBeVisible();
  await page.goto(deepLink);
  await expect(
    page.getByText("Learn the basics", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove this link" }),
  ).toHaveCount(0);
});

test("a LearningPlan's Stages are private to its owner", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "authoring is a desktop gesture (US 40)",
  );

  const owner = `${testInfo.project.name}-learning-plan-owner`;
  await page.goto(testAppUrl("/plans", owner));
  const { learningPlanId } = await startAndOpenLearningPlan({
    page,
    name: `${testInfo.project.name} private topology`,
    user: owner,
  });
  await addFirstStage(page, "Owner only");

  // A different User opening the very same LearningPlan URL is refused it — the topology
  // is resolved from the authenticated User, so a foreign id reads as not found.
  const stranger = `${testInfo.project.name}-learning-plan-stranger`;
  await page.goto(testAppUrl(`/plans/${learningPlanId}`, stranger));
  await expect(
    page.getByRole("heading", { level: 1, name: "Learning Plan" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Owner only", { exact: true })).toHaveCount(0);
});

test("a desktop User forks and rejoins mixed Plan Nodes through keyboard-operable controls", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "authoring is a desktop gesture (US 40)",
  );
  const user = `${testInfo.project.name}-learning-plan-fork-rejoin`;

  await page.goto(testAppUrl("/plans", user));
  const { learningPlanId, deepLink } = await startAndOpenLearningPlan({
    page,
    name: "Forking journey",
    user,
  });
  await addFirstStage(page, "Foundation");
  await addAndSequenceStage({
    page,
    name: "Main branch",
    predecessorName: "Foundation",
  });

  const foundation = page.getByRole("group", { name: /^Foundation:/ });
  await foundation
    .getByRole("button", { name: "Fork a parallel branch" })
    .click();
  await page.getByPlaceholder("Name the new stage").fill("Parallel branch");
  await page.getByPlaceholder("Name the new stage").press("Enter");

  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Parallel reading",
      type: "article",
    })
  ).json()) as Item;
  await testApi(
    page,
    user,
    `/api/learning-plans/${learningPlanId}/items`,
    "POST",
    { itemId: item.id },
  );
  await page.goto(deepLink);

  const looseItem = page
    .getByRole("complementary", { name: /Unsequenced/ })
    .getByRole("listitem")
    .filter({ hasText: "Parallel reading" });
  await looseItem
    .getByRole("button", { name: "Sequence Parallel reading" })
    .click();
  await looseItem
    .getByLabel("Follows")
    .selectOption({ label: "Parallel branch" });
  await looseItem
    .getByRole("button", { name: "Sequence", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Sequenced Parallel reading after Parallel branch",
  );

  const parallelReading = page.getByRole("group", {
    name: /^Parallel reading:/,
  });
  await parallelReading
    .getByRole("button", {
      name: "Link from Parallel reading to another node",
    })
    .focus();
  await parallelReading
    .getByRole("button", {
      name: "Link from Parallel reading to another node",
    })
    .press("Enter");
  const rejoin = page
    .getByRole("group", { name: /^Main branch:/ })
    .getByRole("button", { name: "Link Parallel reading to Main branch" });
  await rejoin.focus();
  await rejoin.press("Enter");
  await expect(page.getByRole("status")).toHaveText(
    "Linked Parallel reading to Main branch",
  );

  await page.goto(deepLink);
  await expect(
    page.getByRole("button", { name: "Remove this link" }),
  ).toHaveCount(4);
});

test("at phone width the LearningPlan is viewed, not authored", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "view-only behaviour is a phone concern (US 40)",
  );
  const user = defaultUser(testInfo);

  await page.goto(testAppUrl("/plans", user));
  await startAndOpenLearningPlan({
    page,
    name: `${testInfo.project.name} view-only journey`,
    user,
  });

  // The empty LearningPlan offers no authoring on a phone — only guidance to a wider
  // screen — so unsupported touch editing is never presented as available.
  await expect(page.getByText(/Add some on a wider screen/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start your Learning Plan/ }),
  ).toHaveCount(0);
});

test("a desktop User places and removes a shared Library Item directly", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "placing Plan structure is desktop authoring",
  );
  const user = `${testInfo.project.name}-direct-plan-item`;
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Designing Data-Intensive Applications",
      type: "book",
    })
  ).json()) as Item;

  await page.goto(testAppUrl("/plans", user));
  const { deepLink } = await startAndOpenLearningPlan({
    page,
    name: "Distributed systems",
    user,
  });

  const drawer = page.getByRole("complementary", {
    name: "Library placement drawer",
  });
  await drawer.getByLabel("Search Library").fill("data-intensive");
  const result = drawer.getByRole("listitem").filter({
    hasText: "Designing Data-Intensive Applications",
  });
  await result.getByRole("button", { name: "Place directly" }).click();
  await expect(
    page.getByRole("link", {
      name: "Open Designing Data-Intensive Applications",
    }),
  ).toBeVisible();

  await page.goto(deepLink);
  const itemLink = page.getByRole("link", {
    name: "Open Designing Data-Intensive Applications",
  });
  await expect(itemLink).toBeVisible();
  await itemLink.click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));

  await page.goto(deepLink);
  await drawer.getByLabel("Search Library").fill("data-intensive");
  await drawer
    .getByRole("button", {
      name: "Remove Designing Data-Intensive Applications from this Learning Plan",
    })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Open Designing Data-Intensive Applications",
    }),
  ).toHaveCount(0);
  expect((await testApi(page, user, `/api/items/${item.id}`)).ok()).toBe(true);
});

test("a phone User views a direct placement and opens the shared Item", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone consultation flow");
  const user = `${testInfo.project.name}-direct-plan-item-view`;
  const plan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Systems reading",
    })
  ).json()) as LearningPlan;
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Database Internals",
      type: "book",
    })
  ).json()) as Item;
  await testApi(page, user, `/api/learning-plans/${plan.id}/items`, "POST", {
    itemId: item.id,
  });

  await page.goto(testAppUrl(`/plans/${plan.id}`, user));
  const itemLink = page.getByRole("link", { name: "Open Database Internals" });
  await expect(itemLink).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Library placement drawer" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await itemLink.click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
});
