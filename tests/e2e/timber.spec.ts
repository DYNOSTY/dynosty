import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createTimberSave,
  createTimberState,
  loggingSite,
  productionSiteDefinition,
  TIMBER_RULES,
} from "../../packages/game-core/dist/index.js";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

for (const siteId of ["coal-west", "iron-north", "stone-east"] as const) {
  test(`${siteId} 작업장에 배치하면 광물을 자동 입고하고 저장 후 이어진다`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    let s = commandTimber(
      advanceTimber(createTimberState(), 120),
      { type: "build-logging", siteId },
      "extract",
    );
    s = advanceTimber(s, 180);
    s = commandTimber(s, { type: "build-storage", siteId }, "store");
    s = advanceTimber(s, 180);
    s = commandTimber(
      s,
      { type: "set-logging-workers", siteId, count: 2 },
      "staff",
    );
    for (
      let i = 0;
      i < 250 && loggingSite(s, siteId).haul?.phase !== "outbound";
      i++
    )
      s = advanceTimber(s, 1);
    expect(loggingSite(s, siteId).haul?.phase).toBe("outbound");
    const resource = productionSiteDefinition(siteId).resource,
      initial = s.world.resources[resource] / 10000;
    await enter(page);
    await loadFixture(page, createTimberSave(s));
    await page.getByLabel("작업장 권역", { exact: true }).selectOption(siteId);
    await expect(page.getByLabel("작업 인원", { exact: true })).toHaveValue(
      "2",
    );
    await dev(page);
    await button(page, "채굴 현장 보기").click();
    await expect(page.getByTestId("camera-distance")).toHaveText("48.00");
    await expect(page.getByTestId("camera-angle")).toHaveText("60.00");
    if (siteId === "coal-west") {
      await button(page, "복홀 전체 보기").click();
      await expect(page.getByTestId("camera-distance")).toHaveText("640.00");
      await button(page, "채굴 현장 보기").click();
      await expect(page.getByTestId("camera-distance")).toHaveText("48.00");
    }
    await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
    await button(page, "시간 재개").click();
    await expect
      .poll(
        async () =>
          Number(
            (
              await page.getByTestId(`resource-${resource}`).textContent()
            )?.replaceAll(",", ""),
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(initial);
    await button(page, "일시정지").click();
    await button(page, "진행 저장").click();
    await expect(page.getByTestId("timber-save-status")).toContainText(
      "저장했습니다",
    );
    await page.reload();
    await button(page, "마른 목재20 조달 체험하기").click();
    await saves(page);
    await button(page, "진행 불러오기").click();
    await page.getByLabel("작업장 권역", { exact: true }).selectOption(siteId);
    await expect(page.getByTestId("logging-panel")).toContainText(
      /누적 입고 [1-9]/,
    );
  });
}
async function enter(page: Page) {
  await page.goto("/");
  await button(page, "마른 목재20 조달 체험하기").click();
  await expect(page.getByTestId("timber-phase")).toHaveText("공급 제안 비교");
}
async function homeCursor(
  page: import("@playwright/test").Page,
  x: number,
  z: number,
) {
  const canvas = page.locator("canvas"),
    box = await canvas.boundingBox();
  if (!box) throw Error("캔버스 없음");
  const depth = 32 + z * Math.sin(Math.PI / 3),
    scale = box.height / (2 * Math.tan(0.4) * depth);
  const point = {
    x: box.x + box.width / 2 + x * scale,
    y: box.y + box.height / 2 - z * Math.cos(Math.PI / 3) * scale,
  };
  await page.mouse.move(point.x, point.y);
  return point;
}
async function contract(page: Page, offer = "B") {
  await button(page, `제안 ${offer} 선택`).click();
  await button(page, "선택한 제안 계약").click();
}
async function dev(page: Page) {
  const toggle = button(page, "개발 도구");
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
}
async function finish(page: Page) {
  await dev(page);
  if (await button(page, "일시정지").isVisible()) {
    await button(page, "일시정지").click();
    await expect(button(page, "시간 재개")).toBeVisible();
  }
  for (let i = 0; i < 14; i++) {
    if ((await page.getByTestId("timber-phase").textContent()) === "조달 완료")
      return;
    const before = await page.getByTestId("timber-phase").textContent();
    await button(page, "다음 작업 완료까지").click();
    await expect(page.getByTestId("timber-phase")).not.toHaveText(before ?? "");
  }
  throw Error("업무가 완료되지 않았습니다.");
}
async function saves(page: Page) {
  const toggle = button(page, "저장");
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
}
test("둥지 완성 모델을 커서로 옮겨 회전·취소하고 클릭 확정 뒤 자재를 운반해 건설한다", async ({
  page,
}) => {
  const s = advanceTimber(createTimberState(), 120);
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await button(page, "온돌 둥지 증설 · 목재20").click();
  const invalid = await homeCursor(page, 0, -1);
  await expect(page.getByTestId("home-placement-status")).toContainText("겹");
  await page.mouse.click(invalid.x, invalid.y);
  await expect(page.getByTestId("housing-status")).toContainText("둥지 6곳");
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("120");
  const point = await homeCursor(page, 12, 12);
  await expect(page.getByTestId("home-placement-status")).toContainText(
    "배치 가능",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("home-placement-status")).toContainText("195°");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("home-placement-status")).toContainText("180°");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("home-placement-status")).toHaveCount(0);
  await button(page, "온돌 둥지 증설 · 목재20").click();
  await homeCursor(page, 12, 12);
  await page.keyboard.press("ArrowRight");
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("100");
  await expect(page.getByTestId("building-queue")).toContainText("자재 운반");
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await expect(page.getByTestId("housing-status")).toContainText("둥지 7곳", {
    timeout: 25000,
  });
  await button(page, "일시정지").click();
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  const record = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("dynosty.timber.saves.v17") ?? "null")
        .current.state,
  );
  expect(record.homes[6].headingRadians).toBeCloseTo(Math.PI + Math.PI / 12);
  expect(
    record.residents.filter(
      (r: { homeId: string }) => r.homeId === record.homes[6].id,
    ),
  ).toHaveLength(0);
  await page.reload();
  await button(page, "마른 목재20 조달 체험하기").click();
  await saves(page);
  await button(page, "진행 불러오기").click();
  await expect(page.getByTestId("housing-status")).toContainText("둥지 7곳");
});

