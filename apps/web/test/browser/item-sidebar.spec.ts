import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

async function expectPopoverAccessible(page: Page) {
  const accessibility = await new AxeBuilder({ page })
    .include('[data-slot="popover-content"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
}

async function expectCalendarDayStatesDistinct(
  calendar: Locator,
  { selectedIsFocused = true } = {},
) {
  const selected = calendar.locator('button[data-selected="true"]');
  const outside = calendar.locator('button[data-outside="true"]').first();
  const ordinary = calendar
    .locator(
      "td:not([data-outside]) > button:not([data-selected]):not([data-today]):not(:disabled)",
    )
    .first();
  await expect(selected).toBeVisible();
  await expect(outside).toBeVisible();
  await expect(ordinary).toBeVisible();

  const [selectedStyle, outsideStyle, ordinaryStyle] = await Promise.all(
    [selected, outside, ordinary].map((day) =>
      day.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          color: style.color,
        };
      }),
    ),
  );
  expect(selectedStyle.backgroundColor).not.toBe(ordinaryStyle.backgroundColor);
  expect(outsideStyle.color).not.toBe(ordinaryStyle.color);
  expect(outsideStyle.borderColor).not.toBe(ordinaryStyle.borderColor);
  if (selectedIsFocused) {
    await expect(selected).toBeFocused();
    expect(selectedStyle.boxShadow).not.toBe(ordinaryStyle.boxShadow);
  }

  const disabledStyle = await ordinary.evaluate((element) => {
    const disabledDay = element.cloneNode(true) as HTMLButtonElement;
    disabledDay.disabled = true;
    disabledDay.dataset.disabled = "true";
    disabledDay.style.transition = "none";
    element.after(disabledDay);
    const style = getComputedStyle(disabledDay);
    const result = { borderColor: style.borderColor, color: style.color };
    disabledDay.remove();
    return result;
  });
  expect(disabledStyle.color).not.toBe(ordinaryStyle.color);
  expect(disabledStyle.borderColor).not.toBe(ordinaryStyle.borderColor);

  const selectedBounds = await selected.boundingBox();
  expect(selectedBounds?.width).toBeGreaterThanOrEqual(28);
  expect(selectedBounds?.height).toBeGreaterThanOrEqual(28);
}

async function showCalendarMonth({
  page,
  calendar,
  year,
  month,
}: {
  page: Page;
  calendar: Locator;
  year: string;
  month: string;
}) {
  const yearPicker = calendar.getByRole("combobox", {
    name: "Choose the Year",
  });
  await yearPicker.focus();
  await yearPicker.press("Enter");
  await page.getByRole("option", { name: String(Number(year)) }).press("Enter");
  const monthPicker = calendar.getByRole("combobox", {
    name: "Choose the Month",
  });
  await monthPicker.focus();
  await monthPicker.press("Enter");
  await page
    .getByRole("option", {
      name: new Intl.DateTimeFormat("en-US", { month: "long" }).format(
        new Date(2000, Number(month) - 1, 1),
      ),
    })
    .press("Enter");
}

