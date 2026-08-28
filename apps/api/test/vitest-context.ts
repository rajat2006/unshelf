declare module "vitest" {
  export interface ProvidedContext {
    postgresConnectionUri: string;
  }
}

export async function sharedPostgresConnectionUri(): Promise<string> {
  const { inject } = await import("vitest");
  return inject("postgresConnectionUri");
}
