import { expect, type Page, test } from "@playwright/test";
import {
  advanceTimber,
  commandTimber,
  createPlayState,
  createTimberSave,
  createTimberState,
  payTown,
  RESEARCH_CATALOG,
  type TimberState,
} from "../../packages/game-core/dist/index.js";

const button = (p: Page, name: string) =>
  p.getByRole("button", { name, exact: true });
function fixture(
  route: "flight" | "mechanical" | "dictatorship",
  completed: string[],
  pending?: string,
) {
  let s = createTimberState({ ...createPlayState(), minute: 540 });
  s = commandTimber(
    s,
    {
      type: "plan-building",
      kind: "workshop",
      position: { x: 12, z: 12 },
      headingRadians: Math.PI,
    },
    "lab",
  );
  s = advanceTimber(s, 150);
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-1", count: 2 },
    "staff",
  );
  s = advanceTimber(s, 30);
  for (const id of [...completed, ...(pending ? [pending] : [])]) {
    const r = RESEARCH_CATALOG.find((r) => r.id === id);
    if (!r) throw Error("연구 없음");
    s = payTown(s, r.cost);
  }
  const r = RESEARCH_CATALOG.find((r) => r.id === pending);
  return {
    ...s,
    paused: true,
    town: {
      ...s.town,
      development: {
        ...s.town.development,
        tradeCount: 1,
        completed,
        story: {
          rebellion: true,
          route,
          chungnyeong: route === "mechanical" ? "mechanical" : "alive",
        },
        research: r
          ? [
              {
                tech: r.id,
                facility: "build-1",
                work: r.workdays * 540 * 3 - 1,
              },
            ]
          : [],
      },
    },
  } as TimberState;
}
async function load(p: Page, s: TimberState) {
  await p.goto("/");
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
  await button(p, "마른 목재20 조달 체험하기").click();
  await expect(p.getByTestId("timber-clock")).toBeVisible();
  await button(p, "저장").click();
  await button(p, "진행 불러오기").click();
  await expect(p.getByTestId("timber-save-status")).toContainText(
    "불러왔습니다",
  );
  await button(p, "저장").click();
}
test("초기 연구 화면은 후반 사건과 기술을 공개하지 않는다", async ({
  page,
}) => {
  await load(page, createTimberState(createPlayState()));
  const panel = page.getByRole("region", { name: "연구와 교역망" });
  await expect(panel.getByLabel("연구 기술")).toBeAttached();
  await expect(panel).not.toContainText(/반란|시해|날틀|전기자극기|메카/);
});
test("반란 진압 노선의 날틀 연구 완료가10배와 새 삽화를 표시한다", async ({
  page,
}) => {
  await load(
    page,
    fixture(
      "flight",
      ["R17", "TECH_TRAIL", "TECH_SCOUT_SPEED_2"],
      "TECH_FLIGHT",
    ),
  );
  await button(page, "시간 재개").click();
  const art = page.getByRole("img", {
    name: "완성된 날틀에 기뻐하는 충녕과 그 모습을 바라보는 고리",
    exact: true,
  });
  await expect(art).toBeVisible();
  await expect(page.getByText(/정찰 연구 배율×10/)).toBeVisible();
  await button(page, "일시정지").click();
  await art.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("날틀_연구완료_삽화.png"),
    fullPage: true,
  });
  await page.getByLabel("연구 기술", { exact: true }).selectOption("R18");
  await expect(button(page, "연구 시작")).toBeDisabled();
  await expect(
    page.getByText("선택한 이야기 분기에서는 연구할 수 없습니다.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("독재 노선에서 시설을 지정해야 강제 작업과 새 삽화가 켜진다", async ({
  page,
}) => {
  let s = fixture("dictatorship", ["R17", "TECH_ELECTRICAL"]);
  s = commandTimber(
    s,
    {
      type: "plan-building",
      kind: "fishery",
      position: { x: 46, z: 32 },
      headingRadians: Math.PI,
    },
    "fish",
  );
  s = advanceTimber(s, 150);
  s = commandTimber(
    s,
    { type: "facility-staff", id: "build-2", count: 2 },
    "fish-staff",
  );
  s = advanceTimber(s, 40);
  await load(page, s);
  const art = page.getByRole("img", {
    name: "전기자극기로 강제 노동하는 주민들을 내려다보는 양녕과 고리",
    exact: true,
  });
  await expect(art).toHaveCount(0);
  await page.getByText("완공 시설 2곳", { exact: true }).click();
  await page.getByLabel("build-2 강제 작업", { exact: true }).click();
  await expect(
    page.getByLabel("build-2 강제 작업", { exact: true }),
  ).toBeChecked();
  await expect(art).toBeVisible();
  await expect(page.getByText(/생산 배율×2.00/)).toBeVisible();
  await art.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("전기자극기_지정시행_삽화.png"),
    fullPage: true,
  });
});
test("메카 노선은 사망자의 뼈로 한 개체만 제작하고 저장해도 중복 제작하지 않는다", async ({
  page,
}) => {
  let s = fixture("mechanical", ["R17", "R18", "TECH_MECHA2"]);
  const source = s.residents.at(-1)?.id ?? "";
  s = commandTimber(
    s,
    {
      type: "citizen-event",
      event: { type: "death", id: "source", citizenIds: [source] },
    },
    "death",
  );
  await load(page, s);
  await button(page, "주민 60의 뼈로 메카 제작").click();
  await expect(
    page.getByText("활동 중 메카 1명 · 사용 가능한 사망자 0명", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(button(page, "주민 60의 뼈로 메카 제작")).toHaveCount(0);
  await button(page, "저장").click();
  await button(page, "진행 저장").click();
  await expect(page.getByTestId("timber-save-status")).toContainText(
    "저장했습니다",
  );
  await button(page, "진행 불러오기").click();
  await expect(
    page.getByText("활동 중 메카 1명 · 사용 가능한 사망자 0명", {
      exact: true,
    }),
  ).toBeVisible();
});
