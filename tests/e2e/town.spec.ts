import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
  createVillageGame,
  requireValue,
  type TimberState,
} from "../../packages/game-core/dist/index.js";
import { advanceVillageDay, readVillage } from "./read-village.js";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const start = () => createTimberState({ ...createPlayState(), minute: 540 });
async function fixture(page: Page, s: TimberState) {
  await page.goto("/");
  await page.evaluate(
    (save) =>
      localStorage.setItem(
        "dynosty.timber.saves.v17",
        JSON.stringify({
          format: "dynosty-timber-archive",
          storageVersion: 1,
          current: save,
          previous: null,
        }),
      ),
    createTimberSave(s),
  );
  await button(page, "마른 목재 20 조달").click();
  await expect(page.getByTestId("timber-clock")).toBeVisible();
  await button(page, "저장").click();
  await button(page, "진행 불러오기").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
  await button(page, "저장").click();
}
test("시설 완성 모습으로 회전 배치하고 자재를 확보한 두 공사를 저장·재개해 완공한다", async ({
  page,
}) => {
  const state = createVillageGame();
  await page.addInitScript((save) => {
    if (!localStorage.getItem("dynosty.village.resume"))
      localStorage.setItem("dynosty.village.resume", JSON.stringify(save));
  }, createTimberSave(state));
  const read = () => page.evaluate(readVillage);
  await page.goto("/");
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await page.keyboard.press("b");
  const shelf = page.getByRole("region", { name: "건물 목록" });
  // Choose the same cards and page arrows available during normal play.
  for (const [i, [name, x, z]] of (
    [
      ["공동 저장소", 0, 16],
      ["온상 재배소", 12, 12],
    ] as const
  ).entries()) {
    const card = shelf.getByRole("button", { name, exact: true });
    while (!(await card.count())) {
      await shelf.getByRole("button", { name: "다음 건물" }).click();
    }
    await card.click();
    await page.evaluate(
      ([x, z]) => {
        const scene = (
          window as unknown as {
            __scene: import("@babylonjs/core/scene").Scene;
          }
        ).__scene;
        const camera =
          scene.activeCamera as import("@babylonjs/core/Cameras/arcRotateCamera").ArcRotateCamera;
        const target = camera.target.clone();
        target.set(x, 0, z);
        camera.setTarget(target);
        camera.radius = 36;
      },
      [x, z] as const,
    );
    const box = requireValue(
      await page.locator("canvas").first().boundingBox(),
      "화면 위치",
    );
    const px = box.x + box.width / 2,
      py = box.y + box.height / 2;
    await page.mouse.move(px, py);
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByText(new RegExp(name + " · 배치 가능 · 방향 195°")).first(),
    ).toBeVisible();
    await page.mouse.click(px, py);
    await expect
      .poll(async () => (await read()).town.orders.length)
      .toBe(i + 1);
  }
  const ordered = await read();
  expect(ordered.world.resources.RES_WOOD).toBe(
    state.world.resources.RES_WOOD - (30 + 63) * 10000,
  );
  await page.keyboard.press("Escape");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "저장하기", exact: true }).click();
  const pausedOrders = (await read()).town.orders;
  await dialog.getByRole("button", { name: /슬롯 1 ·/ }).click();
  await expect(dialog).toContainText("슬롯 1에 저장했습니다");
  await dialog.getByRole("button", { name: "뒤로" }).click();
  await dialog.getByRole("button", { name: "불러오기" }).click();
  // 슬롯을 불러오면 페이지가 다시 열리므로 새 문서가 뜬 뒤 기록을 읽는다.
  const reloaded = page.waitForEvent("load");
  await dialog.getByRole("button", { name: /슬롯 1 ·/ }).click();
  await reloaded;
  await expect
    .poll(async () => (await read()).town.orders)
    .toEqual(pausedOrders);
  await expect(page.getByTestId("play-scene-status")).toHaveText(
    "3D 준비 완료",
  );
  await advanceVillageDay(page);
  await expect
    .poll(async () => (await read()).town.facilities.map((f) => f.kind).sort())
    .toEqual(["farm", "storage"]);
});
test("결빙 수역과 어획막을 표시하고 물가의 직원이 어류를 계속 입고한다", async ({
  page,
}) => {
  let s = commandTimber(
    start(),
    {
      type: "plan-building",
      kind: "fishery",
      position: { x: 46, z: 32 },
      headingRadians: Math.PI,
    },
    "fish",
  );
  s = advanceTimber(s, 180);
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-1", count: 4 },
    "staff",
  );
  s = commandTimber(s, { type: "cold-weather", cold: true }, "cold");
  s = advanceTimber(s, 100);
  await fixture(page, s);
  // 제출본은 운영 장부를 메뉴별로 나눠 보여 준다. 개발 도구를 열면 전체 장부와 시간 조작이 보인다.
  await button(page, "개발 도구").click();
  await expect(
    page.getByText("수역: 결빙 · 얼음 구멍 낚시 가능", { exact: true }),
  ).toBeVisible();
  await button(page, "동쪽 물고기 못 보기").click();
  await page.getByText("완공 시설 1곳", { exact: true }).click();
  const before = await page.getByTestId("resource-RES_FISH").textContent();
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await button(page, "시간 재개").click();
  await expect(page.getByTestId("resource-RES_FISH")).not.toHaveText(
    before ?? "",
    { timeout: 25000 },
  );
  await button(page, "일시정지").click();
  await page.screenshot({
    path: test.info().outputPath("결빙수역_어획막.png"),
    fullPage: true,
  });
});
