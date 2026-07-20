import { expect, type APIResponse, type Page } from "@playwright/test";
import { testBearerToken, type TestUserId } from "./harness";

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
