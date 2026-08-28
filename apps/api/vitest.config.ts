import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/postgres-global-setup.ts"],
    // Spinning an ephemeral Postgres container is slow on a cold Docker image.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
