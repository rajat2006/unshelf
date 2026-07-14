/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key — safe to ship to the browser. */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
