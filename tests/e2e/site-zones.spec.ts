import { expect, test } from "@playwright/test";
import { SITE_POINTS } from "../../apps/web/src/site-targets.js";
import {
  progressButton as b,
  enterProgress,
  receiveProgress,
} from "./progress-helpers.js";
import { clickFloor, outlinePixels, worldPoint } from "./scene-picking.js";
import { openLaborPanel } from "./workspace.js";

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
  await expect(b(p, "격리품 선택")).toBeDisabled();
  await b(p, "확장 제안 A 선택").click();
  await b(p, "확장 약정하기").click();
  await b(p, "확장 수레 출발").click();
  await b(p, "다음 일손 사건까지").click();
  await b(p, "확장 전량 검사 시작").click();
  await b(p, "다음 일손 사건까지").click();
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
  await b(p, "확장 정상 목재 16 배분").click();
  await b(p, "격리품 작업 보기").click();
  await b(p, "현장 불량4 교환 요청").click();
  await b(p, "현장 교환 회수 출발").click();
  await expect(p.locator('[data-site-marker="site-quarantine"]')).toBeVisible();
  await expect(b(p, "격리품 선택")).toBeDisabled();
  await b(p, "일손 배치 저장").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  await p.reload();
  await b(p, "마른 목재 20 조달").click();
  await openLaborPanel(p);
  await b(p, "일손 배치 불러오기").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "불러왔습니다",
  );
  await expect(p.getByTestId("flow-transit")).toContainText("4개");
  await expect(p.getByTestId("flow-allocated")).toContainText("16개");
  await b(p, "다음 일손 사건까지").click();
  await b(p, "다음 일손 사건까지").click();
  const pt = await worldPoint(p, SITE_POINTS["site-inspection"]);
  await p.mouse.click(pt.x, pt.y);
  await b(p, "현장 교환품4 재검수 시작").click();
  await b(p, "현장 다음 사건까지").click();
  await b(p, "현장 합격 교환품4 수령").click();
  await b(p, "확장 정상 목재 4 배분").click();
  await b(p, "확장 목재 사용 확인").click();
  await expect(p.getByTestId("flow-used")).toContainText("20개");
  for (const id of ["site-quarantine", "zone-storage", "zone-allocation"])
    await expect(p.locator(`[data-site-marker="${id}"]`)).toBeVisible();
  await b(p, "마을로 돌아가기").click();
  await expect(p.locator(".site-markers")).toHaveCount(0);
  await expect(p.getByRole("list", { name: "현장 구역 안내" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
