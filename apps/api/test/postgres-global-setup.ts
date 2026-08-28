import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import type {} from "./vitest-context";

const TEST_DATABASE_URL = "UNSHELF_TEST_DATABASE_URL";

export default async function setup(
  project: TestProject,
): Promise<(() => Promise<void>) | undefined> {
  const configuredConnectionUri = process.env[TEST_DATABASE_URL];
  if (configuredConnectionUri) {
    project.provide("postgresConnectionUri", configuredConnectionUri);
    return;
  }

  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  project.provide("postgresConnectionUri", container.getConnectionUri());

  return async () => {
    await container.stop({ timeout: 10_000 });
  };
}
