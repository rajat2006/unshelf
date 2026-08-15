import { expect, test } from "@playwright/test";
import {
  elapseDailyFocus,
  elapseDailyPlanningSuppression,
  testApi,
  testAppUrl,
} from "./test-helpers";

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

  await page.goto(testAppUrl(`/today/${historicalDate}`, user));

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

  await page
    .getByRole("button", {
      name: "Add Finish the storage chapter to Today",
    })
    .click();
  await expect(page.getByText("Added to Today")).toBeVisible();
  await page.getByRole("link", { name: "Go to Today", exact: true }).click();
  await expect(page).toHaveURL(/\/today\?/);
  await expect(page.getByText("1 of 1 done")).toBeVisible();
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
  const recent = await createItem("Fresh uncommitted paper");
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
  const suggestions = page.getByRole("region", { name: "Suggestions" });
  await expect(
    page.getByRole("heading", { level: 2, name: "Add only what fits" }),
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
  await expect(suggestions.getByText("Fresh uncommitted paper")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Item search results" })
      .getByText("Fresh uncommitted paper"),
  ).toBeVisible();
  await page.reload();
  await expect(suggestions.getByText("Fresh uncommitted paper")).toHaveCount(0);

  await elapseDailyPlanningSuppression({ page, user, itemId: recent.id });
  await page.reload();
  await expect(suggestions.getByText("Fresh uncommitted paper")).toBeVisible();
});
