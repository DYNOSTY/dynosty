import { expect, test } from "@playwright/test";
import { openLaborPanel } from "./workspace.js";

test("HUD 건설·연구 메뉴와 저장·개발 도구가 같은 마을 진행을 유지한다", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
    { timeout: 90_000 },
  );
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const canvas = await page.locator("canvas").elementHandle();
  await button("건설").click();
  await expect(
    page.getByRole("region", { name: "건설과 식량 수급", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("village-population")).toContainText(
    "주민 60명",
  );
  await button("일시정지").click();
  await expect(button("시간 재개")).toBeVisible();
  const clock = await page.getByTestId("timber-clock").textContent();
  await button("연구").click();
  await expect(page.getByLabel("연구 기술", { exact: true })).toBeInViewport();
  await button("저장").click();
  await button("진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button("저장").click();
  await button("연구").click();
  await expect(page.getByLabel("연구 기술", { exact: true })).toBeInViewport();
  await button("개발 도구").click();
  await expect(page.getByTestId("village-population")).toBeVisible();
  await button("개발 도구 닫기").click();
  await expect(page.getByTestId("timber-clock")).toHaveText(clock ?? "");
  expect(
    await canvas?.evaluate(
      (element) => element === document.querySelector("canvas"),
    ),
  ).toBe(true);
  await openLaborPanel(page);
  await expect(page.getByTestId("labor-clock")).toBeVisible();
  await button("목재 조달 보기").click();
  await button("복홀 전체 보기").click();
  await button("개발 도구").click();
  await expect(page.getByTestId("camera-distance")).toHaveText("640.00");
  await button("개발 도구 닫기").click();
  await page.screenshot({ path: info.outputPath("village-hud.png") });
  await page.keyboard.press("Escape");
  await expect(button("조달")).toBeEnabled();
  expect(errors).toEqual([]);
});
