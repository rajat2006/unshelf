import { expect, type APIResponse, type Page } from "@playwright/test";
import {
  BROWSER_HARNESS_API_ORIGIN,
  testBearerToken,
  type TestUserId,
} from "./harness";

/** Address one private route in the browser harness as an explicit test User. */
export function testAppUrl(
  path: string,
  user: string,
  params: Record<string, string> = {},
): string {
  const search = new URLSearchParams({ testUser: user, ...params });
  return `/test/browser${path}?${search.toString()}`;
}

/** Make one authenticated request through the browser harness's real API. */
export async function testApi(
  page: Page,
  user: string,
  path: string,
  method = "GET",
  data?: object,
): Promise<APIResponse> {
  const response = await page.request.fetch(path, {
    method,
    data,
    headers: {
      Authorization: `Bearer ${testBearerToken(user as TestUserId)}`,
    },
  });
  expect(response.ok(), `${method} ${path}`).toBe(true);
  return response;
}

/** Move an owned focus behind the database clock for rollover browser tests. */
export async function elapseDailyFocus(
  page: Page,
  user: string,
  dailyFocusId: string,
): Promise<string> {
  const response = await page.request.post(
    `${BROWSER_HARNESS_API_ORIGIN}/__test__/daily-focus/${dailyFocusId}/elapse`,
    {
      headers: {
        Authorization: `Bearer ${testBearerToken(user as TestUserId)}`,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { date: string }).date;
}

/** Move one suppression behind the database date to model next-day eligibility. */
export async function elapseDailyPlanningSuppression({
  page,
  user,
  itemId,
}: {
  page: Page;
  user: string;
  itemId: string;
}): Promise<void> {
  const response = await page.request.post(
    `${BROWSER_HARNESS_API_ORIGIN}/__test__/daily-planning/${itemId}/elapse-suppression`,
    {
      headers: {
        Authorization: `Bearer ${testBearerToken(user as TestUserId)}`,
      },
    },
  );
  expect(response.ok()).toBe(true);
}
