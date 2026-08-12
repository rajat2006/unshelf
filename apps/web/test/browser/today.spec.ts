import { expect, test } from "@playwright/test";
import { testApi, testAppUrl } from "./test-helpers";

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
