import { expect, type Page, test } from "@playwright/test";
import { SITE_POINTS, type SiteId } from "../../apps/web/src/site-targets.js";
import {
  clickFloor,
  clickScene,
  outlinePixels,
  worldPoint,
} from "./scene-picking.js";
import { closeWorkspace, openLaborPanel, openWorkspace } from "./workspace.js";

const b = (p: Page, n: string) =>
  p.getByRole("button", { name: n, exact: true });
async function enter(p: Page) {
  await p.goto("/");
  await b(p, "마른 목재 20 조달").click();
  await openLaborPanel(p);
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
}
async function clickSite(p: Page, id: SiteId) {
  await clickScene(p, await worldPoint(p, SITE_POINTS[id]));
}
async function initial(p: Page) {
  await enter(p);
  for (const n of [
    "확장 제안 A 선택",
    "확장 약정하기",
    "확장 수레 출발",
    "다음 일손 사건까지",
  ])
    await b(p, n).click();
  await clickSite(p, "site-inspection");
  await b(p, "현장 전량 검사 시작").click();
  await b(p, "현장 다음 사건까지").click();
  await b(p, "현장 정상분 16 수령").click();
}
test("검수대·배급소 실제 클릭의 테두리·정보·단일 선택과 빈 바닥 해제를 확인한다", async ({
  page: p,
}) => {
  await enter(p);
  const canvas = p.locator("canvas"),
    before = outlinePixels(await canvas.screenshot());
  await clickSite(p, "site-inspection");
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await expect(b(p, "검수대 선택")).toHaveAttribute("aria-pressed", "true");
  const outlined = outlinePixels(await canvas.screenshot());
  expect(outlined).toBeGreaterThan(before + 10);
  await clickSite(p, "site-ration");
  await expect(p.getByTestId("site-name")).toHaveText("배급소");
  await expect(b(p, "검수대 선택")).toHaveAttribute("aria-pressed", "false");
  await expect(b(p, "현장 일손 1 배급 준비로 보내기")).toBeDisabled();
  // 제출본 마을은 건물이 여러 채라 같은 이름의 선택 버튼이 여럿이다. 첫 건물을 쓴다.
  const example = b(p, "건물 예제 선택").first();
  await example.click();
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(example).toHaveAttribute("aria-pressed", "true");
  // 제출본의 개발 도구 창은 예제 선택 뒤 3D 화면을 덮는다. 닫기 버튼으로 닫고 장면을 누른다
  // (Esc는 일시정지 메뉴를 연다).
  await closeWorkspace(p);
  await clickSite(p, "site-inspection");
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await openWorkspace(p);
  await expect(example).toHaveAttribute("aria-pressed", "false");
  await closeWorkspace(p);
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(b(p, "검수대 선택")).toHaveAttribute("aria-pressed", "false");
});
test("검수·격리품·배급소 현장 명령으로 교환과 배급을 완료하며 숨은 격리품 선택은 해제한다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await initial(p);
  await b(p, "확장 정상 목재 16 배분").click();
  await clickSite(p, "site-quarantine");
  await expect(p.getByTestId("site-name")).toHaveText("격리품");
  await expect(
    p.getByRole("region", { name: "격리품 현장 정보" }),
  ).toContainText("4개");
  await b(p, "현장 불량4 교환 요청").click();
  await b(p, "현장 교환 회수 출발").click();
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(b(p, "격리품 선택")).toBeDisabled();
  await clickSite(p, "site-ration");
  await expect(b(p, "현장 일손 1 배급 준비로 보내기")).toBeDisabled();
  for (const n of [2, 3, 4])
    await b(p, `현장 일손 ${n} 배급 준비로 보내기`).click();
  await b(p, "현장 다음 사건까지").click();
  await b(p, "현장 다음 사건까지").click();
  await expect(p.getByTestId("site-status")).toContainText("완료 · 10시간 0분");
  await clickSite(p, "site-inspection");
  await b(p, "현장 다음 사건까지").click();
  await b(p, "현장 교환품4 재검수 시작").click();
  await expect(
    p.getByRole("region", { name: "검수대 현장 정보" }),
  ).toContainText("120분");
  await b(p, "현장 다음 사건까지").click();
  await b(p, "현장 합격 교환품4 수령").click();
  await expect(
    p.getByRole("region", { name: "검수대 현장 정보" }),
  ).toContainText("0개");
  await b(p, "확장 정상 목재 4 배분").click();
  await b(p, "확장 목재 사용 확인").click();
  await expect(p.getByTestId("labor-used")).toHaveText("20");
  await expect(p.getByTestId("labor-result")).toContainText("철재3 남음");
  expect(errors).toEqual([]);
});
test("현장 재배치는 보완 진행량을 보존하고 저장·새로고침 복원에서 선택만 해제한다", async ({
  page: p,
}) => {
  await initial(p);
  await clickSite(p, "site-quarantine");
  await b(p, "현장 보완 인원 배정").click();
  await b(p, "일손 1시간 진행").click();
  await clickSite(p, "site-ration");
  await b(p, "현장 일손 2 배급 준비로 보내기").click();
  await expect(p.getByTestId("labor-repair")).toContainText(
    "60/240분 · 배정 1/2명",
  );
  await b(p, "일손 배치 저장").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const save = await p.evaluate(() =>
    localStorage.getItem("dynosty.labor.saves"),
  );
  expect(save).not.toContain("site-preview");
  await p.reload();
  await b(p, "마른 목재 20 조달").click();
  await openLaborPanel(p);
  await b(p, "일손 배치 불러오기").click();
  await expect(p.getByTestId("labor-clock")).toContainText("9시간 0분");
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await clickSite(p, "site-quarantine");
  await expect(
    p.getByRole("region", { name: "격리품 현장 정보" }),
  ).toContainText("60/240분");
  await expect(b(p, "현장 불량4 교환 요청")).toBeDisabled();
  await clickSite(p, "site-ration");
  await expect(p.getByTestId("crew-2-job")).toHaveText("배급 준비");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(save);
});
test("손상 저장 불러오기 실패는 현재 선택·진행·원문을 보존한다", async ({
  page: p,
}) => {
  await initial(p);
  await clickSite(p, "site-quarantine");
  await b(p, "일손 배치 저장").click();
  await expect(p.getByTestId("labor-save-status")).toContainText(
    "저장했습니다",
  );
  const raw = await p.evaluate(() => {
    const text = "{broken-site-save";
    localStorage.setItem("dynosty.labor.saves", text);
    return text;
  });
  await b(p, "일손 배치 불러오기").click();
  await expect(p.getByTestId("site-name")).toHaveText("격리품");
  await expect(p.getByRole("alert")).toContainText("손상");
  await expect(b(p, "격리품 선택")).toHaveAttribute("aria-pressed", "true");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe(raw);
  await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
});
test("장소 전환은Worker를 초기화하지 않고 모드 종료·재시작에서는 선택이 남지 않는다", async ({
  page: p,
}) => {
  await initial(p);
  for (const id of [
    "site-inspection",
    "site-ration",
    "site-quarantine",
  ] as const)
    await clickSite(p, id);
  await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
  await expect(p.getByTestId("labor-iron")).toContainText("철재 4");
  await b(p, "목재 조달 보기").click();
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(b(p, "검수대 선택")).toHaveCount(0);
  await openLaborPanel(p);
  await expect(p.getByTestId("labor-clock")).toContainText("8시간 0분");
  await clickSite(p, "site-inspection");
  await b(p, "일손 배치 다시 시작").click();
  await b(p, "새 일손 배치 확인").click();
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(p.getByTestId("labor-clock")).toContainText("0시간 0분");
});
test("카메라 드래그는 장소 선택을 바꾸지 않고 바닥 클릭만 해제한다", async ({
  page: p,
}) => {
  await enter(p);
  await clickSite(p, "site-inspection");
  const box = await p.locator("canvas").boundingBox();
  if (!box) throw new Error("장면 없음");
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.8, {
    steps: 6,
  });
  await p.mouse.up();
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await b(p, "기본 시점").click();
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
});
