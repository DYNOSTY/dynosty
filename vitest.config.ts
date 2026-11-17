import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    maxWorkers: 2,
    // 주민 60명의 여러 날 생활·이동을 연속 계산하는 검사도 포함한다.
    testTimeout: 15_000,
  },
});
