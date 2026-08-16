import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  elapseDailyFocus,
  elapseDailyPlanningSuppression,
  testApi,
  testAppUrl,
} from "./test-helpers";

function localizedDate(canonicalDate: string): string {
  const [year, month, day] = canonicalDate.split("-");
  return `${month}/${day}/${year}`;
}

function dayButtonName(canonicalDate: string): string {
  const [year, month, day] = canonicalDate.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(date);
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(date);
  const remainder = day % 100;
  const suffix =
    remainder >= 11 && remainder <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${weekday}, ${monthName} ${day}${suffix}, ${year}`;
}

test("a User explicitly chooses and edits today's shared Library Items", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-today-current-focus`;
  const chosen = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Read Designing Data-Intensive Applications",
      type: "book",
    })
  ).json()) as { id: string };
  await testApi(page, user, "/api/items", "POST", {
    title: "Unrelated CSS notes",
    type: "article",
  });

  await page.goto(testAppUrl("/today", user));

  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await expect(page.getByText("0 of 0 done")).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find an Item" })
    .fill("data-intensive");
  const searchResults = page.getByRole("region", {
    name: "Item search results",
  });
  await expect(
    searchResults.getByText("Unrelated CSS notes", { exact: true }),
  ).toHaveCount(0);
  await searchResults
    .getByRole("button", {
      name: "Add Read Designing Data-Intensive Applications to Today",
    })
    .click();

  const focus = page.getByRole("region", { name: "Today's Daily Focus" });
  await expect(
    focus.getByText("Read Designing Data-Intensive Applications", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("0 of 1 done")).toBeVisible();

  await focus
    .getByRole("link", { name: "Read Designing Data-Intensive Applications" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${chosen.id}$`));
  await expect(
    page.getByRole("link", { name: "Today", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await page
    .getByRole("complementary", {
      name: "Read Designing Data-Intensive Applications details",
    })
    .getByRole("button", { name: "Close details" })
    .click();
  await expect(page).toHaveURL(/\/today(?:\?|$)/);

  await page.reload();
  await expect(
    focus.getByText("Read Designing Data-Intensive Applications", {
      exact: true,
    }),
  ).toBeVisible();
  await focus
    .getByRole("button", {
      name: "Mark Read Designing Data-Intensive Applications done",
    })
    .click();
  await expect(page.getByText("1 of 1 done")).toBeVisible();

  await focus
    .getByRole("button", {
      name: "Remove Read Designing Data-Intensive Applications from Today",
    })
    .click();
  await expect(page.getByText("0 of 0 done")).toBeVisible();
  await expect(
    focus.getByText("Read Designing Data-Intensive Applications", {
      exact: true,
    }),
  ).toHaveCount(0);

  const stored = await testApi(page, user, `/api/items/${chosen.id}`);
  expect(await stored.json()).toMatchObject({ id: chosen.id, status: "done" });
});

test("a User browses frozen Daily Focus history and explicitly re-adds unfinished work", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const user = `${testInfo.project.name}-daily-focus-history`;
  const item = (await (
    await testApi(page, user, "/api/items", "POST", {
      title: "Finish the storage chapter",
      type: "book",
    })
  ).json()) as { id: string };
  const structured = (await (
    await testApi(page, user, `/api/items/${item.id}/parts`, "POST", {
      titles: ["Pages 1–20", "Pages 21–40"],
    })
  ).json()) as { parts: Array<{ id: string }> };
  await testApi(
    page,
    user,
    `/api/items/${item.id}/parts/${structured.parts[0].id}/completion`,
    "PATCH",
    { completed: true },
  );
  const focus = (await (
    await testApi(page, user, "/api/daily-focus/today/items", "POST", {
      itemId: item.id,
    })
  ).json()) as { id: string };
  const historicalDate = await elapseDailyFocus({
    page,
    user,
    dailyFocusId: focus.id,
  });
  await testApi(
    page,
    user,
    `/api/items/${item.id}/parts/${structured.parts[1].id}/completion`,
    "PATCH",
    { completed: true },
  );

  await page.goto(
    testAppUrl(`/today/${historicalDate}`, user, { source: "plan" }),
  );

  await expect(
    page.getByRole("heading", { level: 1, name: "Daily Focus history" }),
  ).toBeVisible();
  await expect(page.getByText("Finish the storage chapter")).toBeVisible();
  await expect(page.getByText("In progress")).toBeVisible();
  await expect(page.getByText("50% of Parts complete")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Remove Finish the storage chapter from Today",
    }),
  ).toHaveCount(0);

  await page
    .getByRole("link", { name: "Finish the storage chapter", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
  await expect(
    page.getByRole("link", { name: "Today", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { level: 1, name: "Daily Focus history" }),
  ).toBeVisible();
  await page
    .getByRole("complementary", { name: "Finish the storage chapter details" })
    .getByRole("button", { name: "Close details" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/today/${historicalDate}(?:\\?|$)`));

  const dateInput = page.getByLabel("Daily Focus date");
  await expect(dateInput).toHaveCount(1);
  if (testInfo.project.name === "phone") {
    await expect(dateInput).toHaveAttribute("type", "date");
    await dateInput.fill("2001-02-03");
    await page.getByRole("button", { name: "View date" }).click();
    await expect(page).toHaveURL(/\/today\/2001-02-03\?/);
    expect(new URL(page.url()).searchParams.get("source")).toBe("plan");

    await page.goBack();
    await expect(dateInput).toHaveValue(historicalDate);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  } else {
    await expect(dateInput).toHaveAttribute("type", "text");
    await dateInput.fill("02/03/2001");
    await dateInput.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/today/${historicalDate}(?:\\?|$)`),
    );
    await page.getByRole("button", { name: "View date" }).click();
    await expect(page).toHaveURL(/\/today\/2001-02-03\?/);
    expect(new URL(page.url()).searchParams.get("source")).toBe("plan");

    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/today/${historicalDate}(?:\\?|$)`),
    );
    await expect(
      page.getByRole("region", {
        name: `Daily Focus for ${historicalDate}`,
      }),
    ).toBeVisible();
    await expect(dateInput).toHaveValue(localizedDate(historicalDate));

    await page.goForward();
    await expect(page).toHaveURL(/\/today\/2001-02-03\?/);
    await expect(dateInput).toHaveValue("02/03/2001");
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/today/${historicalDate}(?:\\?|$)`),
    );
    await expect(dateInput).toHaveValue(localizedDate(historicalDate));

    const [year, month, routedDay] = historicalDate.split("-").map(Number);
    const selectedDay = routedDay === 1 ? 2 : 1;
    const selectedDate = `${year}-${String(month).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
    await page.getByRole("button", { name: "Choose date" }).click();
    await page
      .getByRole("button", { name: dayButtonName(selectedDate) })
      .click();
    await expect(
      page.getByRole("button", { name: "Choose date" }),
    ).toBeFocused();
    await expect(page).toHaveURL(
      new RegExp(`/today/${historicalDate}(?:\\?|$)`),
    );
    await page.getByRole("button", { name: "View date" }).click();
    await expect(page).toHaveURL(new RegExp(`/today/${selectedDate}\\?`));
    expect(new URL(page.url()).searchParams.get("source")).toBe("plan");

    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/today/${historicalDate}(?:\\?|$)`),
    );
    await expect(dateInput).toHaveValue(localizedDate(historicalDate));

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    const lightInputColor = await dateInput.evaluate(
      (element) => getComputedStyle(element).color,
    );
    await page.getByLabel("Theme").click();
    await page.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() =>
        dateInput.evaluate((element) => getComputedStyle(element).color),
      )
      .not.toBe(lightInputColor);
    const darkAccessibility = await new AxeBuilder({ page }).analyze();
    expect(darkAccessibility.violations).toEqual([]);

    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  }

  await page
    .getByRole("button", {
      name: "Add Finish the storage chapter to Today",
    })
    .click();
  await expect(page.getByText("Added to Today")).toBeVisible();
  await page.getByRole("link", { name: "Go to Today", exact: true }).click();
  await expect(page).toHaveURL(/\/today\?/);
  expect(new URL(page.url()).searchParams.get("source")).toBe("plan");
  await expect(page.getByText("1 of 1 done")).toBeVisible();
});

test("Daily Focus history ignores stale loading responses and retries in place", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "one transport race at desktop");
  const user = `${testInfo.project.name}-daily-focus-history-race`;
  const emptyHistory = (date: string) => ({
    id: "00000000-0000-0000-0000-000000000101",
    userId: "00000000-0000-0000-0000-000000000102",
    date,
    entries: [],
    done: 0,
    total: 0,
  });
  let releaseOlder: () => void;
  const olderGate = new Promise<void>((resolve) => {
    releaseOlder = resolve;
  });
  let olderRequests = 0;
  let olderCompleted = 0;
  await page.route("**/api/daily-focus/2001-02-03", async (route) => {
    olderRequests += 1;
    await olderGate;
    await route.fulfill({ status: 200, json: emptyHistory("2001-02-03") });
    olderCompleted += 1;
  });
  await page.route("**/api/daily-focus/2001-02-04", (route) =>
    route.fulfill({ status: 200, json: emptyHistory("2001-02-04") }),
  );

  await page.goto(testAppUrl("/today/2001-02-03", user));
  const dateInput = page.getByLabel("Daily Focus date");
  await expect(dateInput).toBeEnabled();

  await dateInput.fill("02/0");
  await dateInput.press("Enter");
  await expect(dateInput).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "View date" })).toBeDisabled();
  const invalidAccessibility = await new AxeBuilder({ page }).analyze();
  expect(invalidAccessibility.violations).toEqual([]);

  await dateInput.fill("02/04/2001");
  await dateInput.press("Enter");
  await page.getByRole("button", { name: "View date" }).click();
  await expect(page).toHaveURL(/\/today\/2001-02-04\?/);
  await expect(
    page.getByRole("region", { name: "Daily Focus for 2001-02-04" }),
  ).toBeVisible();

  releaseOlder!();
  await expect.poll(() => olderRequests).toBeGreaterThanOrEqual(1);
  await expect.poll(() => olderCompleted).toBe(olderRequests);
  await expect(
    page.getByRole("region", { name: "Daily Focus for 2001-02-04" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Daily Focus for 2001-02-03" }),
  ).toHaveCount(0);

  let failedNewest = false;
  await page.route("**/api/daily-focus/2001-02-05", async (route) => {
    if (!failedNewest) {
      failedNewest = true;
      await route.fulfill({ status: 503, json: { error: "unavailable" } });
      return;
    }
    await route.fulfill({ status: 200, json: emptyHistory("2001-02-05") });
  });
  await dateInput.fill("02/05/2001");
  await dateInput.press("Enter");
  await page.getByRole("button", { name: "View date" }).click();
  await expect(page.getByText("Daily Focus unavailable")).toBeVisible();

  await dateInput.fill("02/06/2001");
  await dateInput.press("Enter");
  await page.getByRole("button", { name: "Retry" }).click();

  await expect(
    page.getByRole("region", { name: "Daily Focus for 2001-02-05" }),
  ).toBeVisible();
  await expect(dateInput).toHaveValue("02/06/2001");
  await expect(page).toHaveURL(/\/today\/2001-02-05\?/);
});

test("a User plans Today with a capped explained shortlist and independent search", async ({
  page,
}, testInfo) => {
  const user = `${testInfo.project.name}-daily-planning`;
  const createItem = async (title: string) =>
    (await (
      await testApi(page, user, "/api/items", "POST", {
        title,
        type: "article",
      })
    ).json()) as { id: string };
  const yesterday = await createItem("Continue yesterday's indexes");
  const planned = await createItem("Plan-aware query execution");
  const dormant = await createItem("Dormant transaction internals");
  const targeted = await createItem("Targeted storage reading");
  await createItem("Fresh uncommitted paper");
  const done = await createItem("Finished suggestion noise");
  const selected = await createItem("Already selected suggestion noise");

  const yesterdayFocus = (await (
    await testApi(page, user, "/api/daily-focus/today/items", "POST", {
      itemId: yesterday.id,
    })
  ).json()) as { id: string };
  await elapseDailyFocus({
    page,
    user,
    dailyFocusId: yesterdayFocus.id,
  });
  const plan = (await (
    await testApi(page, user, "/api/learning-plans", "POST", {
      name: "Database foundations",
    })
  ).json()) as { id: string };
  await testApi(page, user, `/api/learning-plans/${plan.id}/items`, "POST", {
    itemId: planned.id,
  });
  await testApi(page, user, `/api/items/${dormant.id}/status`, "PATCH", {
    status: "in_progress",
  });
  const today = (await (
    await testApi(page, user, "/api/daily-focus/today")
  ).json()) as { date: string };
  await testApi(page, user, `/api/items/${targeted.id}/target-date`, "PATCH", {
    targetDate: today.date,
  });
  await testApi(page, user, `/api/items/${done.id}/status`, "PATCH", {
    status: "done",
  });
  await testApi(page, user, "/api/daily-focus/today/items", "POST", {
    itemId: selected.id,
  });

  await page.goto(testAppUrl("/today", user));
  const ledger = page.getByRole("region", { name: "Today's daily ledger" });
  const suggestions = page.getByRole("region", { name: "Suggestions" });
  await expect(
    ledger.getByRole("region", { name: "Today's Daily Focus" }),
  ).toBeVisible();
  await expect(
    ledger.getByRole("region", { name: "Suggestions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Library search" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Add a known Item" }),
  ).toBeVisible();
  await expect(
    suggestions.getByText("Unfinished from yesterday"),
  ).toBeVisible();
  await expect(suggestions.getByText("Target date is Today")).toBeVisible();
  await expect(suggestions.getByText("Captured recently")).toBeVisible();
  await expect(suggestions.getByRole("listitem")).toHaveCount(3);
  await expect(suggestions.getByText("Finished suggestion noise")).toHaveCount(
    0,
  );
  await expect(
    suggestions.getByText("Already selected suggestion noise"),
  ).toHaveCount(0);

  const suggestionTitles = await suggestions
    .getByRole("link")
    .allTextContents();
  expect(suggestionTitles).toEqual([
    "Continue yesterday's indexes",
    "Targeted storage reading",
    "Fresh uncommitted paper",
  ]);

  await suggestions
    .getByRole("button", { name: "Add Continue yesterday's indexes to Today" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Today's Daily Focus" })
      .getByText("Continue yesterday's indexes"),
  ).toBeVisible();
  await expect
    .poll(() => suggestions.getByRole("link").allTextContents())
    .toEqual([
      "Targeted storage reading",
      "Fresh uncommitted paper",
      "Dormant transaction internals",
    ]);
  await expect(
    page.getByRole("textbox", { name: "Learning intention" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Learning Plan lens" }),
  ).toHaveCount(0);

  await page
    .getByRole("searchbox", { name: "Find an Item" })
    .fill("fresh uncommitted");
  await expect(
    page
      .getByRole("region", { name: "Item search results" })
      .getByText("Fresh uncommitted paper"),
  ).toBeVisible();

  await suggestions
    .getByRole("button", { name: "Not today for Fresh uncommitted paper" })
    .click();
  await expect
    .poll(() => suggestions.getByRole("link").allTextContents())
    .toEqual([
      "Targeted storage reading",
      "Dormant transaction internals",
      "Plan-aware query execution",
    ]);
  await expect(
    page
      .getByRole("region", { name: "Item search results" })
      .getByText("Fresh uncommitted paper"),
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Item search results" })
    .getByRole("button", { name: "Add Fresh uncommitted paper to Today" })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Today's Daily Focus" })
      .getByText("Fresh uncommitted paper"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Item search results" }),
  ).toHaveCount(0);

  await suggestions
    .getByRole("button", {
      name: "Not today for Dormant transaction internals",
    })
    .click();
  await expect
    .poll(() => suggestions.getByRole("link").allTextContents())
    .toEqual(["Targeted storage reading", "Plan-aware query execution"]);
  await suggestions
    .getByRole("button", { name: "Not today for Plan-aware query execution" })
    .click();
  await expect
    .poll(() => suggestions.getByRole("link").allTextContents())
    .toEqual(["Targeted storage reading"]);

  await page.reload();
  await expect(suggestions.getByText("Fresh uncommitted paper")).toHaveCount(0);
  await expect(
    suggestions.getByText("Dormant transaction internals"),
  ).toHaveCount(0);
  await expect(suggestions.getByText("Plan-aware query execution")).toHaveCount(
    0,
  );

  await elapseDailyPlanningSuppression({ page, user, itemId: dormant.id });
  await page.reload();
  await expect(
    suggestions.getByText("Dormant transaction internals"),
  ).toBeVisible();
});
