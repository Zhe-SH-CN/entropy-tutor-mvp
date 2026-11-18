import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @mvp/api start",
      url: "http://127.0.0.1:3001/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @mvp/web build && pnpm --filter @mvp/web start",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
