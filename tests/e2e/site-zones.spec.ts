import { expect, test } from "@playwright/test";
import { SITE_POINTS } from "../../apps/web/src/site-targets.js";
import { press, reveal } from "./labor-tabs.js";
import {
  progressButton as b,
  enterProgress,
  receiveProgress,
} from "./progress-helpers.js";
import { clickFloor, outlinePixels, worldPoint } from "./scene-picking.js";

test("빈 구역의 표식·글자 안내는 유지하고 실제 목재 클릭·테두리·바닥 해제를 보존한다", async ({
  page: p,
}) => {
  await enterProgress(p);
  for (const id of [
    "site-inspection",
    "site-quarantine",
    "zone-storage",
    "zone-allocation",
  ])
    await expect(p.locator(`[data-site-marker="${id}"]`)).toBeVisible();
  await expect(p.getByRole("list", { name: "현장 구역 안내" })).toContainText(
    "정상 보관 구역",
  );
  await reveal(p, "격리품 선택");
  await expect(b(p, "격리품 선택")).toBeDisabled();
  await press(p, "확장 제안 A 선택");
  await press(p, "확장 약정하기");
  await press(p, "확장 수레 출발");
  await press(p, "다음 일손 사건까지");
  await press(p, "확장 전량 검사 시작");
  await press(p, "다음 일손 사건까지");
  const canvas = p.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const before = outlinePixels(await canvas.screenshot());
  const pt = await worldPoint(p, SITE_POINTS["site-quarantine"]);
  await p.mouse.click(pt.x, pt.y);
  await expect(p.getByTestId("site-name")).toHaveText("격리품");
  expect(outlinePixels(await canvas.screenshot())).toBeGreaterThan(before + 10);
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(p.getByTestId("flow-quarantine")).toContainText("4개");
});
test("묶음 표시의 저장 복원·사용 후 빈 구역·모드 종료를 확인한다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await receiveProgress(p);
  await press(p, "확장 정상 목재 16 배분");
  await press(p, "격리품 작업 보기");
  await press(p, "현장 불량4 교환 요청");
  await press(p, "현장 교환 회수 출발");
  await expect(p.locator('[data-site-marker="site-quarantine"]')).toBeVisible();
  await reveal(p, "격리품 선택");
  await expect(b(p, "격리품 선택")).toBeDisabled();
  await press(p, "일손 체험 저장");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await p.reload();
  await press(p, "마른 목재20 조달 체험하기");
  await press(p, "일손 배치·배급 체험하기");
  await press(p, "일손 체험 불러오기");
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(p.getByTestId("flow-transit")).toContainText("4개");
  await expect(p.getByTestId("flow-allocated")).toContainText("16개");
  await press(p, "다음 일손 사건까지");
  await press(p, "다음 일손 사건까지");
  const pt = await worldPoint(p, SITE_POINTS["site-inspection"]);
  await p.mouse.click(pt.x, pt.y);
  await press(p, "현장 교환품4 재검수 시작");
  await press(p, "현장 다음 사건까지");
  await press(p, "현장 합격 교환품4 수령");
  await press(p, "확장 정상 목재 4 배분");
  await press(p, "확장 목재 사용 확인");
  await expect(p.getByTestId("flow-used")).toContainText("20개");
  for (const id of ["site-quarantine", "zone-storage", "zone-allocation"])
    await expect(p.locator(`[data-site-marker="${id}"]`)).toBeVisible();
  await press(p, "생존 예제로 돌아가기");
  await expect(p.locator(".site-markers")).toHaveCount(0);
  await expect(p.getByRole("list", { name: "현장 구역 안내" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("모바일에서도 글자·기호로 구역을 구분하고 카메라·키보드 선택을 유지한다", async ({
  browser,
}) => {
  const c = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const p = await c.newPage();
  try {
    await enterProgress(p);
    await expect(p.getByTestId("play-scene-status")).toHaveText("3D 준비 완료");
    await expect(p.getByRole("list", { name: "현장 구역 안내" })).toContainText(
      "격리·사용 금지 구역",
    );
    expect(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    ).toBe(false);
    const pt = await worldPoint(p, SITE_POINTS["site-inspection"]);
    await p.touchscreen.tap(pt.x, pt.y);
    await expect(p.getByTestId("site-name")).toHaveText("검수대");
    await b(p, "배급소 선택").focus();
    await p.keyboard.press("Enter");
    await expect(p.getByTestId("site-name")).toHaveText("배급소");
    await press(p, "기본 시점");
    await p.locator("canvas").scrollIntoViewIfNeeded();
    await p.locator("canvas").hover();
    await p.mouse.wheel(0, 650);
    await expect(
      p.locator('[data-site-marker="zone-allocation"]'),
    ).toBeVisible();
  } finally {
    await c.close();
  }
});
