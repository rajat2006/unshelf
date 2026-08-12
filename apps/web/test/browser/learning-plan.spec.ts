import { expect, test, type Page } from "@playwright/test";
import { PlanNodeKind } from "@unshelf/shared";
import type {
  Item,
  LearningPlan,
  LearningPlanView,
  Stage,
} from "@unshelf/shared";
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
  await page
    .getByRole("button", {
      name: "Disconnect Learn the basics from Build something",
    })
    .click();
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
  await expect(page.getByRole("button", { name: /^Disconnect / })).toHaveCount(
    0,
  );
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
    .getByRole("button", {
      name: "Link from Parallel reading to another node",
    })
    .click();
  await looseItem.getByLabel("Before").selectOption({ label: "Main branch" });
  await looseItem.getByRole("button", { name: "Link", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Linked Parallel reading to Main branch",
  );

  const parallelBranch = page.getByRole("group", {
    name: /^Parallel branch:/,
  });
  const startLink = parallelBranch.getByRole("button", {
    name: "Link from Parallel branch to another node",
  });
  await startLink.focus();
  await startLink.press("Enter");
  const parallelReading = page.getByRole("group", {
    name: /^Parallel reading:/,
  });
  const linkToReading = parallelReading.getByRole("button", {
    name: "Link Parallel branch to Parallel reading",
  });
  await linkToReading.focus();
  await linkToReading.press("Enter");
  await expect(page.getByRole("status")).toHaveText(
    "Linked Parallel branch to Parallel reading",
  );

  await page.goto(deepLink);
  await expect(page.getByRole("button", { name: /^Disconnect / })).toHaveCount(
    4,
  );
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
  await expect(
    page.getByRole("heading", { level: 1, name: "Distributed systems" }),
  ).toBeVisible();
  await page
    .getByRole("complementary", {
      name: "Designing Data-Intensive Applications details",
    })
    .getByRole("button", { name: "Close details" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/plans/[0-9a-f-]{36}$`));

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

test("a phone User views connected Plan structure without authoring or overflow", async ({
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
  const placed = (await (
    await testApi(page, user, `/api/learning-plans/${plan.id}/items`, "POST", {
      itemId: item.id,
    })
  ).json()) as LearningPlanView;
  const itemNodeId = placed.nodes.find(
    (node) => node.kind === PlanNodeKind.Item,
  )!.id;
  const createStage = async (name: string) =>
    (await (
      await testApi(
        page,
        user,
        `/api/learning-plans/${plan.id}/stages`,
        "POST",
        { name },
      )
    ).json()) as Stage;
  const foundation = await createStage("Foundation");
  const parallel = await createStage("Parallel practice");
  const rejoin = await createStage("Apply everything");
  const connect = ({
    fromNodeId,
    toNodeId,
  }: {
    fromNodeId: string;
    toNodeId: string;
  }) =>
    testApi(page, user, `/api/learning-plans/${plan.id}/edges`, "POST", {
      fromNodeId,
      toNodeId,
    });
  await connect({ fromNodeId: foundation.id, toNodeId: itemNodeId });
  await connect({ fromNodeId: foundation.id, toNodeId: parallel.id });
  await connect({ fromNodeId: itemNodeId, toNodeId: rejoin.id });
  await connect({ fromNodeId: parallel.id, toNodeId: rejoin.id });

  await page.goto(testAppUrl(`/plans/${plan.id}`, user));
  const itemLink = page.getByRole("link", { name: "Open Database Internals" });
  await expect(itemLink).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Foundation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Parallel practice" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Apply everything" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Library placement drawer" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^(Link from|Disconnect) / }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.reload();
  await expect(itemLink).toBeVisible();
  await itemLink.click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
});

test("a User adds direct and staged Plan Items to Today with durable origin context", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-plan-today-origin`;
  const plan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Practical databases",
    })
  ).json()) as LearningPlan;
  const directItem = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Read Database Internals",
      type: "book",
    })
  ).json()) as Item;
  const stagedItem = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Practice query planning",
      type: "course",
    })
  ).json()) as Item;
  await testApi(page, user, `/api/learning-plans/${plan.id}/items`, "POST", {
    itemId: directItem.id,
  });
  const stage = (await (
    await testApi(page, user, `/api/learning-plans/${plan.id}/stages`, "POST", {
      name: "Query engines",
    })
  ).json()) as Stage;
  await testApi(page, user, `/api/stages/${stage.id}/items`, "POST", {
    itemId: stagedItem.id,
  });

  await page.goto(testAppUrl(`/plans/${plan.id}`, user));
  const sidecar = page.getByRole("complementary", { name: "Today sidecar" });
  await expect(
    page.getByRole("complementary", { name: /Discover/i }),
  ).toHaveCount(0);
  await sidecar
    .getByRole("button", { name: `Add ${directItem.title} to Today` })
    .click();
  await sidecar
    .getByRole("button", { name: `Add ${stagedItem.title} to Today` })
    .click();
  await expect(sidecar.getByText("2 Items in Today")).toBeVisible();

  await page.reload();
  await expect(
    sidecar.getByRole("button", { name: `${directItem.title} is in Today` }),
  ).toBeDisabled();
  await expect(
    sidecar.getByRole("button", { name: `${stagedItem.title} is in Today` }),
  ).toBeDisabled();

  await page.goto(testAppUrl("/today", user));
  const focus = page.getByRole("region", { name: "Today's Daily Focus" });
  await expect(
    focus.getByText("From Practical databases · Query engines"),
  ).toBeVisible();
  await focus.getByRole("link", { name: stagedItem.title }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${stagedItem.id}$`));
  await expect(
    page.getByRole("link", { name: "Plans", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("complementary", { name: "Query engines details" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Practical databases" }),
  ).toBeVisible();
  await page
    .getByRole("complementary", { name: `${stagedItem.title} details` })
    .getByRole("button", { name: "Close details" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/plans/${plan.id}/stages/${stage.id}$`),
  );
  await expect(
    page.getByRole("complementary", { name: "Query engines details" }),
  ).toBeVisible();

  if (testInfo.project.name === "phone") {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    await expect(
      page.getByRole("button", { name: /^(Link from|Disconnect) / }),
    ).toHaveCount(0);
  }
});