test("제재소·저장소의 인원 지정으로 자동 운반·입고하고 저장 후 이어진다", async ({
  page,
}) => {
  let s = commandTimber(
    advanceTimber(createTimberState(), 120),
    {
      type: "plan-building",
      kind: "logging",
      position: { x: -24, z: -8 },
      headingRadians: Math.PI,
    },
    "new-mill",
  );
  s = advanceTimber(s, 180);
  s = commandTimber(
    s,
    {
      type: "plan-building",
      kind: "storage",
      position: { x: 12, z: 12 },
      headingRadians: Math.PI,
    },
    "new-store",
  );
  s = advanceTimber(s, 120);
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await dev(page);
  await expect(page.getByLabel("작업 인원", { exact: true })).toBeEnabled();
  await page.getByLabel("작업 인원", { exact: true }).selectOption("2");
  for (let i = 0; i < 30; i++) {
    const before = await page.getByTestId("timber-clock").textContent();
    await button(page, "5분 진행").click();
    await expect(page.getByTestId("timber-clock")).not.toHaveText(before ?? "");
  }
  await expect(page.getByTestId("logging-panel")).toContainText(
    /누적 입고 [1-9]/,
  );
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button(page, "진행 불러오기").click();
  await expect(page.getByLabel("작업 인원", { exact: true })).toHaveValue("2");
});

test("고갈된 숲은 평지로 표시되며 기존 저장을 불러와도 고갈 상태를 유지한다", async ({
  page,
}) => {
  let s = commandTimber(
    advanceTimber(createTimberState(), 120),
    { type: "build-logging" },
    "mill",
  );
  s = advanceTimber(s, 50);
  s = commandTimber(s, { type: "build-storage" }, "storage");
  s = advanceTimber(s, 50);
  s = commandTimber(s, { type: "set-logging-workers", count: 4 }, "staff");
  for (let i = 0; i < 3; i++) s = advanceTimber(s, 1440);
  expect(s.logging.remaining).toBe(0);
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await button(page, "벌목 현장 보기").click();
  await expect(page.getByTestId("logging-panel")).toContainText("숲의 목재 0");
  await expect(page.getByTestId("logging-panel")).toContainText(
    "고갈된 숲만 평탄화",
  );
  await expect(page.getByTestId("logging-panel")).toContainText(
    "누적 입고 120",
  );
});

