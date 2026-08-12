import { expect, test } from "@playwright/test";
import { elapseDailyFocus, testApi, testAppUrl } from "./test-helpers";

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
    .getByRole("searchbox", { name: "Find a Library Item" })
    .fill("data-intensive");
  await expect(
    page.getByText("Unrelated CSS notes", { exact: true }),
  ).toHaveCount(0);
  await page
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

  await page.reload();
  await expect(
    focus.getByText("Read Designing Data-Intensive Applications", {
      exact: true,
    }),
  ).toBeVisible();
  await focus.getByRole("button", { name: "Done" }).click();
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
  const historicalDate = await elapseDailyFocus(page, user, focus.id);
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
    .getByRole("button", {
      name: "Add Finish the storage chapter to Today",
    })
    .click();
  await expect(page.getByText("Added to Today")).toBeVisible();
  await page.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/today\?/);
  await expect(page.getByText("1 of 1 done")).toBeVisible();
});
