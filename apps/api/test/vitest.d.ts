declare module "vitest" {
  export interface ProvidedContext {
    postgresConnectionUri: string;
  }
}

export {};