test("다른 숲 권역의 자유 배치 시설과 기존 시설의 자원을 따로 보존한다", async ({
  page,
}) => {
  let s = commandTimber(
    advanceTimber(createTimberState(), 120),
    { type: "build-logging" },
    "west",
  );
  s = advanceTimber(s, 50);
  s = commandTimber(
    s,
    {
      type: "plan-building",
      kind: "logging",
      position: { x: 41, z: 28 },
      headingRadians: Math.PI,
    },
    "central",
  );
  s = advanceTimber(s, 120);
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await dev(page);
  await page.getByLabel("작업장 권역", { exact: true }).selectOption("central");
  await page.getByLabel("작업 인원", { exact: true }).selectOption("2");
  for (let i = 0; i < 30; i++) {
    const before = await page.getByTestId("timber-clock").textContent();
    await button(page, "5분 진행").click();
    await expect(page.getByTestId("timber-clock")).not.toHaveText(before ?? "");
  }
  await expect(page.getByTestId("logging-panel")).toContainText(
    /누적 입고 [1-9]/,
  );
  await page.getByLabel("작업장 권역", { exact: true }).selectOption("west");
  await expect(page.getByTestId("logging-panel")).toContainText(
    "숲의 목재 120",
  );
});

test("식성별 주민 구성과 수레 내려놓기·이탈 단계를 표시한다", async ({
  page,
}) => {
  await enter(page);
  await expect(page.getByTestId("population-diets")).toContainText(
    "트리케라톱스 20명(풀)",
  );
  await expect(page.getByTestId("population-diets")).toContainText(
    "벨로키랍토르 20명(고기)",
  );
  await expect(page.getByTestId("population-diets")).toContainText(
    "스피노사우루스 20명(어류)",
  );
  await contract(page);
  await button(page, "일시정지").click();
  await dev(page);
  for (const phase of [
    "야적장으로 운송",
    "수레 내려놓기",
    "손잡이에서 물러나기",
    "자동 하역",
  ]) {
    await button(page, "다음 작업 완료까지").click();
    await expect(page.getByTestId("timber-phase")).toHaveText(phase);
  }
});

test("검사 명령 없이 허기 요구가 생기고 식당을 건설하면 각자 이용한다", async ({
  page,
}) => {
  // 건설·직원 이동·식사를 실제 시간으로 기다리는 연속 시나리오다.
  test.setTimeout(90_000);
  await enter(page);
  await loadFixture(
    page,
    createTimberSave(advanceTimber(createTimberState(), 120)),
  );
  await expect(page.getByTestId("village-population")).toContainText(
    "주민 60명",
  );
  await expect(page.getByTestId("resident-requests")).toContainText(
    "식당을 지어 주세요",
    { timeout: 5000 },
  );
  await expect(button(page, "식사 필요 검사")).toHaveCount(0);
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await button(page, "공동 식당 배치 · 목재30 · 철재2").click();
  const point = await homeCursor(page, -15, -15);
  await expect(page.getByTestId("home-placement-status")).toContainText(
    "배치 가능",
  );
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("restaurant-status")).toHaveText(
    "운영 인력을 배치해 주세요",
    { timeout: 25000 },
  );
  await expect(page.getByTestId("resource-RES_PLANT")).toHaveText("120");
  await page.getByLabel("식당 운영 인원", { exact: true }).selectOption("1");
  await expect(page.getByTestId("restaurant-status")).toHaveText("영업 중", {
    timeout: 25000,
  });
  await page.getByText("주민 생활 동선", { exact: true }).click();
  await expect(page.getByTestId("resident-routines")).toContainText("식사 중", {
    timeout: 10000,
  });
  await button(page, "일시정지").click();
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("90");
  await expect(page.getByTestId("resource-RES_PLANT")).not.toHaveText("120");
  await saves(page);
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  const food = await page.getByTestId("resource-RES_PLANT").textContent();
  await button(page, "진행 불러오기").click();
  await expect(button(page, "시간 재개")).toBeVisible();
  await expect(page.getByTestId("resource-RES_PLANT")).toHaveText(food ?? "");
});

