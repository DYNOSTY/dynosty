import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @dynosty/api dev",
      url: "http://127.0.0.1:3101/api/health",
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @dynosty/web dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
});
