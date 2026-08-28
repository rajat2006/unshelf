import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/postgres-global-setup.ts"],
    // Turbo runs the API and web suites together. Bound each suite separately
    // so a many-core host does not multiply workers across both processes.
    maxWorkers: 2,
    // Spinning an ephemeral Postgres container is slow on a cold Docker image.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
