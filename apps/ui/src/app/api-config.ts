// Vite-only: `import.meta.env` is not available under Jest, which maps this module to
// src/testing/api-config.mock.ts (see jest.config.cts).
export const defaultApiBaseUrl: string = import.meta.env.UI_API_BASE_URL || 'http://localhost:3333/api';
