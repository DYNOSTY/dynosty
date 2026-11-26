import { expect, test } from "@playwright/test";
import { SITE_POINTS } from "../../apps/web/src/site-targets.js";
import {
  progressButton as b,
  progressCard as card,
  enterProgress,
  receiveProgress,
  siteAction,
} from "./progress-helpers.js";
import { clickFloor, worldPoint } from "./scene-picking.js";
import { openLaborPanel } from "./workspace.js";

test("선택하지 않은 세 장소의 상태와 현장 번호를 표시하며 클릭·카메라 입력을 가리지 않는다", async ({
  page: p,
}) => {
  await enterProgress(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(card(p, "inspection")).toContainText("검사할 물량 없음");
  await expect(card(p, "ration")).toContainText("8시간");
  await expect(card(p, "quarantine")).toContainText("격리품 없음");
  const marker = p.locator('[data-site-marker="site-inspection"]');
  await expect(marker).toBeVisible();
  const before = await marker.getAttribute("style");
  const point = await worldPoint(p, SITE_POINTS["site-inspection"]);
  await p.mouse.click(point.x, point.y);
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  const box = await p.locator("canvas").boundingBox();
  if (!box) throw new Error("캔버스 없음");
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.72, {
    steps: 8,
  });
  await p.mouse.up();
  await expect.poll(() => marker.getAttribute("style")).not.toBe(before);
  await expect(p.getByTestId("site-name")).toHaveText("검수대");
  await b(p, "기본 시점").click();
  await clickFloor(p);
  await expect(p.getByTestId("site-name")).toHaveCount(0);
  await expect(card(p, "inspection")).toBeVisible();
  await b(p, "마을로 돌아가기").click();
  await expect(p.getByRole("region", { name: "현장 작업 진행" })).toHaveCount(
    0,
  );
  await expect(p.locator(".site-markers")).toHaveCount(0);
});
test("재배치의 부족 이유·진행량을 복원하고 실패 불러오기는 알림·현재 상태·원문을 보존한다", async ({
  page: p,
}) => {
  await receiveProgress(p);
  await expect(p.getByTestId("site-notices")).toContainText("전량 검사 완료");
  await siteAction(p, "격리품", "현장 보완 인원 배정");
  await b(p, "배급소 작업 보기").click();
  for (const n of [3, 4])
    await b(p, `현장 일손 ${n} 배급 준비로 보내기`).click();
  await b(p, "일손 1시간 진행").click();
  await b(p, "현장 일손 2 배급 준비로 보내기").click();
  await clickFloor(p);
  await expect(card(p, "quarantine")).toContainText("60/240분");
  await expect(card(p, "quarantine")).toContainText("1/2명");
  await expect(card(p, "ration")).toContainText("담당 3명");
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
  await expect(card(p, "quarantine")).toContainText("60/240분");
  await expect(card(p, "quarantine")).toContainText("1/2명");
  await expect(card(p, "ration")).toContainText("담당 3명");
  await expect(p.getByTestId("site-notices")).toBeEmpty();
  await b(p, "다음 일손 사건까지").click();
  await expect(p.getByTestId("site-notices")).toContainText("배급 준비 완료");
  await b(p, "격리품 작업 보기").click();
  await b(p, "현장 일손 2 목재 보완으로 보내기").click();
  await b(p, "현장 다음 사건까지").click();
  await expect(card(p, "quarantine")).toContainText("240/240분");
  await expect(
    p.getByTestId("site-notices").getByText(/현장 보완 완료/),
  ).toHaveCount(1);
  await p.evaluate(() =>
    localStorage.setItem("dynosty.labor.saves", "{invalid"),
  );
  await b(p, "일손 배치 불러오기").click();
  await expect(p.getByRole("alert")).toBeVisible();
  await expect(card(p, "quarantine")).toContainText("240/240분");
  await expect(p.getByTestId("site-notices")).toContainText("보완 완료");
  expect(
    await p.evaluate(() => localStorage.getItem("dynosty.labor.saves")),
  ).toBe("{invalid");
  await b(p, "완료 알림 닫기").click();
  await expect(p.getByTestId("site-notices")).toBeEmpty();
  await b(p, "일손 배치 다시 시작").click();
  await b(p, "새 일손 배치 확인").click();
  await expect(card(p, "quarantine")).toContainText("격리품 없음");
  await expect(p.getByTestId("site-notices")).toBeEmpty();
});
test("교환의 대기·예약 인원·재검수·수령 완료를 보여주고 완료 저장을 읽어도 알리지 않는다", async ({
  page: p,
}) => {
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await receiveProgress(p);
  await siteAction(p, "격리품", "현장 불량4 교환 요청");
  await expect(card(p, "quarantine")).toContainText("출발");
  await b(p, "현장 교환 회수 출발").click();
  await expect(card(p, "quarantine")).toContainText("담당 1명");
  await expect(card(p, "inspection")).toContainText("도착 후");
  await b(p, "배급소 작업 보기").click();
  for (const n of [2, 3, 4])
    await b(p, `현장 일손 ${n} 배급 준비로 보내기`).click();
  for (let i = 0; i < 3; i++) await b(p, "현장 다음 사건까지").click();
  await expect(card(p, "inspection")).toContainText("재검수 대기");
  await expect(card(p, "ration")).toContainText("360/360인·분");
  await siteAction(p, "검수대", "현장 교환품4 재검수 시작");
  await expect(card(p, "inspection")).toContainText("0/120분");
  await b(p, "현장 다음 사건까지").click();
  await expect(card(p, "inspection")).toContainText("120/120분");
  await expect(p.getByTestId("site-notices")).toContainText(
    "교환품 재검수 완료",
  );
  await b(p, "현장 합격 교환품4 수령").click();
  await expect(card(p, "quarantine")).toContainText("4/4개");
  await expect(p.getByTestId("site-notices")).toContainText("4개 수령 완료");
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
  await expect(card(p, "quarantine")).toContainText("4/4개");
  await expect(card(p, "inspection")).toContainText("120/120분");
  await expect(card(p, "ration")).toContainText("360/360인·분");
  await expect(p.getByTestId("site-notices")).toBeEmpty();
  expect(errors).toEqual([]);
});
test("자동 시간 tick도 진행량을 갱신하고 일시정지하면 같은 진행량을 유지한다", async ({
  page: p,
}) => {
  await enterProgress(p);
  for (const n of [
    "확장 제안 A 선택",
    "확장 약정하기",
    "확장 수레 출발",
    "다음 일손 사건까지",
    "확장 전량 검사 시작",
  ])
    await b(p, n).click();
  await b(p, "일손 시간 시작").click();
  await expect
    .poll(async () =>
      Number(
        await p
          .getByRole("progressbar", { name: "검수대 전량 검사", exact: true })
          .getAttribute("value"),
      ),
    )
    .toBeGreaterThan(0);
  await b(p, "일손 일시정지").click();
  // 일시정지 명령이 Worker에 닿기 전 마지막 tick이 올 수 있다. 값이 멈춘 뒤 기준을 잡는다.
  const bar = p.getByRole("progressbar", {
    name: "검수대 전량 검사",
    exact: true,
  });
  let raw = await bar.getAttribute("value");
  await expect
    .poll(async () => {
      await p.waitForTimeout(700);
      const next = await bar.getAttribute("value");
      const settled = next === raw;
      raw = next;
      return settled;
    })
    .toBe(true);
  await p.waitForTimeout(1300);
  await expect(
    p.getByRole("progressbar", { name: "검수대 전량 검사", exact: true }),
  ).toHaveAttribute("value", raw ?? "");
  await expect(card(p, "inspection")).toContainText("일시정지");
  await expect(p.getByTestId("site-notices")).toBeEmpty();
});
