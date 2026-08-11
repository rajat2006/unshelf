import { expect, test, type Page } from "@playwright/test";
import { testAppUrl } from "./test-helpers";

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
  await looseStage.getByRole("button", { name: "Sequence this Stage" }).click();
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

test("a desktop User forks and rejoins the LearningPlan through its authoring controls", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "authoring is a desktop gesture (US 40)",
  );
  const user = `${testInfo.project.name}-learning-plan-fork-rejoin`;

  await page.goto(testAppUrl("/plans", user));
  const { deepLink } = await startAndOpenLearningPlan({
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

  const parallel = page.getByRole("group", { name: /^Parallel branch:/ });
  await parallel
    .getByRole("button", { name: "Link to an existing Stage" })
    .click();
  const rejoin = page
    .getByRole("group", { name: /^Main branch:/ })
    .getByRole("button", { name: "⇢ link here" });
  await rejoin.focus();
  await rejoin.press("Enter");

  await page.goto(deepLink);
  await expect(
    page.getByRole("button", { name: "Remove this link" }),
  ).toHaveCount(3);
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
