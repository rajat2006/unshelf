const testUserBrand: unique symbol = Symbol("TestUserId");
const testBearerTokenBrand: unique symbol = Symbol("TestBearerToken");

export type TestUserId = string & { readonly [testUserBrand]: true };
type TestBearerToken = string & { readonly [testBearerTokenBrand]: true };

export const BROWSER_HARNESS_HOST = "127.0.0.1";
export const BROWSER_HARNESS_WEB_PORT = 4173;
export const BROWSER_HARNESS_API_PORT = 3101;
export const BROWSER_HARNESS_WEB_ORIGIN =
  `http://${BROWSER_HARNESS_HOST}:${BROWSER_HARNESS_WEB_PORT}`;
export const BROWSER_HARNESS_API_ORIGIN =
  `http://${BROWSER_HARNESS_HOST}:${BROWSER_HARNESS_API_PORT}`;

const testBearerPrefix = "unshelf-browser-test:";

/** Read the explicit User selected by one browser-test application instance. */
export function selectedTestUser(search: string): TestUserId {
  const value = new URLSearchParams(search).get("testUser");
  if (!value) throw new Error("testUser query parameter is required");
  return value as TestUserId;
}

/** Mint the local-only credential used to carry a selected test User over HTTP. */
export function testBearerToken(userId: TestUserId): TestBearerToken {
  return `${testBearerPrefix}${encodeURIComponent(userId)}` as TestBearerToken;
}

/** Resolve a local browser-test credential back to its selected User. */
export function testUserFromAuthorization(
  authorization: string | undefined,
): TestUserId | null {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token?.startsWith(testBearerPrefix)) return null;
  const encodedUserId = token.slice(testBearerPrefix.length);
  if (!encodedUserId) return null;
  return decodeURIComponent(encodedUserId) as TestUserId;
}