async function expectTodayMarkerVisible(calendar: Locator) {
  const todayTile = calendar.locator('button[data-today="true"]');
  await expect(todayTile).toBeVisible();
  const marker = await todayTile.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return {
      backgroundColor: style.backgroundColor,
      height: style.height,
      width: style.width,
    };
  });
  const tileBackground = await todayTile.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(marker.width).toBe("4px");
  expect(marker.height).toBe("4px");
  expect(marker.backgroundColor).not.toBe(tileBackground);
}

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
  const status = sidebar.getByLabel(`Status for ${item.title}`);
  await expect(status).toContainText("In progress");
  await status.click();
  const doneOption = page.getByRole("option", { name: "Done" });
  await expect(doneOption).toBeInViewport();
  await doneOption.click();
  await expect(status).toContainText("Done");
  await expect(sidebar.getByLabel(`Target date for ${item.title}`)).toHaveValue(
    testInfo.project.name === "phone" ? "2099-06-15" : "15/06/2099",
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

test("the themed date picker chooses and saves a Target date across responsive inputs", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-themed-target-date`;
  const { item } = await seedPlacedItem(page, user);
  const authoritativeCalendar = (await (
    await testApi(page, user, "/api/server-calendar")
  ).json()) as { today: string };
  await testApi(page, user, `/api/items/${item.id}/target-date`, "PATCH", {
    targetDate: "2099-06-15",
  });
  await page.goto(testAppUrl(`/items/${item.id}`, user));

  const sidebar = page.getByRole("complementary", {
    name: `${item.title} details`,
  });
  const input = sidebar.getByLabel(`Target date for ${item.title}`);
  await expect(input).toHaveCount(1);

  if (testInfo.project.name === "phone") {
    await expect(input).toHaveAttribute("type", "date");
    await expect(
      sidebar.getByRole("button", { name: "Choose date" }),
    ).toHaveCount(0);
    await input.fill("2098-09-08");
    await expect(input).toHaveValue("2098-09-08");
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(widths.page).toBeLessThanOrEqual(widths.viewport);
    return;
  }

  await expect(input).toHaveAttribute("type", "text");
  await expect(
    sidebar.getByRole("button", { name: "Choose date" }),
  ).toHaveCount(0);
  await input.focus();
  await input.press("Alt+ArrowDown");
  const calendar = page.getByRole("dialog", { name: "Choose date" });
  await expect(calendar).toBeVisible();
  const [previousMonthBounds, nextMonthBounds] = await Promise.all([
    calendar.getByRole("button", { name: /previous month/i }).boundingBox(),
    calendar.getByRole("button", { name: /next month/i }).boundingBox(),
  ]);
  expect(previousMonthBounds).not.toBeNull();
  expect(nextMonthBounds).not.toBeNull();
  expect(previousMonthBounds?.y).toBeCloseTo(nextMonthBounds?.y ?? 0, 0);
  const calendarBounds = await calendar.boundingBox();
  expect(calendarBounds).not.toBeNull();
  expect(calendarBounds!.height / calendarBounds!.width).toBeLessThan(1.5);

  const monthPicker = calendar.getByRole("combobox", {
    name: "Choose the Month",
  });
  await monthPicker.focus();
  await monthPicker.press("Enter");
  await page.getByRole("option", { name: "September" }).press("Enter");
  await expect(calendar).toBeVisible();
  const yearPicker = calendar.getByRole("combobox", {
    name: "Choose the Year",
  });
  await yearPicker.focus();
  await yearPicker.press("Enter");
  await page.getByRole("option", { name: "2098" }).press("Enter");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole("status")).toHaveText("September 2098");
  await expect(yearPicker).toBeFocused();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const septemberFirst = calendar.getByRole("button", {
    name: "Monday, 1 September 2098",
  });
  await expect(septemberFirst).toBeFocused();
  for (let day = 1; day < 8; day += 1) {
    await page.keyboard.press("ArrowRight");
  }
  const septemberEighth = calendar.getByRole("button", {
    name: "Monday, 8 September 2098",
  });
  await expect(septemberEighth).toBeFocused();
  await septemberEighth.press("Enter");

  await expect(input).toHaveValue("08/09/2098");
  await expect(input).toBeEnabled();
  await expect(input).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await input.click();
  await expect(input).toBeFocused();
  await expectCalendarDayStatesDistinct(calendar, { selectedIsFocused: false });
  await expect
    .poll(() =>
      calendar.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).animationDuration),
      ),
    )
    .toBeLessThan(0.001);
  await expectPopoverAccessible(page);

  const [todayYear, todayMonth] = authoritativeCalendar.today.split("-");
  await showCalendarMonth({
    page,
    calendar,
    year: todayYear,
    month: todayMonth,
  });
  await expectTodayMarkerVisible(calendar);
  await page.keyboard.press("Escape");
  await expect(input).toBeFocused();

  if (testInfo.project.name === "desktop") {
    await page.getByLabel("Theme", { exact: true }).click();
    await page.getByRole("option", { name: "Dark" }).click();
    const browserSession = await page.context().newCDPSession(page);
    await browserSession.send("Emulation.setPageScaleFactor", {
      pageScaleFactor: 2,
    });
    await expect
      .poll(() => page.evaluate(() => window.visualViewport?.scale))
      .toBe(2);
    await input.focus();
    await input.press("Alt+ArrowDown");
    const layout = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(layout.page).toBeLessThanOrEqual(layout.viewport);
    await expect(calendar).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await calendar.boundingBox();
        return bounds ? bounds.x : Number.NEGATIVE_INFINITY;
      })
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const bounds = await calendar.boundingBox();
        return bounds ? bounds.x + bounds.width : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(layout.viewport);
    await expectCalendarDayStatesDistinct(calendar);
    await showCalendarMonth({
      page,
      calendar,
      year: todayYear,
      month: todayMonth,
    });
    await expectTodayMarkerVisible(calendar);
    await expectPopoverAccessible(page);
  }
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

  await sidebar
    .getByRole("group", { name: `Status for ${item.title}` })
    .getByRole("button", { name: "Done" })
    .click();
  await expect(sidebar.getByText("Status set manually")).toBeVisible();
  await expect(sidebar.getByText("50% complete")).toBeVisible();
  await expect(
    sidebar.getByRole("checkbox", { name: "Project" }),
  ).toBeChecked();

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
  await expect(refreshed.getByText("Status set manually")).toBeVisible();

  await refreshed.getByRole("checkbox", { name: "Foundations" }).click();
  await expect(refreshed.getByText("Status follows Parts")).toBeVisible();
  await expect(refreshed.getByText("100% complete")).toBeVisible();

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
    page.getByRole("link", { name: "Plans", exact: true }),
  ).toHaveAttribute("aria-current", "page");
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

  const targetDate = sidebar.getByLabel(`Target date for ${item.title}`);
  await targetDate.fill("20/08/2099");
  await targetDate.press("Enter");
  await expect(library.getByLabel(`Target date for ${item.title}`)).toHaveValue(
    "20/08/2099",
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

test("Target date recovers authoritative Today without using the browser clock", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-item-authoritative-today`;
  const { item } = await seedPlacedItem(page, user);
  let calendarRequests = 0;
  await page.route("**/api/server-calendar", async (route) => {
    calendarRequests += 1;
    if (calendarRequests === 1) {
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
      return;
    }
    await route.continue();
  });

  await page.goto(testAppUrl(`/items/${item.id}`, user));
  const sidebar = page.getByRole("complementary", {
    name: `${item.title} details`,
  });
  const input = sidebar.getByLabel(`Target date for ${item.title}`);
  const today =
    testInfo.project.name === "phone"
      ? sidebar.getByRole("button", { name: "Today", exact: true })
      : page
          .getByRole("dialog", { name: "Choose date" })
          .getByRole("button", { name: "Today", exact: true });

  await expect(
    sidebar.getByText("Authoritative Today is unavailable."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Today", exact: true }),
  ).toHaveCount(0);
  const typedDate =
    testInfo.project.name === "phone" ? "2099-08-20" : "20/08/2099";
  await input.fill(typedDate);
  if (testInfo.project.name !== "phone") await input.press("Enter");
  await expect(input).toHaveValue(typedDate);

  const authoritativeCalendar = (await (
    await testApi(page, user, "/api/server-calendar")
  ).json()) as { today: string };
  await sidebar.getByRole("button", { name: "Retry Today" }).click();
  if (testInfo.project.name !== "phone") {
    await input.click();
  }
  await expect(today).toBeEnabled();
  await today.click();
  const [year, month, day] = authoritativeCalendar.today.split("-");
  await expect(input).toHaveValue(
    testInfo.project.name === "phone"
      ? authoritativeCalendar.today
      : `${month}/${day}/${year}`,
  );

  if (testInfo.project.name === "phone") {
    const touchTarget = await today.boundingBox();
    expect(touchTarget?.height).toBeGreaterThanOrEqual(44);
  }
});

test("Target date refreshes when the authoritative calendar expires", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-item-today-expiry`;
  const { item } = await seedPlacedItem(page, user);
  const authoritativeCalendar = (await (
    await testApi(page, user, "/api/server-calendar")
  ).json()) as { today: string };
  let calendarRequests = 0;
  await page.route("**/api/server-calendar", async (route) => {
    calendarRequests += 1;
    if (calendarRequests === 1) {
      await route.fulfill({
        status: 200,
        json: {
          today: authoritativeCalendar.today,
          validUntil: new Date(Date.now() + 2_000).toISOString(),
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto(testAppUrl(`/items/${item.id}`, user));
  const sidebar = page.getByRole("complementary", {
    name: `${item.title} details`,
  });
  const today = sidebar.getByRole("button", { name: "Today", exact: true });
  await expect(today).toBeEnabled();

  await expect.poll(() => calendarRequests).toBe(2);
  await expect(today).toBeEnabled();
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