test("계약 한 번으로 주민 선택 없이 전 과정과 공동 재고·다음 임무가 자동 진행된다", async ({
  page,
}) => {
  await enter(page);
  await expect(button(page, "1번 주민 선택")).toHaveCount(0);
  for (const name of [
    "수레 출발시키기",
    "창고에 짐 내리기",
    "전량 검사·검수 시작",
    "정상분 16 받기",
    "사용 가능한 목재 20 둥지에 배분",
  ])
    await expect(button(page, name)).toHaveCount(0);
  await contract(page, "A");
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await expect(page.getByTestId("next-mission")).toContainText(
    "P01 복홀 호구와 먹이 장부",
    { timeout: 26000 },
  );
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("140");
  await expect(page.getByTestId("resource-RES_METAL")).toHaveText("36");
  await expect(page.getByTestId("timber-workers")).toHaveText(
    "유휴 일손 60/60",
  );
  await button(page, "구휼 장부 우선").click();
  await expect(page.getByTestId("next-mission")).toContainText(
    "P01 장부 원칙 결정",
  );
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("140");
});

test("B도 직접 수령이나 배분 없이 공동 재고에 입고한다", async ({ page }) => {
  await enter(page);
  await contract(page);
  await finish(page);
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("140");
  await expect(page.getByTestId("resource-RES_METAL")).toHaveText("34");
  await expect(page.getByTestId("timber-result")).toContainText(
    "공동 재고 정산 완료",
  );
  await button(page, "호패 대조 우선").click();
  await expect(page.getByTestId("next-mission")).toContainText(
    "호패 대조 우선",
  );
});

test("운송 중 저장과 새로고침 복원은 자동 업무와 공동 재고의 중복 정산을 막는다", async ({
  page,
}) => {
  await enter(page);
  await contract(page);
  await button(page, "일시정지").click();
  await dev(page);
  await button(page, "다음 작업 완료까지").click();
  await expect(page.getByTestId("timber-phase")).toHaveText("야적장으로 운송");
  await saves(page);
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await page.reload();
  await button(page, "마른 목재20 조달 체험하기").click();
  await saves(page);
  await button(page, "진행 불러오기").click();
  await expect(page.getByTestId("timber-phase")).toHaveText("야적장으로 운송");
  await expect(button(page, "시간 재개")).toBeVisible();
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("120");
  await expect(page.getByTestId("resource-RES_METAL")).toHaveText("34");
  await finish(page);
  await button(page, "5분 진행").click();
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("140");
});

test("마을 현황으로 돌아가도 같은 공동 재고를 유지한다", async ({ page }) => {
  await enter(page);
  await contract(page);
  await finish(page);
  await button(page, "마을 현황으로").click();
  await expect(page.getByTestId("resource-RES_WOOD")).toHaveText("140");
  await expect(page.getByTestId("resource-RES_METAL")).toHaveText("34");
});

