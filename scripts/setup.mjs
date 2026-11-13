import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";

const password = randomBytes(32).toString("hex");
try {
  const file = await open(
    new URL("../.env.local", import.meta.url),
    "wx",
    0o600,
  );
  try {
    await file.writeFile(
      [
        "POSTGRES_USER=dynosty",
        "POSTGRES_DB=dynosty",
        `POSTGRES_PASSWORD=${password}`,
        "POSTGRES_PORT=15432",
        `DATABASE_URL=postgresql://dynosty:${password}@127.0.0.1:15432/dynosty`,
        "",
      ].join("\n"),
    );
  } finally {
    await file.close();
  }
  console.info("로컬 DB 설정을 생성했습니다. 비밀번호는 출력하지 않습니다.");
} catch (error) {
  if (error.code !== "EEXIST")
    throw new Error("로컬 DB 설정 생성에 실패했습니다.");
  console.info("기존 로컬 DB 설정을 유지합니다.");
}
