import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function startLearningPlan(page: Page, user: string): Promise<void> {
  await page.goto(testAppUrl("/plans", user));
  await page
    .getByLabel("Learning Plan name")
    .fill("Editorial learning journey");
  await page.getByRole("button", { name: "Start a Learning Plan" }).click();
  await page.getByRole("link", { name: /Editorial learning journey/ }).click();
}

async function addStage(
  page: Page,
  name: string,
  first = false,
): Promise<void> {
  if (first) {
    await page
      .getByRole("button", { name: /Start your Learning Plan/ })
      .click();
  } else {
    await page.getByRole("button", { name: "Add next Stage" }).last().click();
  }
  const input = page.getByPlaceholder(
    first ? "Name your first stage" : "Name the new stage",
  );
  await input.fill(name);
  await input.press("Enter");
  if (first) {
    await page.getByRole("button", { name: "＋ Add another Stage" }).click();
    const next = page.getByPlaceholder("Name another stage");
    await next.fill(`${name} continuation`);
    await next.press("Enter");
    const looseStage = page
      .getByRole("complementary", { name: /Unsequenced/ })
      .getByRole("listitem")
      .filter({ hasText: `${name} continuation` });
    await looseStage
      .getByRole("button", { name: `Sequence ${name} continuation` })
      .click();
    await looseStage.getByLabel("Follows").selectOption({ label: name });
    await looseStage
      .getByRole("button", { name: "Sequence", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: `Open ${name}`, exact: true }),
  ).toBeVisible();
}

test("the Learning Plan uses warm editorial styling in both color schemes and exposes non-color state cues", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop creates the topology");
  const user = `${testInfo.project.name}-editorial-theme`;

  await page.emulateMedia({ colorScheme: "light" });
  await startLearningPlan(page, user);
  await addStage(page, "Begin here", true);

  const canvas = page.getByRole("region", { name: "Learning Plan canvas" });
  await expect(canvas).toHaveCSS("background-color", "rgb(250, 249, 245)");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
    "font-family",
    /Georgia/,
  );
  await expect(page.getByText("You are here", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Dotted path: ahead", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Solid path: walked", { exact: true }),
  ).toBeVisible();

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(canvas).toHaveCSS("background-color", "rgb(27, 32, 27)");

  await expectNoAccessibilityViolations(page);
});

test("the shipped surfaces pass automated accessibility checks", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-quiet-focus-a11y`;
  await page.goto(testAppUrl("/plans", user));

  await expectNoAccessibilityViolations(page);
});

test("completed Stages, overlays, rows, and sidebars remain accessible", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "one representative accessibility pass",
  );
  const user = `${testInfo.project.name}-quiet-focus-complete`;
  const learningPlan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Accessible LearningPlan",
    })
  ).json()) as { id: string };
  const stage = (await (
    await testApi(
      page,
      user,
      `/api/learning-plans/${learningPlan.id}/stages`,
      "POST",
      {
        name: "Complete Stage",
      },
    )
  ).json()) as { id: string };
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Accessible Item",
      type: "article",
      source: "",
    })
  ).json()) as { id: string };
  await testApi(page, user, `/api/stages/${stage.id}/items`, "POST", {
    itemId: item.id,
  });
  await testApi(page, user, `/api/items/${item.id}/status`, "PATCH", {
    status: "done",
  });

  await page.goto(testAppUrl(`/plans/${learningPlan.id}`, user));
  await expect(page.getByText(/Completed stage/).first()).toBeAttached();
  await expectNoAccessibilityViolations(page);

  await page.goto(testAppUrl("/library", user));
  await expect(
    page.getByRole("link", { name: "Accessible Item" }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expectNoAccessibilityViolations(page);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("link", { name: "Accessible Item" }).click();
  await expect(
    page.getByRole("complementary", { name: /Accessible Item details/ }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await page.goto(
    testAppUrl(`/plans/${learningPlan.id}/stages/${stage.id}`, user),
  );
  await expect(
    page.getByRole("complementary", { name: /Complete Stage details/ }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("reduced motion removes LearningPlan progress transitions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "covered once at desktop width");
  const user = `${testInfo.project.name}-quiet-focus-motion`;

  await page.emulateMedia({ reducedMotion: "reduce" });
  await startLearningPlan(page, user);
  await addStage(page, "Motionless stage", true);

  expect(
    await page
      .locator(".progress-ring__value")
      .first()
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).transitionDuration),
      ),
  ).toBeLessThanOrEqual(0.00001);
});

test("a phone pans only inside its view-only Learning Plan canvas", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone reflow behavior");
  const user = `${testInfo.project.name}-quiet-focus-pan`;

  await page.setViewportSize({ width: 1024, height: 800 });
  await startLearningPlan(page, user);
  const learningPlanPath = new URL(page.url()).pathname.replace(
    "/test/browser",
    "",
  );
  await addStage(page, "One", true);
  await addStage(page, "Two");
  await addStage(page, "Three");
  await addStage(page, "Four");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(testAppUrl(learningPlanPath, user));

  const canvas = page.getByRole("region", { name: "Learning Plan canvas" });
  await expect(canvas).toHaveCSS("overflow-x", "auto");
  expect(
    await canvas.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Add next Stage" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove this link" }),
  ).toHaveCount(0);
});