async function loadFixture(
  page: Page,
  save: ReturnType<typeof createTimberSave>,
) {
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
    save,
  );
  await saves(page);
  await button(page, "진행 불러오기").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
}
async function hoverHouse(page: Page) {
  const canvas = page.locator("canvas"),
    box = await canvas.boundingBox();
  if (!box) throw Error("장면이 없습니다.");
  for (const dy of [-65, -50, -35, -20, 0, 15, 30])
    for (const dx of [0, -15, 15]) {
      await canvas.hover({
        position: { x: box.width / 2 + dx, y: box.height / 2 + dy },
      });
      if (
        (await page.getByRole("tooltip").isVisible()) &&
        (await page.getByRole("tooltip").textContent())?.includes("온돌 둥지")
      )
        return;
    }
  throw Error("건물 위 체력바가 표시되지 않습니다.");
}
test("건물 체력은 마우스를 올리면 나타나며 화재 손상 뒤 직접 보수한다", async ({
  page,
}) => {
  let s = commandTimber(
    createTimberState(),
    { type: "choose", offer: "B" },
    "choose",
  );
  s = commandTimber(s, { type: "contract" }, "contract");
  s = advanceTimber(s, 100);
  s = commandTimber(
    s,
    { type: "building-damage", cause: "fire", amount: 25 },
    "fire",
  );
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await hoverHouse(page);
  await expect(page.getByRole("tooltip")).toContainText("온돌 둥지 · 75/100");
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "75");
  await page.getByRole("heading", { name: "DYNOSTY", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByText("둥지 보수", { exact: true }).click();
  await button(page, "건물 보수 명령").click();
  await button(page, "일시정지").click();
  await dev(page);
  await button(page, "다음 작업 완료까지").click();
  await expect(page.getByTestId("timber-phase")).toHaveText(
    "명령받은 건물 보수",
  );
  await button(page, "다음 작업 완료까지").click();
  await expect(page.getByTestId("timber-phase")).toHaveText("조달 완료");
  await expect(button(page, "건물 보수 명령")).toBeDisabled();
  await expect(button(page, "건물 손상 검사 (-25)")).toHaveCount(0);
  await hoverHouse(page);
  await expect(page.getByRole("tooltip")).toContainText("100/100");
});
test("합류한 주민과 건강 사건의 결과를 인구·생활 명부에 함께 반영한다", async ({
  page,
}) => {
  let s = commandTimber(
    createTimberState(),
    {
      type: "citizen-event",
      event: {
        type: "arrival",
        id: "newcomers",
        groups: [
          { species: "R03", count: 3 },
          { species: "SPINO", count: 3 },
        ],
      },
    },
    "arrival",
  );
  const sick = s.residents[60]?.id,
    dead = s.residents[61]?.id;
  if (!sick || !dead) throw Error("합류 실패");
  s = commandTimber(
    s,
    {
      type: "citizen-event",
      event: { type: "illness", id: "illness", citizenIds: [sick] },
    },
    "illness",
  );
  s = commandTimber(
    s,
    {
      type: "citizen-event",
      event: { type: "death", id: "death", citizenIds: [dead] },
    },
    "death",
  );
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await expect(page.getByTestId("village-population")).toHaveText(
    "주민 65명 · 치료 필요 1명 · 누적 사망 1명",
  );
  await expect(page.getByTestId("population-diets")).toContainText(
    "벨로키랍토르 22명(고기)",
  );
  await page.getByText("주민 생활 동선", { exact: true }).click();
  await expect(
    page.getByTestId("resident-routines").getByRole("listitem"),
  ).toHaveCount(65);
});

test("손상 저장과 저장 공간 오류는 현재 상태·기존 원본을 보존한다", async ({
  page,
}) => {
  await enter(page);
  await saves(page);
  await page.evaluate(() =>
    localStorage.setItem("dynosty.timber.saves.v17", "{broken"),
  );
  await button(page, "진행 불러오기").click();
  await expect(page.getByRole("alert")).toContainText("손상");
  await button(page, "진행 저장").click();
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves.v17")),
  ).toBe("{broken");
  await page.evaluate(() =>
    localStorage.removeItem("dynosty.timber.saves.v17"),
  );
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  const original = await page.evaluate(() =>
    localStorage.getItem("dynosty.timber.saves.v17"),
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await button(page, "진행 저장").click();
  await expect(page.getByRole("alert")).toContainText("현재 진행");
  expect(
    await page.evaluate(() => localStorage.getItem("dynosty.timber.saves.v17")),
  ).toBe(original);
});

test("탭 비활성과 저장 복원은 명시적 재개를 기다린다", async ({ page }) => {
  await enter(page);
  await contract(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(button(page, "시간 재개")).toBeVisible();
  const stopped = await page.getByTestId("timber-clock").textContent();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("timber-clock")).toHaveText(stopped ?? "");
});

test("좁은 화면도 주민 선택 없이 계약하고 자동 진행한다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await enter(page);
  await contract(page);
  await expect(button(page, "1번 주민 선택")).toHaveCount(0);
  await expect(button(page, "수레 출발시키기")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("배급 방식과 거주 현황을 보여 주고 고기 없는 식당 직원도 어류를 배급받는다", async ({
  page,
}) => {
  let s = createTimberState();
  const employee = s.residents.find(
    (r) => s.world.citizens.find((c) => c.id === r.id)?.species === "R03",
  );
  if (!employee) throw Error("직원 없음");
  s = {
    ...s,
    restaurantBuilt: true,
    restaurantWorkerTarget: 1,
    world: { ...s.world, resources: { ...s.world.resources, RES_MEAT: 0 } },
    residents: s.residents.map((r) =>
      r.id === employee.id
        ? {
            ...r,
            workplaceId: "restaurant",
            position: {
              x: TIMBER_RULES.restaurant.x,
              z: TIMBER_RULES.restaurant.z + 4.4,
            },
            routine: "working",
            hunger: 400,
            insideHome: false,
          }
        : { ...r, hunger: 0 },
    ),
  };
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await expect(page.getByTestId("housing-status")).toContainText(
    "둥지 6곳 · 입주 60/60명",
  );
  await expect(page.getByTestId("timber-clock")).toContainText("현재 07:00");
  await page.getByText("종별 배급", { exact: true }).click();
  await expect(page.getByTestId("ration-table")).toContainText("0.5");
  await page.getByLabel("배급 방식", { exact: true }).selectOption("cap");
  await expect(page.getByTestId("ration-table")).not.toContainText("0.5");
  await page.getByLabel("배급 방식", { exact: true }).selectOption("needs");
  await button(page, "시간 재개").click();
  await expect(page.getByTestId("resource-RES_FISH")).toHaveText("119.75", {
    timeout: 5000,
  });
  await button(page, "일시정지").click();
  await page.getByText("주민 생활 동선", { exact: true }).click();
  await expect(page.getByTestId("resident-routines")).toContainText(
    "(식당 직원) · 식사 중",
  );
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  const record = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("dynosty.timber.saves.v17") ?? "null",
    ).current.state.residents.find(
      (r: { workplaceId: string | null }) => r.workplaceId === "restaurant",
    ),
  );
  expect(record.rationUsed).toBe(2500);
  expect(record.lastMeal).toEqual({ RES_FISH: 2500 });
});
test("거주 공간이 부족한 합류 주민을 둥지 증설 후 자동 입주시킨다", async ({
  page,
}) => {
  let s = commandTimber(
    advanceTimber(createTimberState(), 120),
    {
      type: "citizen-event",
      event: {
        id: "housing-arrival",
        type: "arrival",
        groups: [{ species: "SPINO", count: 15 }],
      },
    },
    "arrival",
  );
  s = advanceTimber(s, 1);
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  await page.getByLabel("진행 속도", { exact: true }).selectOption("3");
  await button(page, "온돌 둥지 증설 · 목재20").click();
  const point = await homeCursor(page, 12, 12);
  await expect(page.getByTestId("home-placement-status")).toContainText(
    "배치 가능",
  );
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId("housing-status")).toContainText(
    "둥지 7곳 · 입주 75/75명",
    { timeout: 25000 },
  );
  await button(page, "일시정지").click();
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await page.reload();
  await button(page, "마른 목재20 조달 체험하기").click();
  await saves(page);
  await button(page, "진행 불러오기").click();
  await expect(page.getByTestId("housing-status")).toContainText(
    "둥지 7곳 · 입주 75/75명",
  );
});

