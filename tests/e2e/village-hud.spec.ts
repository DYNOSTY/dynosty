import { expect, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createVillageGame,
  payTown,
  requireValue,
} from "../../packages/game-core/dist/index.js";
import { openLaborPanel, openWorkspace } from "./workspace.js";

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
  // 제출본 HUD: 건설은 건물 목록, 연구는 연구 도감을 연다. 마을은 일시정지로 이어진다.
  await button("건설").click();
  await expect(page.getByRole("region", { name: "건물 목록" })).toBeVisible();
  const clock = await page.getByTestId("play-clock").textContent();
  await button("연구").click();
  await expect(page.getByRole("region", { name: "연구 도감" })).toBeVisible();
  await button("개발 도구").click();
  await expect(page.getByTestId("village-population")).toContainText(
    "주민 60명",
  );
  await expect(button("시간 재개")).toBeVisible();
  await button("저장").click();
  await button("진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button("저장").click();
  await button("개발 도구 닫기").click();
  await button("연구").click();
  await expect(page.getByRole("region", { name: "연구 도감" })).toBeVisible();
  await expect(page.getByTestId("play-clock")).toHaveText(clock ?? "");
  expect(
    await canvas?.evaluate(
      (element) => element === document.querySelector("canvas"),
    ),
  ).toBe(true);
  await openLaborPanel(page);
  await expect(page.getByTestId("labor-clock")).toBeVisible();
  await button("목재 조달 보기").click();
  await button("복홀 전체 보기").click();
  // 일손 화면은 이미 개발 도구를 연 채라서 토글하지 않고 열린 상태를 보장한다.
  await openWorkspace(page);
  await expect(page.getByTestId("camera-distance")).toHaveText("640.00");
  await button("개발 도구 닫기").click();
  await page.screenshot({ path: info.outputPath("village-hud.png") });
  await page.keyboard.press("Escape");
  await expect(button("조달")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("출문 후 연구 가지와 건설 목록에 현재 단계 도면을 표시한다", async ({
  page,
}) => {
  const village = payTown(createVillageGame(), { RES_WOOD: 8, RES_METAL: 2 });
  village.town.development.completed.push("UPGRADE_HOME_2");
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave(village),
  );
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toContainText(
    "준비 완료",
  );
  const quest = page.locator(".campaign-quest > .scout-all").first();
  const rect = requireValue(await quest.boundingBox(), "화면 위치");
  expect(rect).toBeTruthy();
  expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
  await page.keyboard.press("b");
  const shelf = page.getByRole("region", { name: "건물 목록" });
  const home = shelf.locator('img[src$="/home-2.webp"]');
  await expect(home).toBeVisible();
  await expect
    .poll(() => home.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(home).toHaveCSS("object-fit", "contain");
  await page.keyboard.press("t");
  const tree = page.getByRole("region", { name: "연구 도감" });
  const branch = tree.getByRole("button", { name: /온돌 둥지 2단계/ });
  const child = branch
    .locator("..")
    .getByRole("button", { name: "온돌 둥지 3단계" });
  await expect(child).toBeVisible();
  await expect(child).toHaveAttribute("title", /선행 연구.*온돌 둥지 2단계/);
  await expect(child).toHaveAttribute("data-available", "false");
  expect(
    await child.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
});

test("건설 카드를 골라도 WASD 이동을 유지하고 새 부지를 누르면 건물 이름을 보여 준다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toContainText(
    "준비 완료",
  );
  await page.keyboard.press("b");
  const card = page
    .getByRole("region", { name: "건물 목록" })
    .getByRole("button", { name: "온돌 둥지", exact: true });
  await expect(card).toHaveText("온돌 둥지");
  await expect(card).toHaveAccessibleDescription("목재50");
  await card.click();
  const view = page.locator(".g-minimap__view");
  const origin = await view.getAttribute("style");
  await page.keyboard.down("d");
  try {
    await expect(view).not.toHaveAttribute(
      "style",
      requireValue(origin, "화면 위치"),
    );
  } finally {
    await page.keyboard.up("d");
  }
  const hint = page.locator(".building-shelf output");
  const canvas = page.locator(".scene-viewport canvas");
  const rect = requireValue(await canvas.boundingBox(), "화면 위치");
  for (const ry of [0.42, 0.52, 0.63, 0.35, 0.73]) {
    for (const rx of [0.36, 0.55, 0.63, 0.27, 0.7, 0.2]) {
      const x = rect.x + rx * rect.width,
        y = rect.y + ry * rect.height;
      await page.mouse.move(x, y);
      if (!(await hint.textContent())?.includes("배치 가능")) continue;
      await page.mouse.click(x, y);
      if ((await card.isVisible()) && !(await hint.isVisible())) {
        await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("950");
        await page.mouse.click(x, y);
        await expect(
          page.getByRole("region", { name: "선택 정보" }),
        ).toContainText("온돌 둥지");
        await expect(
          page.getByRole("region", { name: "선택 정보" }),
        ).toContainText("건설 현장");
        return;
      }
    }
  }
  throw Error("빈 부지에서 온돌 둥지 공사를 시작하지 못했습니다.");
});

test("배치 중 완공된 식당을 누르면 식당의 이름과 단계가 열린다", async ({
  page,
}) => {
  const order = commandTimber(
    createVillageGame(),
    {
      type: "plan-building",
      kind: "restaurant",
      position: { x: 12, z: 12 },
      headingRadians: Math.PI,
    },
    "dining",
  );
  const ready = advanceTimber(order, 180);
  expect(ready.town.facilities[0]?.kind).toBe("restaurant");
  await page.addInitScript(
    (save) =>
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save)),
    createTimberSave({ ...ready, paused: true }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toContainText(
    "준비 완료",
  );
  await page.keyboard.press("b");
  await page.getByRole("button", { name: "시설 운영" }).click();
  const details = page
    .locator("details")
    .filter({ has: page.getByText("완공 시설 1곳", { exact: true }) });
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
  await details.getByRole("button", { name: "현장 보기" }).click();
  await page.keyboard.press("b");
  await page
    .getByRole("region", { name: "건물 목록" })
    .getByRole("button", { name: "온돌 둥지", exact: true })
    .click();
  const canvas = page.locator(".scene-viewport canvas");
  const rect = requireValue(await canvas.boundingBox(), "화면 위치");
  await canvas.click({
    position: { x: rect.width / 2, y: rect.height / 2 - 10 },
  });
  const info = page.getByRole("region", { name: "선택 정보" });
  await expect(info).toContainText("공동 식당");
  await expect(info).toContainText("완공 시설 · 1단계");
});
