import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  type BuildingKind,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
  payTown,
  RESEARCH_CATALOG,
  type TimberState,
} from "../../packages/game-core/dist/index.js";
import { readVillage } from "./read-village.js";

const button = (p: Page, name: string) =>
  p.getByRole("button", { name, exact: true });
function built(kind: BuildingKind, x = 12, z = 12) {
  let s = createTimberState({ ...createPlayState(), minute: 540 });
  s = commandTimber(
    s,
    {
      type: "plan-building",
      kind,
      position: { x, z },
      headingRadians: Math.PI,
    },
    "build",
  );
  return advanceTimber(s, 180);
}
async function load(page: Page, s: TimberState) {
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
test("시설 개량 버튼으로2단계 생산 배율과 저장 복원을 확인한다", async ({
  page,
}) => {
  let unlocked = payTown(built("fishery", 46, 32), {
    RES_WOOD: 24,
    RES_METAL: 6,
  });
  unlocked = {
    ...unlocked,
    town: {
      ...unlocked.town,
      development: {
        ...unlocked.town.development,
        completed: ["UPGRADE_FISHERY_2", "UPGRADE_FISHERY_3"],
      },
    },
  };
  await load(page, unlocked);
  await page.getByText("완공 시설 1곳", { exact: true }).click();
  await page.getByRole("button", { name: /2단계 개량/ }).click();
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await expect(
    page.getByText("어획막 · 2단계 · build-1", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await expect(page.getByText(/생산 배율×1.50/)).toBeVisible();
  await button(page, "일시정지").click();
  await button(page, "저장").click();
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button(page, "진행 불러오기").click();
  await expect(
    page.getByText("어획막 · 2단계 · build-1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("69");
  await button(page, "현장 보기").click();
  await page
    .getByText("어획막 · 2단계 · build-1", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("시설2단계_생산배율.png"),
    fullPage: true,
  });
});
test("야근 선택은 추가 식량을 차감하지 않고 부상 기록을 남긴다", async ({
  page,
}) => {
  let s = built("farm");
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-1", count: 2 },
    "staff",
  );
  s = advanceTimber(s, 1075 - s.world.minute);
  await load(page, s);
  await page.getByText("완공 시설 1곳", { exact: true }).click();
  const food = await page.getByTestId("resource-RES_MEAT").textContent();
  await page
    .getByRole("checkbox", { name: "build-1 야근", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "build-1 야근", exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId("resource-RES_MEAT")).toHaveText(food ?? "");
  await button(page, "개발 도구").click();
  for (let i = 0; i < 13; i++) {
    const before = await page.getByTestId("timber-clock").textContent();
    await button(page, "5분 진행").click();
    await expect(page.getByTestId("timber-clock")).not.toHaveText(before ?? "");
  }
  const ledger = page.getByText(/야근 부상 기록 \d+건/);
  await expect(ledger).toBeVisible();
  const saved = (await page.evaluate(readVillage)).world.pessimism;
  expect(saved).toBe(1);
  await expect(page.getByText(/수당·추가 식량은 없습니다/)).toBeVisible();
  await ledger.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("야근_18_21_비관.png"),
    fullPage: true,
  });
});
test("공방 연구가 완료되고 미연결 기술은 실행되지 않으며 교역 범위 선택이 거래량을 바꾼다", async ({
  page,
}) => {
  let s = built("workshop");
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-1", count: 2 },
    "staff",
  );
  s = advanceTimber(s, 30);
  s = commandTimber(
    s,
    { type: "start-research", tech: "TECH_TRAIL" },
    "research",
  );
  const tech = RESEARCH_CATALOG.find((r) => r.id === "TECH_TRAIL");
  if (!tech) throw Error("자료 없음");
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        research: [
          {
            tech: tech.id,
            facility: "build-1",
            work: tech.workdays * 540 * 3 - 2,
          },
        ],
      },
    },
  };
  await load(page, s);
  await expect(page.getByTestId("research-status")).toContainText("연구 중");
  await button(page, "시간 재개").click();
  await expect(page.getByTestId("research-status")).toContainText(
    "완료 연구 1개",
  );
  await button(page, "일시정지").click();
  await page
    .getByLabel("연구 기술", { exact: true })
    .selectOption("TECH_SMOKE");
  await expect(button(page, "연구 시작")).toBeDisabled();
  s = built("trade");
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-1", count: 1 },
    "trade-staff",
  );
  s = advanceTimber(s, 1);
  s = commandTimber(
    s,
    { type: "dispatch-food", id: "build-1", food: "RES_FISH", rank: 1 },
    "trade",
  );
  s = advanceTimber(s, 150);
  await load(page, s);
  await page.getByText("완공 시설 1곳", { exact: true }).click();
  await page.getByLabel("build-1 교류 범위", { exact: true }).selectOption("2");
  await expect(
    button(page, "목재8 ↔ 식량16 교역 파견 · 배치1명"),
  ).toBeVisible();
});
