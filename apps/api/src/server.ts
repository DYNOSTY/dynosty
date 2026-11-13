import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 3101);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("API_PORT 설정을 확인하세요.");
const app = buildApp(process.env.DATABASE_URL);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
try {
  await app.listen({ port, host: process.env.API_HOST ?? "127.0.0.1" });
  console.info(`DYNOSTY API 준비 완료 (포트 ${port})`);
} catch {
  console.error(
    "API를 시작하지 못했습니다. 포트 사용 여부와 설정을 확인하세요.",
  );
  await app.close();
  process.exitCode = 1;
}