test("주민의 느낌표에 마우스를 올리면 요구 사유를 읽을 수 있다", async ({
  page,
}) => {
  let s = createTimberState();
  const id = s.residents[0]?.id;
  if (!id) throw Error("주민 없음");
  s = {
    ...s,
    residents: s.residents.map((r) =>
      r.id === id
        ? {
            ...r,
            position: { x: 0, z: -6 },
            insideHome: false,
            hunger: 400,
            request: "no-restaurant",
            routine: "home",
          }
        : {
            ...r,
            position: r.home ?? r.position,
            insideHome: true,
            routine: "idle",
          },
    ),
  };
  await enter(page);
  await loadFixture(page, createTimberSave(s));
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw Error("장면 없음");
  // 현재 기본 카메라(거리32·고도60도·수직시야각0.8)의 전경 표식 위치.
  const beta = Math.PI / 3,
    depth = 32 - 2 * Math.cos(beta) - 6 * Math.sin(beta);
  const point = {
    x: box.width / 2,
    y:
      box.height / 2 -
      ((2 * Math.sin(beta) - 6 * Math.cos(beta)) * box.height) /
        (2 * depth * Math.tan(0.4)),
  };
  let offset = 0;
  await expect
    .poll(
      async () => {
        await page.mouse.move(
          box.x + point.x + (offset++ % 2),
          box.y + point.y,
        );
        return await page
          .getByRole("tooltip")
          .textContent({ timeout: 300 })
          .catch(() => "");
      },
      { timeout: 10000 },
    )
    .toContain("지휘관님, 배가 고파요. 식당을 지어 주세요!");
});
