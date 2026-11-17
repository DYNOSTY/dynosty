import { expect, test } from "@playwright/test";
import {
  progressButton as b,
  enterProgress,
  receiveProgress,
  siteAction,
} from "./progress-helpers.js";

const flow = (p: import("@playwright/test").Page, k: string) =>
  p.getByTestId(`flow-${k}`);
const report = (p: import("@playwright/test").Page) =>
  p.getByRole("region", { name: "조달 품질 처리 결과", exact: true });
test("품질흐름: 제안 비교와 운송·검사 분리는 실제 검사 전 결과를 확정하지 않는다", async ({
  page: p,
}) => {
  await enterProgress(p);
  await expect(p.getByRole("table")).toContainText("정상16 · 젖은4");
  await expect(p.getByRole("table")).toContainText("정상20 · 젖은0");
  await b(p, "확장 제안 A 선택").click();
  await b(p, "확장 약정하기").click();
  await expect(report(p)).toContainText("실제 철재 사용0");
  await expect(report(p)).toContainText("별도 예약 철재4");
  await b(p, "확장 수레 출발").click();
  await expect(flow(p, "transit")).toContainText("20개");
  await expect(p.getByTestId("labor-transit")).toHaveText("20");
  await expect(p.getByTestId("labor-total")).toHaveText("물량 합계 20/20");
  await expect(flow(p, "waiting")).toContainText("0개");
  await expect(p.getByTestId("offer-observed")).toContainText("검사 후");
  await b(p, "다음 일손 사건까지").click();
  await expect(flow(p, "transit")).toContainText("0개");
  await expect(flow(p, "waiting")).toContainText("20개");
  await b(p, "확장 전량 검사 시작").click();
  await b(p, "다음 일손 사건까지").click();
  await expect(flow(p, "checked")).toContainText("16개");
  await expect(flow(p, "quarantine")).toContainText("4개");
  await expect(flow(p, "available")).toContainText("0개");
  await expect(p.getByTestId("offer-observed")).toContainText(
    "원납품 검사 확인: 정상16·격리4",
  );
  await expect(p.getByTestId("flow-total")).toContainText("20/20");
});
test("품질흐름: 배분과 보완 재고를 중복 없이 표시하고 저장·복원·손상 파일 거부 후에도 유지한다", async ({
  page: p,
}) => {
  test.setTimeout(60000);
  await p.setViewportSize({ width: 1600, height: 1200 });
  await receiveProgress(p);
  await b(p, "확장 정상 목재 16 배분").click();
  await expect(flow(p, "available")).toContainText("0개");
  await expect(flow(p, "allocated")).toContainText("16개");
  await siteAction(p, "격리품", "현장 보완 인원 배정");
  await b(p, "일손 1시간 진행").click();
  await b(p, "일손 체험 저장").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await p.reload();
  await b(p, "마른 목재20 조달 체험하기").click();
  await b(p, "일손 배치·배급 체험하기").click();
  await b(p, "일손 체험 불러오기").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(flow(p, "allocated")).toContainText("16개");
  await expect(flow(p, "quarantine")).toContainText("4개");
  await b(p, "다음 일손 사건까지").click();
  await expect(flow(p, "available")).toContainText("4개");
  await expect(report(p)).toContainText("현장 보완 완료4개");
  await b(p, "확장 정상 목재 4 배분").click();
  await b(p, "확장 목재 사용 확인").click();
  await expect(flow(p, "allocated")).toContainText("0개");
  await expect(flow(p, "used")).toContainText("20개");
  await expect(report(p)).toContainText("정상16개 · 격리4개");
  await expect(report(p)).toContainText("실제 철재 사용4");
  await p.evaluate(() =>
    localStorage.setItem("dynosty.labor.saves", "{invalid"),
  );
  await b(p, "일손 체험 불러오기").click();
  await expect(p.getByRole("alert")).toBeVisible();
  await expect(flow(p, "used")).toContainText("20개");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe("{invalid");
});
test("품질흐름: 교환 처리4와 정상 배분16을 분리하고 예약·실제 비용·수령 결과를 보존한다", async ({
  page: p,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await receiveProgress(p);
  await b(p, "확장 정상 목재 16 배분").click();
  await siteAction(p, "격리품", "현장 불량4 교환 요청");
  await expect(report(p)).toContainText("실제 철재 사용4");
  await expect(report(p)).toContainText("별도 예약 철재1");
  await b(p, "현장 교환 회수 출발").click();
  await expect(flow(p, "transit")).toContainText("4개");
  await expect(flow(p, "quarantine")).toContainText("0개");
  await expect(report(p)).toContainText("실제 철재 사용5");
  await b(p, "일손 체험 저장").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await p.reload();
  await b(p, "마른 목재20 조달 체험하기").click();
  await b(p, "일손 배치·배급 체험하기").click();
  await b(p, "일손 체험 불러오기").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(flow(p, "transit")).toContainText("4개");
  await expect(flow(p, "allocated")).toContainText("16개");
  await b(p, "다음 일손 사건까지").click();
  await b(p, "다음 일손 사건까지").click();
  await expect(flow(p, "waiting")).toContainText("4개");
  await siteAction(p, "검수대", "현장 교환품4 재검수 시작");
  await b(p, "현장 다음 사건까지").click();
  await expect(flow(p, "checked")).toContainText("4개");
  await expect(report(p)).toContainText("교환품 수령 완료0개");
  await b(p, "현장 합격 교환품4 수령").click();
  await expect(report(p)).toContainText("교환품 수령 완료4개");
  await expect(report(p)).toContainText("잔여 철재 / 가용 철재3 / 3");
  await expect(p.getByTestId("flow-total")).toContainText("20/20");
  expect(errors).toEqual([]);
});
test("품질흐름: 375px에서 B 제안 선택과 정상20 검사 결과를 표시하고 넘치지 않는다", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const p = await context.newPage();
  try {
    await enterProgress(p);
    await b(p, "확장 제안 B 선택").focus();
    await p.keyboard.press("Enter");
    await b(p, "확장 약정하기").click();
    await b(p, "확장 수레 출발").click();
    await b(p, "다음 일손 사건까지").click();
    await b(p, "다음 일손 사건까지").click();
    await b(p, "확장 전량 검사 시작").click();
    await b(p, "다음 일손 사건까지").click();
    await b(p, "확장 정상분 20 받기").click();
    await expect(flow(p, "available")).toContainText("20개");
    await expect(flow(p, "quarantine")).toContainText("0개");
    await expect(p.getByTestId("offer-observed")).toContainText("정상20·격리0");
    await expect(report(p)).toContainText("실제 철재 사용6");
    expect(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    ).toBe(false);
  } finally {
    await context.close();
  }
});
