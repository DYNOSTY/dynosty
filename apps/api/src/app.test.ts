import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("API 개발 기반", () => {
  it("공용 코어의 초기 게임 상태를 전달한다", async () => {
    const app = buildApp();
    try {
      const response = await app.inject("/api/game/initial");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ schemaVersion: 1, day: 1 });
    } finally {
      await app.close();
    }
  });

  it("프로세스 정상과 DB 준비 상태를 구분한다", async () => {
    const app = buildApp();
    try {
      expect((await app.inject("/api/health")).statusCode).toBe(200);
      const response = await app.inject("/api/ready");
      expect(response.statusCode).toBe(503);
      expect(response.json().database).toBe("not-configured");
    } finally {
      await app.close();
    }
  });
});
