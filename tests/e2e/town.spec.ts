import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
  type TimberState,
} from "../../packages/game-core/dist/index.js";

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
async function cursor(page: Page, x: number, z: number) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("장면 없음");
  const scale =
    box.height / (2 * Math.tan(0.4) * (32 + z * Math.sin(Math.PI / 3)));
  const point = {
    x: box.x + box.width / 2 + x * scale,
    y: box.y + box.height / 2 - z * Math.cos(Math.PI / 3) * scale,
  };
  await page.mouse.move(point.x, point.y);
  return point;
}
test("시설 완성 모습으로 회전 배치하고 자재를 확보한 두 공사를 저장·재개해 완공한다", async ({
  page,
}) => {
  test.setTimeout(90000);
  await fixture(page, start());
  for (const [kind, x, z] of [
    ["farm", 12, 12],
    ["storage", 0, 16],
  ] as const) {
    await page.getByLabel("지을 건물", { exact: true }).selectOption(kind);
    await button(page, "완성 모습으로 배치").click();
    const p = await cursor(page, x, z);
    await expect(page.getByTestId("home-placement-status")).toContainText(
      "배치 가능",
    );
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("home-placement-status")).toContainText(
      "195°",
    );
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId("building-queue")).toContainText(
    "건설 대기 2곳",
  );
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("83");
  await button(page, "일시정지").click();
  await button(page, "저장").click();
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button(page, "진행 불러오기").click();
  await expect(page.getByTestId("building-queue")).toContainText(
    "건설 대기 2곳",
  );
  await button(page, "저장").click();
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await button(page, "시간 재개").click();
  await expect(page.getByText("완공 시설 2곳", { exact: true })).toBeVisible({
    timeout: 65000,
  });
  await page.getByText("완공 시설 2곳", { exact: true }).click();
  await page.getByLabel("build-1 운영 인원", { exact: true }).selectOption("4");
  await expect(
    page.getByLabel("build-1 운영 인원", { exact: true }),
  ).toHaveValue("4");
  await page.screenshot({
    path: test.info().outputPath("자유배치_시설과_건설대기열.png"),
    fullPage: true,
  });
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
