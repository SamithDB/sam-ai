/// <reference types="vite/client" />

// UI_* variables from the workspace-root .env (see .env.example).
interface ImportMetaEnv {
  readonly UI_PORT?: string;
  readonly UI_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
