import { defineConfig, devices } from "@playwright/test";
import { BROWSER_HARNESS_WEB_ORIGIN } from "./test/browser/harness";

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BROWSER_HARNESS_WEB_ORIGIN,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "VITE_DISCOVER_ENABLED=true tsx test/browser/server.ts",
    url: BROWSER_HARNESS_WEB_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
