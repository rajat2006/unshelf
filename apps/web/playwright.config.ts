import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  webServer: {
    command: "vite --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
  },
});