test("the Plan Today sidecar contains a failed load and retries locally", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-plan-today-retry`;
  const plan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Resilient planning",
    })
  ).json()) as LearningPlan;
  let todayReadsAvailable = false;
  await page.route("**/api/daily-focus/today", async (route) => {
    if (!todayReadsAvailable) {
      await route.fulfill({
        status: 503,
        json: { error: "temporarily unavailable" },
      });
      return;
    }
    await route.continue();
  });

  await page.goto(testAppUrl(`/plans/${plan.id}`, user));

  const sidecar = page.getByRole("complementary", { name: "Today sidecar" });
  await expect(sidecar.getByRole("alert")).toContainText("Couldn’t load Today");
  await expect(
    page.getByRole("link", { name: "Plans", exact: true }),
  ).toBeVisible();

  todayReadsAvailable = true;
  await sidecar.getByRole("button", { name: "Retry" }).click();

  await expect(sidecar.getByText("0 Items in Today")).toBeVisible();
  await expect(sidecar.getByRole("alert")).toHaveCount(0);
});

test("the Plan canvas contains a failed edit and retries locally", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop authors plan topology");
  const user = `${testInfo.project.name}-plan-canvas-retry`;
  const plan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Recoverable canvas",
    })
  ).json()) as LearningPlan;
  await page.route(`**/api/learning-plans/${plan.id}/stages`, async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: "temporarily unavailable" },
    });
  });

  await page.goto(testAppUrl(`/plans/${plan.id}`, user));
  await page.getByRole("button", { name: /Start your Learning Plan/ }).click();
  await page.getByPlaceholder("Name your first stage").fill("Foundations");
  await page.getByPlaceholder("Name your first stage").press("Enter");

  const canvasError = page
    .getByRole("alert")
    .filter({ hasText: "Could not change the Learning Plan" });
  await expect(canvasError).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Plans", exact: true }),
  ).toBeVisible();

  await canvasError.getByRole("button", { name: "Retry" }).click();

  await expect(canvasError).toHaveCount(0);
  await expect(page.getByPlaceholder("Name your first stage")).toHaveValue(
    "Foundations",
  );
});
