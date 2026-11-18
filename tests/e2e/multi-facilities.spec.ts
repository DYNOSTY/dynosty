import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  type BuildingKind,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
  dailyFoodDemand,
  RESEARCH_CATALOG,
  type TimberState,
} from "../../packages/game-core/dist/index.js";

let seq = 0;
const cmd = (s: TimberState, c: Parameters<typeof commandTimber>[1]) =>
  commandTimber(s, c, `multi-browser-${++seq}`);
function start() {
  const w = createPlayState();
  return createTimberState({
    ...w,
    minute: 540,
    resources: { ...w.resources, RES_WOOD: 5000000, RES_METAL: 5000000 },
  });
}
function build(s: TimberState, kind: BuildingKind, x = 12, z = 12) {
  s = cmd(s, {
    type: "plan-building",
    kind,
    position: { x, z },
    headingRadians: Math.PI,
  });
  for (let i = 0; i < 500 && s.town.orders.length; i++) s = advanceTimber(s, 1);
  if (s.town.orders.length) throw Error("건설 미완료");
  return s;
}
const b = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
async function load(p: Page, s: TimberState) {
  await p.goto("/");
  await expect(p.getByTestId("play-scene-status")).toHaveText("3D 준비 완료", {
    timeout: 90000,
  });
  await p.evaluate(
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
  await b(p, "건설").click();
  await b(p, "저장").click();
  await b(p, "진행 불러오기").click();
  await expect(p.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
  await b(p, "저장").click();
}
test("두 식당의 인원 지시는 독립적이고 단계별 설계와 좌상단 시각이 보인다", async ({
  page,
}) => {
  let s = build(build(start(), "restaurant"), "restaurant", 0, 16);
  for (const f of s.town.facilities)
    s = cmd(s, { type: "facility-staff", id: f.id, count: 1 });
  s = advanceTimber(s, 35);
  await load(page, s);
  await page.getByText("완공 시설 2곳", { exact: true }).click();
  await expect(
    page.getByLabel("build-1 운영 인원", { exact: true }),
  ).toHaveValue("1");
  await page.getByLabel("build-2 운영 인원", { exact: true }).selectOption("2");
  await expect(
    page.getByLabel("build-2 운영 인원", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("build-1 운영 인원", { exact: true }),
  ).toHaveValue("1");
  await expect(page.getByText(/좌석10 · 직원/)).toHaveCount(2);
  await page.getByLabel("지을 건물", { exact: true }).selectOption("fishery");
  await page.getByText("단계별 시설 설계 보기", { exact: true }).click();
  const art = page.getByAltText("어획막 1~3단계 설계 삽화");
  await expect(art).toBeVisible();
  await expect
    .poll(() => art.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByTestId("play-clock")).toContainText("일차");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("play-clock")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("두 연구소의 동시 연구 완료와 저장 복원은 연구를 중복 적용하지 않는다", async ({
  page,
}) => {
  let s = build(build(start(), "workshop"), "workshop", 0, 16);
  for (const f of s.town.facilities)
    s = cmd(s, { type: "facility-staff", id: f.id, count: 2 });
  s = advanceTimber(s, 35);
  for (const tech of ["TECH_TRAIL", "UPGRADE_HOME_2"])
    s = cmd(s, { type: "start-research", tech });
  s = {
    ...s,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        research: s.town.development.research.map((j) => ({
          ...j,
          work:
            (RESEARCH_CATALOG.find((r) => r.id === j.tech)?.workdays ?? 1) *
              540 *
              3 -
            1,
        })),
      },
    },
  };
  await load(page, s);
  await b(page, "연구").click();
  await expect(page.getByTestId("research-status").locator("p")).toHaveCount(2);
  await b(page, "시간 재개").click();
  await expect(page.getByTestId("research-status")).toHaveText("완료 연구 2개");
  await b(page, "일시정지").click();
  await expect(b(page, "시간 재개")).toBeVisible();
  await b(page, "저장").click();
  await b(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await b(page, "진행 불러오기").click();
  await expect(page.getByTestId("research-status")).toHaveText("완료 연구 2개");
});
test("어획막의 다섯 인원으로 별도 운반 없이 공동 어류가 즉시 증가한다", async ({
  page,
}) => {
  let s = build(start(), "fishery", 46, 32);
  s = {
    ...s,
    residents: s.residents.map((r, i) => ({
      ...r,
      workplaceId: i < 5 ? null : "guard",
    })),
  };
  s = cmd(s, { type: "facility-staff", id: "build-1", count: 5 });
  s = advanceTimber(s, 35);
  const demand = dailyFoodDemand(s.world);
  await load(page, {
    ...s,
    paused: true,
    world: {
      ...s.world,
      resources: {
        ...s.world.resources,
        RES_PLANT: demand.RES_PLANT,
        RES_MEAT: 0,
        RES_FISH: demand.RES_MEAT + demand.RES_FISH - 1,
      },
    },
  });
  const worried = page.getByAltText("걱정스러운 나르미");
  await expect(worried).toBeAttached();
  await expect
    .poll(() =>
      worried.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBe(512);
  await expect(page.getByText(/오늘 먹일 식량이 모자랍니다/)).toHaveCount(1);
  await page.getByText("완공 시설 1곳", { exact: true }).click();
  await expect(
    page.getByLabel("build-1 운영 인원", { exact: true }),
  ).toHaveValue("5");
  const amount = async () =>
    Number(
      (await page.getByTestId("resource-RES_FISH").textContent())?.replaceAll(
        ",",
        "",
      ),
    );
  const before = await amount();
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await b(page, "시간 재개").click();
  await expect.poll(amount, { timeout: 15000 }).toBeGreaterThan(before);
  await expect(page.getByAltText("평상시의 나르미")).toBeAttached();
  await expect(page.getByText(/오늘 먹일 식량이 모자랍니다/)).toHaveCount(0);
  await expect(page.getByText(/어류 즉시 입고 · 대기/)).toContainText(
    "운반 중 0",
  );
});

test("방문 상인의 초상과 재협상 · 계약 입고", async ({ page }) => {
  let s = build(start(), "trade");
  const post = s.town.facilities[0]!;
  s = cmd(s, { type: "facility-staff", id: post.id, count: 1 });
  s = advanceTimber(s, 35);
  await load(page, {
    ...s,
    paused: true,
    scoutVisitors: 1,
    merchantItem: 3,
    riskyMerchants: [3],
  });
  await b(page, "복홀 전체 보기").click();
  await b(page, "입촌 요청").click();
  await expect(b(page, "받아준다")).toBeFocused();
  for (const name of [/나르미$/, /아픈 주민을 걱정하는 달이/]) {
    const image = page.getByRole("img", { name });
    await expect
      .poll(() => image.evaluate((e) => (e as HTMLImageElement).naturalWidth))
      .toBe(512);
  }
  await b(page, "교역소 상인 방문").click();
  const visit = page.getByLabel("교역소 방문");
  await expect(visit).toContainText("거친손");
  const portrait = visit.getByRole("img", { name: "목재 상인 거친손의 초상" });
  await expect
    .poll(() => portrait.evaluate((e) => (e as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(visit).toContainText("지난 납품");
  await visit
    .getByRole("button", { name: /A · 철재 3개로 목재 8개 계약/ })
    .click();
  await expect(visit).toHaveCount(0);
});

test("복홀 운영 화면의 밤과 낮 조명이 마을 시각을 따른다", async ({ page }) => {
  const s = start();
  const light = () =>
    page.evaluate(() =>
      Number(document.documentElement.style.getPropertyValue("--daylight")),
    );
  for (const minute of [0, 720]) {
    await load(page, { ...s, paused: true, world: { ...s.world, minute } });
    await expect(page.getByTestId("play-clock")).toContainText(
      minute === 0 ? "00:00" : "12:00",
    );
    await expect.poll(light).toBe(minute === 0 ? 0.72 : 1);
    await expect(page.locator(".village-clock, .play-time")).toHaveCount(0);
  }
});
