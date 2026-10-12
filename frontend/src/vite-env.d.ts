/// <reference types="vite/client" />

/** Backend URL the Vite proxy forwards to. Injected by vite.config.ts. */
declare const __BACKEND_TARGET__: string;

interface ImportMetaEnv {
  /** Optional override for the API base path. Defaults to "/api". */
  readonly VITE_API_BASE_URL?: string;
}
