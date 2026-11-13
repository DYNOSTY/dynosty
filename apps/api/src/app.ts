import { createInitialState } from "@dynosty/game-core";
import Fastify from "fastify";
import { Pool } from "pg";

export function buildApp(databaseUrl?: string) {
  const app = Fastify({ logger: false });
  const pool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 3000,
        query_timeout: 3000,
        max: 5,
      })
    : undefined;

  // 원본 DB 오류에는 접속 정보가 포함될 수 있어 그대로 기록하지 않는다.
  pool?.on("error", () => app.log.error("데이터베이스 연결 오류"));
  app.addHook("onClose", async () => {
    await pool?.end();
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "dynosty-api",
  }));
  app.get("/api/game/initial", async () => createInitialState());
  app.get("/api/ready", async (_request, reply) => {
    if (!pool)
      return reply
        .code(503)
        .send({ status: "unavailable", database: "not-configured" });
    try {
      await pool.query("SELECT 1");
      return { status: "ok", database: "connected" };
    } catch {
      return reply
        .code(503)
        .send({ status: "unavailable", database: "unreachable" });
    }
  });
  return app;
}
