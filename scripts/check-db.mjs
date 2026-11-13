import { Pool } from "pg";

if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL 설정이 필요합니다.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
});
try {
  await pool.query("SELECT 1");
  console.info("PostgreSQL 연결 확인 완료");
} catch {
  console.error("PostgreSQL 연결 실패: DB 실행과 로컬 설정을 확인하세요.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
