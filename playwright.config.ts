import { defineConfig } from "@playwright/test";
import {
  createTimberSave,
  createVillageGame,
} from "./packages/game-core/dist/index.js";

const baseURL = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  // GitHub runners sometimes run 1.3-1.5x slower than usual, so a long 3D test can time out once and pass on a rerun.
  // Retry once there and list those tests separately in the summary (e2e-summary.mjs) instead of rerunning the whole job.
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    actionTimeout: 30_000,
    baseURL,
    // Village tool tests start after the prologue. Campaign tests open a fresh game.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            {
              name: "dynosty.village.resume",
              value: JSON.stringify(createTimberSave(createVillageGame())),
            },
          ],
        },
      ],
    },
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
