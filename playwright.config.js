const { defineConfig } = require('@playwright/test');

// Renderer tests drive the real Electron app, so they must not run concurrently:
// each launch owns a temporary HOME and binds MCP/watcher resources.
module.exports = defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: 'list',
});
