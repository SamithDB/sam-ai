/// <reference types='vitest' />
import { join } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The workspace-root .env is shared with the API. Only UI_* variables are exposed
// to the browser bundle, so never put secrets in a UI_ variable.
const envDir = join(import.meta.dirname, '../..');
const envPrefix = 'UI_';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, envPrefix);
  const port = Number(env.UI_PORT || 3000);

  return {
    root: import.meta.dirname,
    cacheDir: '../node_modules/.vite/ui',
    envDir,
    envPrefix,
    server: {
      port,
      strictPort: true,
      host: 'localhost',
    },
    preview: {
      port,
      host: 'localhost',
    },
    plugins: [react()],
    // Uncomment this if you are using workers.
    // worker: {
    //  plugins: [],
    // },
    build: {
      outDir: './dist',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
