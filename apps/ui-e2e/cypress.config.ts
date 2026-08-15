const { nxE2EPreset } = require('@nx/cypress/plugins/cypress-preset');
const { defineConfig } = require('cypress');
module.exports = defineConfig({
  e2e: {
    ...nxE2EPreset(__filename, {
      cypressDir: 'src',
      bundler: 'vite',
      webServerCommands: {
        default: 'npx nx run @sam-ai/ui:dev',
        production: 'npx nx run @sam-ai/ui:preview',
      },
      ciWebServerCommand: 'npx nx run @sam-ai/ui:preview',
      ciBaseUrl: 'http://localhost:3000',
    }),
    baseUrl: 'http://localhost:3000',
  },
});
