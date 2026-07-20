import { expect, test, type Page } from "@playwright/test";

/**
 * Authoring one Trail through the application seam (#94, ADR-0010/0014). A Trail
 * renders only its own Stops and edges, and on desktop it is authored by
 * arranging: add the first Stop, extend the sequence, and remove a link — each
 * creating or erasing records scoped to that one Trail, surviving a reload. These
 * assert external behaviour — visible waypoints, the opened URL, persistence, and
 * per-User isolation of the topology — not the canvas markup or palette (its skin
 * is a later slice, #100).
 */

interface TestInfoLike {
  project: { name: string };
}

function appUrl(path: string, user: string): string {
  const search = new URLSearchParams({ testUser: user });
  return `/test/browser${path}?${search.toString()}`;
}

function defaultUser(testInfo: TestInfoLike): string {
  return `${testInfo.project.name}-trail-user`;
}

/**
 * Create a Trail from Home and open it. A card `Link` drops the harness's
 * `testUser` query, so this hands back a deep link that keeps it — the way to
 * reload or share the Trail's URL in a test.
 */
async function startAndOpenTrail(
  page: Page,
  name: string,
  user: string,
): Promise<{ trailId: string; deepLink: string }> {
  await page.getByLabel("Trail name").fill(name);
  await page.getByRole("button", { name: "Start a Trail" }).click();
  const card = page.getByRole("link", { name: new RegExp(name) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/trails\/[0-9a-f-]{36}$/);
  const trailId = /trails\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  return { trailId, deepLink: appUrl(`/trails/${trailId}`, user) };
}

/** Add the first Stop to an empty Trail via the desktop "start" affordance. */
async function addFirstStop(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Start your trail/ }).click();
  const field = page.getByPlaceholder("Name your first stop");
  await field.fill(name);
  await field.press("Enter");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test("a desktop User adds the first Stop, extends the sequence, and it persists", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "authoring is a desktop gesture (US 40)",
  );
  const user = defaultUser(testInfo);

  await page.goto(appUrl("/", user));
  const { deepLink } = await startAndOpenTrail(
    page,
    `${testInfo.project.name} authoring journey`,
    user,
  );

  // The empty Trail invites the first Stop; adding it draws a waypoint.
  await addFirstStop(page, "Learn the basics");

  // Extend that Stop into the next — one gesture creates a Stop and links it.
  await page.getByRole("button", { name: "＋", exact: true }).click();
  const next = page.getByPlaceholder("Name the new stop");
  await next.fill("Build something");
  await next.press("Enter");
  await expect(page.getByText("Build something", { exact: true })).toBeVisible();

  // Both waypoints are the Trail's own topology — they survive a fresh load.
  await page.goto(deepLink);
  await expect(page.getByText("Learn the basics", { exact: true })).toBeVisible();
  await expect(page.getByText("Build something", { exact: true })).toBeVisible();

  // Removing the link between them leaves both Stops in place, and the removal
  // itself persists.
  await page.getByRole("button", { name: "Remove this link" }).click();
  await expect(page.getByText("Learn the basics", { exact: true })).toBeVisible();
  await expect(page.getByText("Build something", { exact: true })).toBeVisible();
  await page.goto(deepLink);
  await expect(page.getByText("Learn the basics", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove this link" }),
  ).toHaveCount(0);
});

test("a Trail's Stops are private to its owner", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "authoring is a desktop gesture (US 40)",
  );

  const owner = `${testInfo.project.name}-trail-owner`;
  await page.goto(appUrl("/", owner));
  const { trailId } = await startAndOpenTrail(
    page,
    `${testInfo.project.name} private topology`,
    owner,
  );
  await addFirstStop(page, "Owner only");

  // A different User opening the very same Trail URL is refused it — the topology
  // is resolved from the authenticated User, so a foreign id reads as not found.
  const stranger = `${testInfo.project.name}-trail-stranger`;
  await page.goto(appUrl(`/trails/${trailId}`, stranger));
  await expect(
    page.getByRole("heading", { level: 1, name: "Trail" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Owner only", { exact: true })).toHaveCount(0);
});

test("at phone width the Trail is viewed, not authored", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "view-only behaviour is a phone concern (US 40)",
  );
  const user = defaultUser(testInfo);

  await page.goto(appUrl("/", user));
  await startAndOpenTrail(
    page,
    `${testInfo.project.name} view-only journey`,
    user,
  );

  // The empty Trail offers no authoring on a phone — only guidance to a wider
  // screen — so unsupported touch editing is never presented as available.
  await expect(page.getByText(/Add some on a wider screen/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start your trail/ }),
  ).toHaveCount(0);
});
