// Prints a Markdown summary of a Playwright JSON report for the GitHub job summary.
//   node scripts/e2e-summary.mjs results.json >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "results.json";
const report = JSON.parse(readFileSync(file, "utf8"));
const {
  expected = 0,
  unexpected = 0,
  flaky = 0,
  skipped = 0,
} = report.stats ?? {};
const failed = [];
const walk = (suite, path) => {
  const file = suite.file ?? path;
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests ?? [])
      if (test.status === "unexpected")
        failed.push(`${file}:${spec.line} ${spec.title}`);
  for (const child of suite.suites ?? []) walk(child, file);
};
for (const suite of report.suites ?? []) walk(suite, "");

const minutes = ((report.stats?.duration ?? 0) / 60000).toFixed(1);
console.log("## 브라우저 검사 결과\n");
console.log("| 통과 | 실패 | 재시도 후 통과 | 건너뜀 | 걸린 시간 |");
console.log("|---|---|---|---|---|");
console.log(
  `| ${expected} | ${unexpected} | ${flaky} | ${skipped} | ${minutes}분 |`,
);
if (failed.length) {
  console.log("\n### 실패한 검사\n");
  for (const line of failed.sort()) console.log(`- \`${line}\``);
}
