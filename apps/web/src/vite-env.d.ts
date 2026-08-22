/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key — safe to ship to the browser. */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  /** Browser-direct YouTube title lookup is fail-closed unless exactly true. */
  readonly VITE_YOUTUBE_OEMBED_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
