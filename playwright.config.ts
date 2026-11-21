import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    // 깎은 건물 13종·공용 텍스처로 소프트웨어 렌더러 첫 로딩이 약 20초 → 첫 조작에 여유
    actionTimeout: 60_000,
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
